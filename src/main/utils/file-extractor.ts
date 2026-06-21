import path from 'path';
import os from 'os';
import { app } from 'electron';
import Seven from 'node-7z';
import child_process, { execSync } from 'child_process';
import fs from 'fs';

type ArchiveKind = 'zip' | 'rar' | '7z' | 'tar' | 'gzip' | 'bzip2' | 'xz' | 'unknown';

export interface ExtractProgress {
  percent: number;
  fileCount?: number;
  file?: string;
}

export interface ExtractArchiveOptions {
  onProgress?: (progress: ExtractProgress) => void;
  isCancelled?: () => boolean;
}

export class FileExtractor {
  private static findExtractedEntry(extractDir: string, entry: string) {
    const normalizedEntry = entry.replace(/\\/g, '/');
    const exactPath = path.resolve(extractDir, normalizedEntry);
    const extractRoot = path.resolve(extractDir);

    if (exactPath.startsWith(extractRoot + path.sep) && fs.existsSync(exactPath)) {
      return exactPath;
    }

    const expectedFileName = normalizedEntry.split('/').pop() || '';
    const stack = [extractDir];

    while (stack.length) {
      const currentDir = stack.pop();
      if (!currentDir) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const dirEntry of entries) {
        const fullPath = path.join(currentDir, dirEntry.name);
        if (dirEntry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (
          dirEntry.isFile() &&
          dirEntry.name.toLowerCase() === expectedFileName.toLowerCase()
        ) {
          return fullPath;
        }
      }
    }

    return '';
  }

  private static listExtractedFiles(extractDir: string) {
    const files: { path: string; size: number }[] = [];
    const stack = [extractDir];

    while (stack.length) {
      const currentDir = stack.pop();
      if (!currentDir) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile()) {
          files.push({
            path: path.relative(extractDir, fullPath).replace(/\\/g, '/'),
            size: fs.statSync(fullPath).size,
          });
        }
      }
    }

    return files;
  }

  private static async extractArchiveFilesWithArgs(
    sevenZipPath: string,
    filePath: string,
    extractTo: string,
    args: string[],
  ) {
    return new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = child_process.spawn(sevenZipPath, [
          'x',
          '-y',
          `-o${extractTo}`,
          filePath,
          ...args,
        ]);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => (stdout += data.toString()));
        child.stderr.on('data', (data) => (stderr += data.toString()));
        child.on('close', (code) =>
          resolve({ code: code || 0, stdout, stderr }),
        );
        child.on('error', reject);
      },
    );
  }

  private static commandExists(commandName: string) {
    const command = process.platform === 'win32' ? 'where' : 'which';
    try {
      execSync(`${command} ${commandName}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private static get7ZipPath(): string | undefined {
    const binaryNames =
      process.platform === 'win32'
        ? ['7z', '7zz', '7za']
        : ['7z', '7zz', '7za'];

    const command = process.platform === 'win32' ? 'where' : 'which';

    for (const binaryName of binaryNames) {
      try {
        execSync(`${command} ${binaryName}`, { stdio: 'pipe' });
        console.log(`Found ${binaryName} in system PATH`);
        return binaryName;
      } catch { }
    }

    // Fallback to bundled version
    console.log('No 7-Zip binary found in PATH, using bundled version');
    const bundledBinaryName = process.platform === 'win32' ? '7z.exe' : '7zz';
    const bundledPath = app.isPackaged
      ? path.join(process.resourcesPath, 'tools', bundledBinaryName)
      : path.join(app.getAppPath(), 'tools', bundledBinaryName);
    return bundledPath;
  }

  private static async extractWith7Zip(
    filePath: string,
    extractTo: string,
    options: ExtractArchiveOptions = {},
  ) {
    return new Promise<void>((resolve, reject) => {
      const sevenZipPath = this.get7ZipPath();
      let lastLoggedPercent = -1;
      let settled = false;

      console.log('[extract-progress][7z] starting', {
        archive: filePath,
        extractTo,
        sevenZipPath,
        node7zProgressEnabled: !!options.onProgress,
      });

      const seven = Seven.extractFull(filePath, extractTo, {
        $progress: !!options.onProgress,
        $bin: sevenZipPath,
      });

      const cancelTimer = setInterval(() => {
        if (!options.isCancelled?.() || settled) return;

        settled = true;
        clearInterval(cancelTimer);
        console.log('[extract-progress][7z] cancelled, destroying stream', {
          archive: filePath,
        });
        seven.destroy(new Error('Extraction cancelled'));
        reject(new Error('Extraction cancelled'));
      }, 200);

      seven.on('progress', (progress) => {
        if (options.isCancelled?.()) return;
        const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
        if (percent === 0 || percent === 100 || percent - lastLoggedPercent >= 5) {
          lastLoggedPercent = percent;
          console.log('[extract-progress][7z] progress event', {
            percent,
            fileCount: progress.fileCount,
            file: progress.file,
          });
        }
        options.onProgress?.({
          percent,
          fileCount: progress.fileCount,
          file: progress.file,
        });
      });

      seven.on('end', () => {
        if (settled) return;
        settled = true;
        clearInterval(cancelTimer);

        if (options.isCancelled?.()) {
          reject(new Error('Extraction cancelled'));
          return;
        }

        if (!this.verifyExtraction(extractTo)) {
          reject(new Error('No files found after extraction'));
          return;
        }

        options.onProgress?.({ percent: 100 });
        console.log('[extract-progress][7z] complete', { archive: filePath });
        resolve();
      });

      seven.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearInterval(cancelTimer);
        console.warn('[extract-progress][7z] error', {
          archive: filePath,
          error: err?.message || err,
        });
        reject(err);
      });
    });
  }

  private static async extractWithTar(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      const child = child_process.spawn('tar', ['-xf', filePath, '-C', extractTo]);

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`tar extraction failed with code ${code}`));
          return;
        }

        if (!this.verifyExtraction(extractTo)) {
          reject(new Error('No files found after extraction'));
          return;
        }

        resolve();
      });

      child.on('error', reject);
    });
  }

  private static async extractWithUnzip(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      const child = child_process.spawn('unzip', ['-o', '-q', filePath, '-d', extractTo]);
      child.on('close', (code) => {
        if (code === 0 || code === 1) {
          if (!this.verifyExtraction(extractTo)) {
            reject(new Error('No files found after unzip extraction'));
            return;
          }
          resolve();
        } else {
          reject(new Error(`unzip exited with code ${code}`));
        }
      });
      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  private static verifyExtraction(extractTo: string) {
    try {
      const contents = fs.readdirSync(extractTo).filter((f) => {
        const fullPath = path.join(extractTo, f);
        return (
          fs.existsSync(fullPath) &&
          (fs.statSync(fullPath).isDirectory() || !f.match(/\.(rar|zip|7z)$/i))
        );
      });

      console.log('Extracted contents:', contents);
      return contents.length > 0;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }

  private static getArchiveKind(filePath: string): ArchiveKind {
    const ext = path.extname(filePath).toLowerCase();

    try {
      const buffer = fs.readFileSync(filePath);

      if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        return 'zip';
      }

      if (buffer.length >= 7 && buffer.subarray(0, 7).toString('ascii') === 'Rar!\x1a\x07') {
        return 'rar';
      }

      if (
        buffer.length >= 6 &&
        buffer[0] === 0x37 &&
        buffer[1] === 0x7a &&
        buffer[2] === 0xbc &&
        buffer[3] === 0xaf &&
        buffer[4] === 0x27 &&
        buffer[5] === 0x1c
      ) {
        return '7z';
      }

      if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return 'gzip';
      }

      if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'BZh') {
        return 'bzip2';
      }

      if (
        buffer.length >= 6 &&
        buffer[0] === 0xfd &&
        buffer.subarray(1, 6).toString('ascii') === '7zXZ'
      ) {
        return 'xz';
      }

      if (buffer.length >= 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar') {
        return 'tar';
      }
    } catch (error) {
      console.warn('[FileExtractor] Failed to inspect archive signature:', error);
    }

    if (ext === '.zip') return 'zip';
    if (ext === '.rar') return 'rar';
    if (ext === '.7z') return '7z';
    if (ext === '.tar') return 'tar';
    if (ext === '.gz' || ext === '.tgz') return 'gzip';
    if (ext === '.bz2') return 'bzip2';
    if (ext === '.xz') return 'xz';

    return 'unknown';
  }

  private static async extractWithSystem7Zip(
    filePath: string,
    extractTo: string,
    options: ExtractArchiveOptions = {},
  ) {
    const commands = ['7z', '7zz', '7za'];
    let commandToUse: string | null = null;

    for (const cmd of commands) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        commandToUse = cmd;
        break;
      } catch {
        // Try the next binary name.
      }
    }

    if (!commandToUse) {
      throw new Error(
        "Cannot extract this archive. Please install the 'p7zip-full' package (or equivalent) in your system.",
      );
    }

    return new Promise<void>((resolve, reject) => {
      let lastLoggedPercent = -1;
      let settled = false;
      const args = ['x', '-y', '-bsp1', '-bso1', `-o${extractTo}`, filePath];

      console.log('[extract-progress][system-7z] starting', {
        archive: filePath,
        extractTo,
        command: commandToUse,
        args,
        progressEnabled: !!options.onProgress,
      });

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const matches = text.matchAll(/(\d{1,3})%/g);

        for (const match of matches) {
          const percent = Math.max(0, Math.min(100, Number(match[1]) || 0));
          if (percent === 0 || percent === 100 || percent - lastLoggedPercent >= 5) {
            lastLoggedPercent = percent;
            console.log('[extract-progress][system-7z] progress output', {
              percent,
            });
          }
          options.onProgress?.({ percent });
        }
      };

      const child = child_process.spawn(commandToUse!, args);
      const cancelTimer = setInterval(() => {
        if (!options.isCancelled?.() || settled) return;

        console.log('[extract-progress][system-7z] cancelled, killing process', {
          archive: filePath,
          pid: child.pid,
        });
        child.kill('SIGTERM');
      }, 200);

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearInterval(cancelTimer);

        if (options.isCancelled?.()) {
          reject(new Error('Extraction cancelled'));
          return;
        }

        if (code === 0 || code === 1 || code === 2) {
          if (this.verifyExtraction(extractTo)) {
            options.onProgress?.({ percent: 100 });
            console.log('[extract-progress][system-7z] complete', {
              archive: filePath,
              code,
            });
            resolve();
          } else {
            reject(new Error(`System ${commandToUse} extracted successfully but output dir is empty`));
          }
        } else {
          console.warn('[extract-progress][system-7z] failed', {
            archive: filePath,
            code,
          });
          reject(new Error(`System ${commandToUse} failed with code ${code}`));
        }
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearInterval(cancelTimer);
        console.warn('[extract-progress][system-7z] error', {
          archive: filePath,
          error: error?.message || error,
        });
        reject(error);
      });
    });
  }

  static async extractArchive(
    filePath: string,
    extractTo: string,
    options: ExtractArchiveOptions = {},
  ) {
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    try {
      await this.extractWith7Zip(filePath, extractTo, options);
    } catch (sevenZipError: any) {
      if (
        options.isCancelled?.() ||
        String(sevenZipError?.message || sevenZipError)
          .toLowerCase()
          .includes('cancelled')
      ) {
        console.log('[extract-progress][archive] cancelled, skipping extraction fallbacks', {
          archive: filePath,
        });
        throw new Error('Extraction cancelled');
      }

      console.log('[FileExtractor] bundled 7-Zip extraction failed or binary missing, trying fallback...', sevenZipError?.message || sevenZipError);

      const archiveKind = this.getArchiveKind(filePath);
      const ext = path.extname(filePath).toLowerCase();
      console.log(`[FileExtractor] Detected archive kind: ${archiveKind} (${ext || 'no extension'})`);

      if (archiveKind === 'zip') {
        try {
          await this.extractWithUnzip(filePath, extractTo);
          return;
        } catch (unzipError: any) {
          throw new Error(
            `ZIP extraction failed. 7-Zip error: ${sevenZipError?.message || sevenZipError}. unzip error: ${unzipError?.message || unzipError}`,
          );
        }
      }

      if (archiveKind === '7z' || archiveKind === 'rar') {
        console.log(`[FileExtractor] Trying to extract ${archiveKind} using system 7z/7zz/7za...`);
        try {
          await this.extractWithSystem7Zip(filePath, extractTo, options);
          return;
        } catch (system7zError: any) {
          console.log('[FileExtractor] System 7z/7za fallback failed:', system7zError?.message || system7zError);
          throw system7zError;
        }
      }

      if (
        archiveKind === 'tar' ||
        archiveKind === 'gzip' ||
        archiveKind === 'bzip2' ||
        archiveKind === 'xz'
      ) {
        await this.extractWithTar(filePath, extractTo);
      } else {
        throw new Error(
          `Downloaded file is not a recognized archive (${ext || 'no extension'}). 7-Zip error: ${sevenZipError?.message || sevenZipError}`,
        );
      }
    }
  }
  static async extractFppMetadata(filePath: string, extractTo: string): Promise<void> {
    if (!fs.existsSync(extractTo)) fs.mkdirSync(extractTo, { recursive: true });

    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        console.log('[FileExtractor] 7-Zip not found, falling back to native unzip for metadata extraction.');
        return new Promise((resolve, reject) => {
          const child = child_process.spawn('unzip', [
            '-q', '-o', filePath,
            'manifest.xml', 'downloads.json', 'thumbnail.*',
            '-d', extractTo
          ]);

          child.on('close', (code) => {
            if (code === 0 || code === 1 || code === 11) resolve();
            else reject(new Error(`unzip fallback metadata extraction failed with code ${code}`));
          });
          child.on('error', reject);
        });
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(sevenZipPath!, [
        'e', filePath,
        `-o${extractTo}`,
        'manifest.xml',
        'downloads.json',
        'thumbnail.*',
        '-y'
      ]);

      child.on('close', (code) => {
        if (code === 0 || code === 1 || code === 2) {
          resolve();
        } else {
          reject(new Error(`7z metadata extraction failed with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }

  static async listFppContents(filePath: string): Promise<string[]> {
    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        console.log('[FileExtractor] 7-Zip not found, falling back to native unzip for listing contents.');
        return new Promise((resolve, reject) => {
          const child = child_process.spawn('unzip', ['-Z1', filePath]);
          let output = '';
          child.stdout.on('data', (d) => output += d.toString());
          child.on('close', (code) => {
            if (code !== 0 && code !== 1) return reject(new Error(`unzip list failed with code ${code}`));
            resolve(output.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean));
          });
          child.on('error', reject);
        });
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(sevenZipPath!, [
        'l', '-slt', filePath
      ]);

      let output = '';
      child.stdout.on('data', (d) => output += d.toString());

      child.on('close', (code) => {
        if (code !== 0 && code !== 1 && code !== 2) {
          return reject(new Error(`7z list failed with code ${code}`));
        }

        const files: string[] = [];
        const lines = output.split(/[\r\n]+/);
        for (const line of lines) {
          if (line.startsWith('Path = ')) {
            const parsedPath = line.substring(7).trim();
            if (parsedPath && parsedPath !== '-' && !path.isAbsolute(parsedPath)) {
              files.push(parsedPath);
            }
          }
        }
        resolve(files);
      });
      child.on('error', reject);
    });
  }

  static async estimateArchiveUncompressedSize(filePath: string): Promise<number> {
    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch {
      try {
        const fallbackSize = fs.statSync(filePath).size;
        console.log('[extract-progress][estimate] 7z unavailable, using archive size', {
          archive: filePath,
          fallbackSize,
        });
        return fallbackSize;
      } catch {
        console.warn('[extract-progress][estimate] failed, returning 0', { archive: filePath });
        return 0;
      }
    }

    return new Promise((resolve) => {
      console.log('[extract-progress][estimate] listing archive', {
        archive: filePath,
        sevenZipPath,
      });
      const child = child_process.spawn(sevenZipPath!, ['l', '-slt', filePath]);
      let output = '';

      child.stdout.on('data', (data) => (output += data.toString()));
      child.on('close', () => {
        let totalSize = 0;
        const blocks = output.split(/\r?\n\r?\n/);

        for (const block of blocks) {
          const attributes = block.match(/^Attributes = (.*)$/m)?.[1] || '';
          const sizeText = block.match(/^Size = (\d+)$/m)?.[1];
          const size = sizeText ? Number(sizeText) : 0;

          if (!attributes.includes('D') && Number.isFinite(size)) {
            totalSize += size;
          }
        }

        if (totalSize > 0) {
          console.log('[extract-progress][estimate] uncompressed size detected', {
            archive: filePath,
            totalSize,
          });
          resolve(totalSize);
          return;
        }

        try {
          const fallbackSize = fs.statSync(filePath).size;
          console.log('[extract-progress][estimate] no listed size, using archive size', {
            archive: filePath,
            fallbackSize,
          });
          resolve(fallbackSize);
        } catch {
          console.warn('[extract-progress][estimate] no listed size and stat failed', {
            archive: filePath,
          });
          resolve(0);
        }
      });
      child.on('error', () => {
        try {
          const fallbackSize = fs.statSync(filePath).size;
          console.warn('[extract-progress][estimate] list failed, using archive size', {
            archive: filePath,
            fallbackSize,
          });
          resolve(fallbackSize);
        } catch {
          console.warn('[extract-progress][estimate] list and stat failed', {
            archive: filePath,
          });
          resolve(0);
        }
      });
    });
  }

  static async extractArchiveFiles(
    filePath: string,
    entries: string[],
    extractTo: string,
  ): Promise<void> {
    if (!entries.length) return;
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        return new Promise((resolve, reject) => {
          const child = child_process.spawn('unzip', [
            '-o',
            filePath,
            ...entries,
            '-d',
            extractTo,
          ]);
          child.on('close', (code) => {
            if (code === 0 || code === 1 || code === 11) resolve();
            else reject(new Error(`unzip selected files failed with code ${code}`));
          });
          child.on('error', reject);
        });
      }

      throw error;
    }

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(sevenZipPath!, [
        'x',
        '-y',
        `-o${extractTo}`,
        filePath,
        ...entries.map((entry) => `-i!${entry}`),
      ]);

      child.on('close', (code) => {
        if (code === 0 || code === 1 || code === 2) resolve();
        else reject(new Error(`7z selected files extraction failed with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  static async readArchiveFile(filePath: string, entry: string): Promise<Buffer> {
    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        return new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          const child = child_process.spawn('unzip', ['-p', filePath, entry]);

          child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          child.on('close', (code) => {
            if (code === 0 || code === 1) resolve(Buffer.concat(chunks));
            else reject(new Error(`unzip read file failed with code ${code}`));
          });
          child.on('error', reject);
        });
      }

      throw error;
    }

    const stdoutBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const child = child_process.spawn(sevenZipPath!, [
        'e',
        '-so',
        filePath,
        entry,
      ]);

      child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      child.on('close', (code) => {
        if (code === 0 || code === 1 || code === 2) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`7z read file failed with code ${code}`));
        }
      });
      child.on('error', reject);
    });

    if (stdoutBuffer.length > 0) {
      return stdoutBuffer;
    }

    const extractDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fightplanner-archive-read-'),
    );

    try {
      const variants = [
        [entry],
        [`-i!${entry}`],
        [`-ir!${entry}`],
        [`-ir!*${entry.split(/[\\/]/).pop() || entry}`],
      ];

      for (const args of variants) {
        const result = await this.extractArchiveFilesWithArgs(
          sevenZipPath!,
          filePath,
          extractDir,
          args,
        );
        const extractedFiles = this.listExtractedFiles(extractDir);
        console.log('[FileExtractor] README fallback extract:', {
          args,
          code: result.code,
          files: extractedFiles.slice(0, 10),
          stderr: result.stderr.trim().slice(0, 500),
        });

        const extractedPath = this.findExtractedEntry(extractDir, entry);
        if (extractedPath) {
          const buffer = fs.readFileSync(extractedPath);
          if (buffer.length > 0) return buffer;
        }
      }

      if (this.commandExists('unar')) {
        const unarResult = await new Promise<{
          code: number;
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          const child = child_process.spawn('unar', [
            '-q',
            '-f',
            '-D',
            '-o',
            extractDir,
            filePath,
            entry,
          ]);
          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => (stdout += data.toString()));
          child.stderr.on('data', (data) => (stderr += data.toString()));
          child.on('close', (code) =>
            resolve({ code: code || 0, stdout, stderr }),
          );
          child.on('error', reject);
        });
        const extractedFiles = this.listExtractedFiles(extractDir);
        console.log('[FileExtractor] README unar fallback extract:', {
          code: unarResult.code,
          files: extractedFiles.slice(0, 10),
          stderr: unarResult.stderr.trim().slice(0, 500),
        });

        const extractedPath = this.findExtractedEntry(extractDir, entry);
        if (extractedPath) {
          const buffer = fs.readFileSync(extractedPath);
          if (buffer.length > 0) return buffer;
        }
      }

      const extractedPath = this.findExtractedEntry(extractDir, entry);
      if (!extractedPath) return stdoutBuffer;

      return fs.readFileSync(extractedPath);
    } finally {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures for temporary README extraction.
      }
    }
  }
}
