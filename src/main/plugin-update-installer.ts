import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FileExtractor } from './utils/file-extractor';

const execAsync = promisify(exec);

export type PluginInstallResult =
  | {
      success: true;
      pluginPath: string;
      actualFileName: string;
    }
  | {
      success: false;
      error: string;
    };

export type ModInstallResult =
  | {
      success: true;
      resultingMods: {
        modPath: string;
        modName: string;
      }[];
    }
  | {
      success: false;
      error: string;
    };

export default class PluginUpdateInstaller {
  static async downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);

      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'FightPlanner-Plugin-Updater',
            },
          },
          (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              file.close();
              fs.unlinkSync(targetPath);
              const redirectUrl = new URL(res.headers.location, url).toString();
              return this.downloadFile(redirectUrl, targetPath)
                .then(resolve)
                .catch(reject);
            }

            if (res.statusCode !== 200) {
              file.close();
              fs.unlinkSync(targetPath);
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            res.pipe(file);

            file.on('finish', () => {
              file.close();
              resolve(targetPath);
            });
          },
        )
        .on('error', (err) => {
          file.close();
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
          reject(err);
        });
    });
  }

  static findNroFile(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && file.toLowerCase().endsWith('.nro')) {
        return filePath;
      }

      if (stat.isDirectory()) {
        const found = this.findNroFile(filePath);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  static async installUpdate(
    downloadUrl: string,
    pluginPath: string,
  ): Promise<PluginInstallResult> {
    try {
      if (!downloadUrl) {
        return {
          success: false,
          error: 'No download URL available',
        };
      }

      const tempDir = os.tmpdir();
      const isZip =
        downloadUrl.toLowerCase().endsWith('.zip') ||
        downloadUrl.toLowerCase().includes('.zip');

      let downloadedFilePath;
      let nroFilePath;

      let actualFileName;

      if (isZip) {
        const tempZipName = `plugin-download-${Date.now()}.zip`;
        downloadedFilePath = path.join(tempDir, tempZipName);

        await this.downloadFile(downloadUrl, downloadedFilePath);

        if (!fs.existsSync(downloadedFilePath)) {
          return {
            success: false,
            error: 'Downloaded ZIP file not found',
          };
        }

        const extractDir = path.join(tempDir, `plugin-extract-${Date.now()}`);
        await FileExtractor.extractArchive(downloadedFilePath, extractDir);

        nroFilePath = this.findNroFile(extractDir);

        if (!nroFilePath) {
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
          if (fs.existsSync(downloadedFilePath)) {
            fs.unlinkSync(downloadedFilePath);
          }
          return {
            success: false,
            error: 'No .nro file found in the ZIP archive',
          };
        }
        actualFileName = path.basename(nroFilePath);
      } else {
        // Try to determine filename from URL
        try {
          const urlUrl = new URL(downloadUrl);
          const urlFilename = path.basename(urlUrl.pathname);
          if (urlFilename && urlFilename.toLowerCase().endsWith('.nro')) {
            actualFileName = decodeURIComponent(urlFilename);
          }
        } catch (e) {
          console.error('Error parsing filename from URL:', e);
        }

        // Fallback to pluginPath basename if URL parsing failed
        if (!actualFileName) {
          actualFileName = path.basename(pluginPath);
        }

        const tempFileName = `plugin-update-${Date.now()}.nro`;
        downloadedFilePath = path.join(tempDir, tempFileName);
        await this.downloadFile(downloadUrl, downloadedFilePath);
        nroFilePath = downloadedFilePath;
      }

      if (!fs.existsSync(nroFilePath)) {
        return {
          success: false,
          error: 'Downloaded file not found',
        };
      }

      // actualFileName is already set correctly above
      const pluginDir = path.dirname(pluginPath);
      const finalPluginPath = path.join(pluginDir, actualFileName);

      if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
      }

      if (fs.existsSync(finalPluginPath)) {
        const backupPath = finalPluginPath + '.backup';
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.copyFileSync(finalPluginPath, backupPath);
        fs.unlinkSync(finalPluginPath);
      }

      fs.copyFileSync(nroFilePath, finalPluginPath);

      if (fs.existsSync(downloadedFilePath)) {
        fs.unlinkSync(downloadedFilePath);
      }

      if (isZip && nroFilePath !== downloadedFilePath) {
        const extractDir = path.dirname(nroFilePath);
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
      }

      return {
        success: true,
        pluginPath: finalPluginPath,
        actualFileName: actualFileName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
