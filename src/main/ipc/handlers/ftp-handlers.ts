import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import FTPClient from '../../ftp-client';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import { AppHandlers } from './app-handlers';
import { resolveDrivePath } from '../../utils/drive-detector';

interface TransferItem {
  localPath: string;
  itemName: string;
  kind: 'directory' | 'file';
  fileCount: number;
}

interface MtpTransferFile {
  id: string;
  localPath: string;
  remotePath: string;
  size: number;
  itemName: string;
  itemIndex: number;
  totalItems: number;
}

interface FtpTransferProgressPayload {
  status: 'uploading';
  currentMod: number;
  totalMods: number;
  transferredCount: number;
  totalFiles: number;
  progress: number;
  currentModName?: string;
  currentFileName?: string;
}

const mtpTransferFiles = new Map<string, string>();

/**
 * Copy directory recursively
 */
function _filesMatch(src: string, dest: string): boolean {
  if (!fs.existsSync(dest)) {
    return false;
  }

  const srcStats = fs.statSync(src);
  const destStats = fs.statSync(dest);
  if (!srcStats.isFile() || !destStats.isFile()) {
    return false;
  }

  if (srcStats.size !== destStats.size) {
    return false;
  }

  const srcFile = fs.openSync(src, 'r');
  const destFile = fs.openSync(dest, 'r');
  const srcBuffer = Buffer.alloc(64 * 1024);
  const destBuffer = Buffer.alloc(64 * 1024);

  try {
    let position = 0;
    while (position < srcStats.size) {
      const bytesToRead = Math.min(srcBuffer.length, srcStats.size - position);
      const srcBytesRead = fs.readSync(
        srcFile,
        srcBuffer,
        0,
        bytesToRead,
        position,
      );
      const destBytesRead = fs.readSync(
        destFile,
        destBuffer,
        0,
        bytesToRead,
        position,
      );

      if (
        srcBytesRead !== destBytesRead ||
        !srcBuffer
          .subarray(0, srcBytesRead)
          .equals(destBuffer.subarray(0, destBytesRead))
      ) {
        return false;
      }

      position += srcBytesRead;
    }

    return true;
  } finally {
    fs.closeSync(srcFile);
    fs.closeSync(destFile);
  }
}

function _copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    let copiedCount = 0;
    fs.readdirSync(src).forEach((childItemName) => {
      copiedCount += _copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
    return copiedCount;
  } else {
    if (_filesMatch(src, dest)) {
      console.log(`Skipped existing file: ${dest}`);
      return 0;
    }

    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.copyFileSync(src, dest);
    return 1;
  }

  return 0;
}

function _countFilesRecursive(dirPath: string): number {
  let count = 0;
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    if (fs.statSync(itemPath).isDirectory()) {
      count += _countFilesRecursive(itemPath);
    } else {
      count++;
    }
  }

  return count;
}

function _collectModDirectories(modsPath?: string | null): TransferItem[] {
  if (!modsPath || !fs.existsSync(modsPath)) {
    return [];
  }

  const items: TransferItem[] = [];
  for (const file of fs.readdirSync(modsPath)) {
    const localPath = path.join(modsPath, file);

    if (!fs.statSync(localPath).isDirectory()) {
      continue;
    }

    items.push({
      localPath,
      itemName: file,
      kind: 'directory',
      fileCount: _countFilesRecursive(localPath),
    });
  }

  return items;
}

function _collectPluginFiles(pluginsPath?: string | null): TransferItem[] {
  if (!pluginsPath || !fs.existsSync(pluginsPath)) {
    return [];
  }

  const items: TransferItem[] = [];
  for (const file of fs.readdirSync(pluginsPath)) {
    const localPath = path.join(pluginsPath, file);
    const stats = fs.statSync(localPath);

    if (!stats.isFile() || path.extname(file).toLowerCase() !== '.nro') {
      continue;
    }

    items.push({
      localPath,
      itemName: file,
      kind: 'file',
      fileCount: 1,
    });
  }

  return items;
}

function _collectFilesForMtpTransfer(
  transferItems: Array<TransferItem & { remoteBasePath: string }>,
): MtpTransferFile[] {
  const files: MtpTransferFile[] = [];
  const totalItems = transferItems.length;

  mtpTransferFiles.clear();

  const addFile = (
    localPath: string,
    remotePath: string,
    item: TransferItem,
    itemIndex: number,
  ) => {
    const id = `${Date.now()}-${files.length}-${path.basename(localPath)}`;
    const size = fs.statSync(localPath).size;

    mtpTransferFiles.set(id, localPath);
    files.push({
      id,
      localPath,
      remotePath: remotePath.replace(/\\/g, '/'),
      size,
      itemName: item.itemName,
      itemIndex,
      totalItems,
    });
  };

  const walkDirectory = (
    localDir: string,
    remoteDir: string,
    item: TransferItem,
    itemIndex: number,
  ) => {
    for (const entry of fs.readdirSync(localDir)) {
      const localPath = path.join(localDir, entry);
      const remotePath = path.posix.join(remoteDir, entry);
      const stats = fs.statSync(localPath);

      if (stats.isDirectory()) {
        walkDirectory(localPath, remotePath, item, itemIndex);
      } else if (stats.isFile()) {
        addFile(localPath, remotePath, item, itemIndex);
      }
    }
  };

  transferItems.forEach((item, index) => {
    const remotePath = path.posix.join(item.remoteBasePath, item.itemName);

    if (item.kind === 'directory') {
      walkDirectory(item.localPath, remotePath, item, index + 1);
    } else {
      addFile(item.localPath, remotePath, item, index + 1);
    }
  });

  return files;
}

function _normalizeRemotePath(
  remotePath: string | null | undefined,
  defaultPath: string,
): string {
  let normalized = (remotePath || defaultPath).trim().replace(/\\/g, '/');

  if (!normalized || normalized === '/' || normalized === '/switch') {
    normalized = defaultPath;
  }

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  normalized = normalized.replace(/\/+$/g, '');

  return normalized;
}

/**
 * Send mods to Switch via local drive.
 */
async function _sendModsToDrive(config: Config) {
  try {
    const driveIdentifier = config.switchDriveLetter;
    if (!driveIdentifier) {
      throw new Error('Drive not specified');
    }

    const drivePath = await resolveDrivePath(driveIdentifier);

    if (!drivePath || !fs.existsSync(drivePath)) {
      throw new Error(
        `Drive path ${driveIdentifier} not found or not accessible`,
      );
    }

    const targetModsPath = path.join(drivePath, 'ultimate', 'mods');
    const targetPluginsPath = path.join(
      drivePath,
      'ultimate',
      'contents',
      '01006A800016E000',
      'romfs',
      'skyline',
      'plugins',
    );

    if (!fs.existsSync(targetModsPath)) {
      fs.mkdirSync(targetModsPath, { recursive: true });
      console.log(`Created directory: ${targetModsPath}`);
    }

    let transferredCount = 0;

    for (const item of _collectModDirectories(config.modsPath)) {
      const targetModPath = path.join(targetModsPath, item.itemName);
      const copiedCount = _copyRecursiveSync(item.localPath, targetModPath);
      transferredCount += copiedCount;
      console.log(
        `Successfully copied mod: ${item.itemName} (${copiedCount} files)`,
      );
    }

    const pluginItems = _collectPluginFiles(config.pluginsPath);
    if (pluginItems.length > 0 && !fs.existsSync(targetPluginsPath)) {
      fs.mkdirSync(targetPluginsPath, { recursive: true });
      console.log(`Created directory: ${targetPluginsPath}`);
    }

    for (const item of pluginItems) {
      const targetPluginPath = path.join(targetPluginsPath, item.itemName);
      if (_filesMatch(item.localPath, targetPluginPath)) {
        console.log(`Skipped existing plugin: ${item.itemName}`);
        continue;
      }

      fs.copyFileSync(item.localPath, targetPluginPath);
      transferredCount += item.fileCount;
      console.log(`Successfully copied plugin: ${item.itemName}`);
    }

    console.log(
      `Successfully transferred ${transferredCount} files to drive ${config.switchDriveLetter}:`,
    );
    return { success: true, transferredCount };
  } catch (error) {
    handleError(error, 'send-mods-to-drive');
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
  }
}

export type FtpHandlers = typeof FtpHandlers;

export interface Config {
  switchIp: string;
  switchPort: number;
  switchFtpUser?: string | null;
  switchFtpPassword?: string | null;
  switchFtpPath?: string | null;
  switchFtpModsPath?: string | null;
  switchFtpPluginsPath?: string | null;
  switchDriveLetter: string;
  switchTransferMethod: 'ftp' | 'drive' | 'mtp';
  modsPath: string;
  pluginsPath?: string | null;
  recentDownloads: Array<{
    id: string;
    modName: string;
    folderPath: string | null;
  }>;
}

const FtpHandlers = {
  ['send-mods-to-switch']: async (
    common: BaseHandlerArg,
    config: Config,
  ): HandlerResponse<{
    transferredCount: number;
  }> => {
    const transferMethod = config.switchTransferMethod || 'ftp';

    if (transferMethod === 'drive') {
      return await _sendModsToDrive(config);
    }

    const ftpClient = new FTPClient();
    let transferredCount = 0;

    try {
      const remoteModsPath = _normalizeRemotePath(
        config.switchFtpModsPath || config.switchFtpPath,
        '/ultimate/mods',
      );
      const remotePluginsPath = _normalizeRemotePath(
        config.switchFtpPluginsPath,
        '/ultimate/contents/01006A800016E000/romfs/skyline/plugins',
      );
      const transferItems = [
        ..._collectModDirectories(config.modsPath).map((item) => ({
          ...item,
          remoteBasePath: remoteModsPath,
        })),
        ..._collectPluginFiles(config.pluginsPath).map((item) => ({
          ...item,
          remoteBasePath: remotePluginsPath,
        })),
      ];

      const totalMods = transferItems.length;
      const totalFiles = transferItems.reduce(
        (sum, item) => sum + item.fileCount,
        0,
      );
      const sendProgress = (payload: FtpTransferProgressPayload) => {
        common.event.sender.send('ftp-transfer-progress', payload);
      };

      console.log('Starting FTP transfer to Switch:', {
        ip: config.switchIp,
        port: config.switchPort,
        user: config.switchFtpUser || 'ftp',
        remoteModsPath,
        remotePluginsPath,
      });

      await ftpClient.connect(
        config.switchIp,
        config.switchPort,
        config.switchFtpUser || 'ftp',
        config.switchFtpPassword || 'ftp',
      );

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: 1,
          totalMods,
          transferredCount: 0,
          totalFiles,
          progress: 0,
          currentModName: transferItems[0].itemName,
        });
      }

      for (const [index, item] of transferItems.entries()) {
        try {
          const remoteItemPath = `${item.remoteBasePath}/${item.itemName}`;

          sendProgress({
            status: 'uploading',
            currentMod: index + 1,
            totalMods,
            transferredCount,
            totalFiles,
            progress:
              totalFiles > 0
                ? Math.min(
                    100,
                    Math.round((transferredCount / totalFiles) * 100),
                  )
                : 0,
            currentModName: item.itemName,
          });

          let count = 0;
          if (item.kind === 'directory') {
            count = await ftpClient.uploadDirectory(
              item.localPath,
              remoteItemPath,
              {
                baseTransferredCount: transferredCount,
                totalFiles,
                currentModIndex: index + 1,
                totalMods,
                currentModName: item.itemName,
                onFileUploaded: (progressUpdate) => {
                  sendProgress({
                    status: 'uploading',
                    currentMod: progressUpdate.currentModIndex || index + 1,
                    totalMods: progressUpdate.totalMods || totalMods,
                    transferredCount: progressUpdate.transferredCount,
                    totalFiles: progressUpdate.totalFiles || totalFiles,
                    progress: progressUpdate.progress,
                    currentModName:
                      progressUpdate.currentModName || item.itemName,
                    currentFileName: progressUpdate.currentFileName,
                  });
                },
              },
            );
          } else {
            count = (await ftpClient.uploadFile(item.localPath, remoteItemPath))
              ? 1
              : 0;
            const nextTransferredCount = transferredCount + count;
            sendProgress({
              status: 'uploading',
              currentMod: index + 1,
              totalMods,
              transferredCount: nextTransferredCount,
              totalFiles,
              progress:
                totalFiles > 0
                  ? Math.min(
                      100,
                      Math.round((nextTransferredCount / totalFiles) * 100),
                    )
                  : 0,
              currentModName: item.itemName,
              currentFileName: item.itemName,
            });
          }

          transferredCount += count;
          console.log(
            `Successfully sent ${item.kind}: ${item.itemName} (${count} files)`,
          );
        } catch (modError) {
          console.error(`Error sending ${item.itemName}:`, modError);
        }
      }

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: totalMods,
          totalMods,
          transferredCount,
          totalFiles,
          progress: totalFiles > 0 ? 100 : 0,
          currentModName: transferItems[totalMods - 1].itemName,
        });
      }

      await ftpClient.disconnect();

      console.log(
        `Successfully transferred ${transferredCount} files to Switch`,
      );
      return { success: true, transferredCount };
    } catch (error) {
      handleError(error, 'send-mods-to-switch');
      try {
        await ftpClient.disconnect();
      } catch (disconnectError) {}
      return createErrorResponse(ErrorCodes.FTP_TRANSFER_ERROR, error.message);
    }
  },
} as const;

const MtpHandlers = {
  ['prepare-mtp-transfer']: async (
    common: BaseHandlerArg,
    config: Config,
  ): HandlerResponse<{
    files: Omit<MtpTransferFile, 'localPath'>[];
    totalFiles: number;
  }> => {
    try {
      const remoteModsPath = _normalizeRemotePath(
        config.switchFtpModsPath || config.switchFtpPath,
        '/ultimate/mods',
      );
      const remotePluginsPath = _normalizeRemotePath(
        config.switchFtpPluginsPath,
        '/ultimate/contents/01006A800016E000/romfs/skyline/plugins',
      );
      const transferItems = [
        ..._collectModDirectories(config.modsPath).map((item) => ({
          ...item,
          remoteBasePath: remoteModsPath,
        })),
        ..._collectPluginFiles(config.pluginsPath).map((item) => ({
          ...item,
          remoteBasePath: remotePluginsPath,
        })),
      ];
      const files = _collectFilesForMtpTransfer(transferItems).map(
        ({ localPath, ...file }) => file,
      );

      return {
        success: true,
        files,
        totalFiles: files.length,
      };
    } catch (error) {
      handleError(error, 'prepare-mtp-transfer');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['read-mtp-transfer-file']: async (
    common: BaseHandlerArg,
    fileId: string,
  ): HandlerResponse<{
    bytes: Uint8Array;
  }> => {
    try {
      const filePath = mtpTransferFiles.get(fileId);
      if (!filePath || !fs.existsSync(filePath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'MTP transfer file not found',
        );
      }

      return {
        success: true,
        bytes: new Uint8Array(fs.readFileSync(filePath)),
      };
    } catch (error) {
      handleError(error, 'read-mtp-transfer-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },
} as const;

export type MtpHandlers = typeof MtpHandlers;

/**
 * Register all IPC handlers related to FTP operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerFtpHandlers(ipcMain: IpcMain) {
  const handlers = { ...FtpHandlers, ...MtpHandlers };

  for (const channel of Object.keys(handlers) as Array<keyof typeof handlers>) {
    const handler = handlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
