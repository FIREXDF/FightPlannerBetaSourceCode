import { IpcMain } from 'electron';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import FTPClient from '../../../ftp-client';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../../utils/error-handler';
import { HandlerResponse } from '../../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../../types/common';
import { sendModsToDrive } from './drive-transfer';
import {
  collectModDirectories,
  collectPluginFiles,
  TransferItem,
} from './switch-transfer-files';
import {
  SwitchTransferConfig,
  SwitchTransferProgressPayload,
} from './switch-transfer-types';

interface MtpTransferFile {
  id: string;
  localPath: string;
  remotePath: string;
  size: number;
  itemName: string;
  itemIndex: number;
  totalItems: number;
}

const MTP_READ_CHUNK_SIZE = 1024 * 1024;
const MTP_SESSION_TTL_MS = 30 * 60 * 1000;
const mtpTransferSessions = new Map<
  string,
  Map<string, { localPath: string; size: number }>
>();
const mtpTransferSessionTimeouts = new Map<string, NodeJS.Timeout>();

function releaseMtpTransferSession(transferId: string) {
  mtpTransferSessions.delete(transferId);
  const timeout = mtpTransferSessionTimeouts.get(transferId);
  if (timeout) {
    clearTimeout(timeout);
    mtpTransferSessionTimeouts.delete(transferId);
  }
}

async function _collectFilesForMtpTransfer(
  transferItems: Array<TransferItem & { remoteBasePath: string }>,
  sessionFiles: Map<string, { localPath: string; size: number }>,
): Promise<MtpTransferFile[]> {
  const files: MtpTransferFile[] = [];
  const totalItems = transferItems.length;

  const addFile = async (
    localPath: string,
    remotePath: string,
    item: TransferItem,
    itemIndex: number,
  ) => {
    const id = randomUUID();
    const size = (await fs.stat(localPath)).size;

    sessionFiles.set(id, { localPath, size });
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

  const walkDirectory = async (
    localDir: string,
    remoteDir: string,
    item: TransferItem,
    itemIndex: number,
  ) => {
    for (const entry of await fs.readdir(localDir, { withFileTypes: true })) {
      const localPath = path.join(localDir, entry.name);
      const remotePath = path.posix.join(remoteDir, entry.name);

      if (entry.isDirectory()) {
        await walkDirectory(localPath, remotePath, item, itemIndex);
      } else if (entry.isFile()) {
        await addFile(localPath, remotePath, item, itemIndex);
      }
    }
  };

  for (const [index, item] of transferItems.entries()) {
    const remotePath = path.posix.join(item.remoteBasePath, item.itemName);

    if (item.kind === 'directory') {
      await walkDirectory(item.localPath, remotePath, item, index + 1);
    } else {
      await addFile(item.localPath, remotePath, item, index + 1);
    }
  }

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

export type SwitchTransferHandlers = typeof SwitchTransferHandlers;

const SwitchTransferHandlers = {
  ['send-mods-to-switch']: async (
    common: BaseHandlerArg,
    config: SwitchTransferConfig,
  ): HandlerResponse<{
    transferredCount: number;
  }> => {
    const transferMethod = config.switchTransferMethod || 'ftp';
    const sendProgress = (payload: SwitchTransferProgressPayload) => {
      common.event.sender.send('switch-transfer-progress', {
        transferMethod,
        ...payload,
      });
    };

    if (transferMethod === 'drive') {
      return await sendModsToDrive(config, sendProgress);
    }

    const ftpClient = new FTPClient();

    try {
      if (
        !config.switchIp ||
        !Number.isInteger(config.switchPort) ||
        config.switchPort < 1 ||
        config.switchPort > 65535
      ) {
        throw new Error('Invalid FTP host or port');
      }

      const remoteModsPath = _normalizeRemotePath(
        config.switchFtpModsPath || config.switchFtpPath,
        '/ultimate/mods',
      );
      const remotePluginsPath = _normalizeRemotePath(
        config.switchFtpPluginsPath,
        '/atmosphere/contents/01006A800016E000/romfs/skyline/plugins',
      );
      const [modItems, pluginItems] = await Promise.all([
        collectModDirectories(config.modsPath),
        collectPluginFiles(config.pluginsPath),
      ]);
      const transferItems = [
        ...modItems.map((item) => ({
          ...item,
          remoteBasePath: remoteModsPath,
        })),
        ...pluginItems.map((item) => ({
          ...item,
          remoteBasePath: remotePluginsPath,
        })),
      ];

      const totalMods = transferItems.length;
      const totalFiles = transferItems.reduce(
        (sum, item) => sum + item.fileCount,
        0,
      );
      const totalBytes = transferItems.reduce(
        (sum, item) => sum + item.totalBytes,
        0,
      );
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

      let processedCount = 0;
      let copiedCount = 0;
      let processedBytes = 0;
      const failedItems: string[] = [];

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
          const emitProgress = (
            currentFileName?: string,
            currentFileBytes = 0,
          ) => {
            const progress =
              totalBytes > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((processedBytes + currentFileBytes) / totalBytes) * 100,
                    ),
                  )
                : totalFiles > 0
                  ? Math.min(
                      100,
                      Math.round((processedCount / totalFiles) * 100),
                    )
                  : 100;

            sendProgress({
              status: 'uploading',
              currentMod: index + 1,
              totalMods,
              transferredCount: processedCount,
              copiedCount,
              totalFiles,
              progress,
              currentModName: item.itemName,
              currentFileName,
            });
          };
          const uploadOptions = {
            onFileStarted: (file) => {
              emitProgress(file.currentFileName);
            },
            onFileProgress: (file) => {
              emitProgress(file.currentFileName, file.bytesTransferred);
            },
            onFileProcessed: (file) => {
              processedCount++;
              processedBytes += file.fileSize;
              if (file.copied) {
                copiedCount++;
              }
              emitProgress(file.currentFileName);
            },
          };

          if (item.kind === 'directory') {
            await ftpClient.uploadDirectory(
              item.localPath,
              remoteItemPath,
              uploadOptions,
            );
          } else {
            await ftpClient.uploadFile(
              item.localPath,
              remoteItemPath,
              uploadOptions,
            );
          }

          console.log(`Successfully processed ${item.kind}: ${item.itemName}`);
        } catch (modError) {
          console.error(`Error sending ${item.itemName}:`, modError);
          failedItems.push(
            `${item.itemName}: ${
              modError instanceof Error ? modError.message : String(modError)
            }`,
          );
          if (ftpClient.closed) {
            break;
          }
        }
      }

      if (failedItems.length > 0) {
        throw new Error(
          `FTP transfer incomplete (${failedItems.length} item(s) failed): ${failedItems.join('; ')}`,
        );
      }

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: totalMods,
          totalMods,
          transferredCount: processedCount,
          copiedCount,
          totalFiles,
          progress: totalFiles > 0 ? 100 : 0,
          currentModName: transferItems[totalMods - 1].itemName,
        });
      }

      await ftpClient.disconnect();

      console.log(
        `Successfully copied ${copiedCount} files to Switch over FTP`,
      );
      return { success: true, transferredCount: copiedCount };
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
    config: SwitchTransferConfig,
  ): HandlerResponse<{
    files: Omit<MtpTransferFile, 'localPath'>[];
    totalFiles: number;
    transferId: string;
  }> => {
    const transferId = randomUUID();
    const sessionFiles = new Map<string, { localPath: string; size: number }>();

    try {
      const remoteModsPath = _normalizeRemotePath(
        config.switchFtpModsPath || config.switchFtpPath,
        '/ultimate/mods',
      );
      const remotePluginsPath = _normalizeRemotePath(
        config.switchFtpPluginsPath,
        '/atmosphere/contents/01006A800016E000/romfs/skyline/plugins',
      );
      const [modItems, pluginItems] = await Promise.all([
        collectModDirectories(config.modsPath),
        collectPluginFiles(config.pluginsPath),
      ]);
      const transferItems = [
        ...modItems.map((item) => ({
          ...item,
          remoteBasePath: remoteModsPath,
        })),
        ...pluginItems.map((item) => ({
          ...item,
          remoteBasePath: remotePluginsPath,
        })),
      ];
      const files = (
        await _collectFilesForMtpTransfer(transferItems, sessionFiles)
      ).map(({ localPath, ...file }) => file);
      mtpTransferSessions.set(transferId, sessionFiles);
      const sessionTimeout = setTimeout(
        () => releaseMtpTransferSession(transferId),
        MTP_SESSION_TTL_MS,
      );
      sessionTimeout.unref();
      mtpTransferSessionTimeouts.set(transferId, sessionTimeout);

      return {
        success: true,
        files,
        totalFiles: files.length,
        transferId,
      };
    } catch (error) {
      releaseMtpTransferSession(transferId);
      handleError(error, 'prepare-mtp-transfer');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['read-mtp-transfer-file-chunk']: async (
    common: BaseHandlerArg,
    transferId: string,
    fileId: string,
    offset: number,
    requestedLength: number,
  ): HandlerResponse<{
    bytes: Uint8Array;
  }> => {
    try {
      const sessionFiles = mtpTransferSessions.get(transferId);
      const entry = sessionFiles?.get(fileId);
      if (!entry) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'MTP transfer file not found',
        );
      }

      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(requestedLength) ||
        requestedLength <= 0 ||
        requestedLength > MTP_READ_CHUNK_SIZE
      ) {
        return createErrorResponse(
          ErrorCodes.FILE_READ_ERROR,
          'Invalid MTP file chunk range',
        );
      }

      const length = Math.min(requestedLength, entry.size - offset);
      if (length <= 0) {
        return { success: true, bytes: new Uint8Array() };
      }

      const handle = await fs.open(entry.localPath, 'r');
      try {
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return {
          success: true,
          bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead),
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      handleError(error, 'read-mtp-transfer-file-chunk');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['release-mtp-transfer']: async (
    common: BaseHandlerArg,
    transferId: string,
  ): HandlerResponse<{ released: boolean }> => {
    try {
      releaseMtpTransferSession(transferId);
      return {
        success: true,
        released: true,
      };
    } catch (error) {
      handleError(error, 'release-mtp-transfer');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },
} as const;

export type MtpHandlers = typeof MtpHandlers;

/**
 * Register all IPC handlers related to Switch transfers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerSwitchTransferHandlers(ipcMain: IpcMain) {
  const handlers = { ...SwitchTransferHandlers, ...MtpHandlers };

  for (const channel of Object.keys(handlers) as Array<keyof typeof handlers>) {
    const handler = handlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
