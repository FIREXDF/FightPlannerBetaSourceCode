import * as ftp from 'basic-ftp';
import { enterPassiveModeIPv4 } from 'basic-ftp';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { Writable } from 'stream';

export interface UploadFileProgress {
  currentFileName: string;
  fileSize: number;
  bytesTransferred: number;
}

export interface UploadFileProcessed {
  currentFileName: string;
  fileSize: number;
  copied: boolean;
}

export interface UploadDirectoryOptions {
  onFileStarted?: (file: UploadFileProgress) => void;
  onFileProgress?: (file: UploadFileProgress) => void;
  onFileProcessed?: (file: UploadFileProcessed) => void;
}

export default class FTPClient {
  client: ftp.Client;

  constructor() {
    this.client = new ftp.Client();
    this.client.prepareTransfer = enterPassiveModeIPv4;
  }

  get closed() {
    return this.client.closed;
  }

  async connect(host, port = 5000, user = 'ftp', password = 'ftp') {
    await this.client.access({
      host,
      port,
      user,
      password,
      secure: false,
    });
    console.log(`Connected to FTP server at ${host}:${port}`);
  }

  disconnect() {
    this.client.close();
    console.log('FTP connection closed');
  }

  async uploadDirectory(
    localPath: string,
    remotePath: string,
    options: UploadDirectoryOptions = {},
  ): Promise<number> {
    const stats = await fs.stat(localPath);
    if (!stats.isDirectory()) {
      throw new Error(`${localPath} is not a directory`);
    }

    const normalizedRemotePath = remotePath.replace(/\\/g, '/');
    const entries = await fs.readdir(localPath, { withFileTypes: true });
    let copiedCount = 0;

    for (const entry of entries) {
      const localFilePath = path.join(localPath, entry.name);
      const remoteFilePath = `${normalizedRemotePath}/${entry.name}`;

      if (entry.isDirectory()) {
        copiedCount += await this.uploadDirectory(
          localFilePath,
          remoteFilePath,
          options,
        );
      } else if (entry.isFile()) {
        if (
          await this.uploadFileWithProgress(
            localFilePath,
            remoteFilePath,
            options,
          )
        ) {
          copiedCount++;
        }
      }
    }

    return copiedCount;
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    options: UploadDirectoryOptions = {},
  ) {
    return await this.uploadFileWithProgress(localPath, remotePath, options);
  }

  private async uploadFileWithProgress(
    localPath: string,
    remotePath: string,
    options: UploadDirectoryOptions,
  ): Promise<boolean> {
    const normalizedRemotePath = remotePath.replace(/\\/g, '/');
    const fileStats = await fs.stat(localPath);
    const currentFileName = path.basename(localPath);

    options.onFileStarted?.({
      currentFileName,
      fileSize: fileStats.size,
      bytesTransferred: 0,
    });

    if (
      await this.remoteFileMatchesFile(
        localPath,
        normalizedRemotePath,
        fileStats.size,
      )
    ) {
      console.log(`Skipped identical FTP file: ${normalizedRemotePath}`);
      options.onFileProcessed?.({
        currentFileName,
        fileSize: fileStats.size,
        copied: false,
      });
      return false;
    }

    const remoteDir = path.posix.dirname(normalizedRemotePath);
    await this.client.ensureDir(remoteDir);
    await this.uploadAtomically(
      localPath,
      normalizedRemotePath,
      fileStats.size,
      options,
    );

    options.onFileProcessed?.({
      currentFileName,
      fileSize: fileStats.size,
      copied: true,
    });
    console.log(`Uploaded FTP file: ${normalizedRemotePath}`);
    return true;
  }

  private async uploadAtomically(
    localPath: string,
    remotePath: string,
    fileSize: number,
    options: UploadDirectoryOptions,
  ) {
    const suffix = randomUUID().slice(0, 12);
    const temporaryPath = this.createTemporaryRemotePath(
      remotePath,
      'new',
      suffix,
    );
    const backupPath = this.createTemporaryRemotePath(
      remotePath,
      'backup',
      suffix,
    );

    this.client.trackProgress((info) => {
      options.onFileProgress?.({
        currentFileName: path.basename(localPath),
        fileSize,
        bytesTransferred: Math.min(fileSize, info.bytesOverall),
      });
    });

    try {
      await this.client.uploadFrom(localPath, temporaryPath);
    } catch (error) {
      if (!this.client.closed) {
        await this.removeIfPresent(temporaryPath);
      }
      throw error;
    } finally {
      this.client.trackProgress();
    }

    try {
      await this.client.rename(temporaryPath, remotePath);
      return;
    } catch (directRenameError) {
      if (this.client.closed) {
        throw directRenameError;
      }
    }

    let backupCreated = false;
    try {
      await this.client.rename(remotePath, backupPath);
      backupCreated = true;
      await this.client.rename(temporaryPath, remotePath);
      await this.removeIfPresent(backupPath);
    } catch (error) {
      if (backupCreated && !this.client.closed) {
        try {
          await this.client.rename(backupPath, remotePath);
        } catch (restoreError) {
          console.error('Unable to restore FTP backup:', restoreError);
        }
      }
      if (!this.client.closed) {
        await this.removeIfPresent(temporaryPath);
      }
      throw error;
    }
  }

  private async removeIfPresent(remotePath: string) {
    try {
      await this.client.remove(remotePath);
    } catch (error) {
      // The path may not exist anymore after a successful rename.
    }
  }

  private createTemporaryRemotePath(
    remotePath: string,
    kind: string,
    uniqueSuffix: string,
  ) {
    const directory = path.posix.dirname(remotePath);
    const fileName = path.posix.basename(remotePath);
    const extension = path.posix.extname(fileName);
    const baseName = extension
      ? fileName.slice(0, -extension.length)
      : fileName;
    const suffix = `.fightplanner-${kind}-${uniqueSuffix}`;
    const maxBaseLength = Math.max(1, 255 - suffix.length - extension.length);
    return path.posix.join(
      directory,
      `${baseName.slice(0, maxBaseLength)}${suffix}${extension}`,
    );
  }

  private async remoteFileMatchesFile(
    localPath: string,
    remotePath: string,
    localSize: number,
  ) {
    let remoteSize: number;
    try {
      remoteSize = await this.client.size(remotePath);
    } catch (error) {
      if (this.client.closed) {
        throw error;
      }
      return false;
    }

    if (remoteSize !== localSize) {
      return false;
    }

    const [localHash, remoteHash] = await Promise.all([
      this.hashLocalFile(localPath),
      this.hashRemoteFile(remotePath),
    ]);
    return localHash === remoteHash;
  }

  private async hashLocalFile(localPath: string) {
    const hash = createHash('sha256');

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(localPath);
      stream.on('error', reject);
      hash.on('error', reject);
      hash.on('finish', resolve);
      stream.pipe(hash);
    });

    return hash.digest('hex');
  }

  private async hashRemoteFile(remotePath: string) {
    const hash = createHash('sha256');
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    });

    await this.client.downloadTo(sink, remotePath);
    return hash.digest('hex');
  }
}
