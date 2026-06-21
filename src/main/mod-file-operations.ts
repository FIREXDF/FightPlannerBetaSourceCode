import path from 'path';
import { promises as fsp } from 'node:fs';
import * as fse from 'fs-extra';

/**
 * Utility functions for mod file operations
 */
export class ModFileOperations {
  static async getAllModFiles(
    modPath: string,
    arrayOfFiles: string[] = [],
    baseModPath?: string,
  ): Promise<string[]> {
    // Set baseModPath on first call
    const basePath = baseModPath ?? modPath;
    const files = await fsp.readdir(modPath);

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(modPath, file);
        const stat = await fsp.stat(filePath);

        if (stat.isDirectory()) {
          // Push relative path for directories
          const relativePath = path.relative(basePath, filePath);
          arrayOfFiles.push(relativePath);
          await ModFileOperations.getAllModFiles(
            filePath,
            arrayOfFiles,
            basePath,
          );
        } else {
          // Push relative path for files
          const relativePath = path.relative(basePath, filePath);
          arrayOfFiles.push(relativePath);
        }
      }),
    );

    return arrayOfFiles;
  }

  static async renameModFile(
    modPath: string,
    oldPath: string,
    newPath: string,
  ): Promise<boolean> {
    try {
      const fullOldPath = path.join(modPath, oldPath);
      const fullNewPath = path.join(modPath, newPath);

      // Create parent directories if they don't exist
      await fsp.mkdir(path.dirname(fullNewPath), { recursive: true });

      // Perform the rename
      try {
        await fsp.rename(fullOldPath, fullNewPath);
      } catch (error: any) {
        if (error.code === 'EPERM') {
          // If rename fails due to EPERM, try copying and deleting
          await fse.copy(fullOldPath, fullNewPath);
          await fse.remove(fullOldPath);
        } else {
          throw error;
        }
      }

      return true;
    } catch (error) {
      console.error('Error renaming mod file:', error);
      throw error;
    }
  }

  static async deleteModFile(
    modPath: string,
    filePath: string,
  ): Promise<boolean> {
    const fullPath = path.join(modPath, filePath);
    try {
      const stat = await fsp.stat(fullPath);

      if (stat.isDirectory()) {
        await fsp.rm(fullPath, { recursive: true });
      } else {
        await fsp.unlink(fullPath);
      }

      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn('File or directory does not exist:', fullPath);
        return false; // Indicate that the file or directory was not found
      }

      console.error('Error deleting mod file:', error);

      throw error;
    }
  }

  static async writeModFile(
    filePath: string,
    content: string,
  ): Promise<boolean> {
    try {
      // File doesn't exist, check content for encoding hints
      if (
        content.includes('encoding="utf-16"') ||
        content.includes("encoding='utf-16'")
      ) {
        // Check if content already starts with BOM (U+FEFF / UTF-16 LE BOM character)
        const hasBOM = content.charCodeAt(0) === 0xfeff;

        // If BOM already present, remove it from content since we'll add it as bytes
        const contentWithoutBOM = hasBOM ? content.substring(1) : content;

        // Add BOM for UTF-16LE and write as buffer
        const bom = Buffer.from([0xff, 0xfe]);
        const contentBuffer = Buffer.from(contentWithoutBOM, 'utf16le');
        const fullBuffer = Buffer.concat([bom, contentBuffer]);

        await fsp.writeFile(filePath, fullBuffer);

        return true;
      }

      await fsp.writeFile(filePath, content, 'utf8');

      return true;
    } catch (error) {
      console.error('Error writing mod file:', error);
      throw error;
    }
  }

  static async readModFile(filePath: string): Promise<string> {
    try {
      // Read first few bytes as buffer to detect encoding
      const buffer = await fsp.readFile(filePath);

      let encoding: 'utf16le' | 'utf8';

      // Check BOM (Byte Order Mark)
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        // UTF-16 LE BOM
        encoding = 'utf16le';
      } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        // UTF-16 BE BOM
        encoding = 'utf16le'; // Node.js handles BE with 'utf16le' by swapping bytes
      } else if (
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
      ) {
        // UTF-8 BOM
        encoding = 'utf8';
      } else {
        // No BOM, check XML declaration
        const start = buffer.toString('utf8', 0, Math.min(200, buffer.length));

        if (
          start.includes('encoding="utf-16"') ||
          start.includes("encoding='utf-16'")
        ) {
          encoding = 'utf16le';
        } else {
          // Try to detect if it looks like UTF-16 by checking for null bytes
          let nullCount = 0;
          for (let i = 0; i < Math.min(100, buffer.length); i++) {
            if (buffer[i] === 0) nullCount++;
          }
          // If more than 30% null bytes, likely UTF-16
          if (nullCount > 30) {
            encoding = 'utf16le';
          } else {
            encoding = 'utf8';
          }
        }
      }

      return buffer.toString(encoding);
    } catch (error) {
      console.error('Error reading mod file:', error);
      throw error;
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }

  static async createDirectory(dirPath: string): Promise<void> {
    try {
      await fsp.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  }
}
