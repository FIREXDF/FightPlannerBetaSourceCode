import { IpcMain } from 'electron';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { getProtocolHandler } from '../../main-protocol-setup';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import { FileExtractor } from '../../utils/file-extractor';

export type ProtocolHandlers = typeof ProtocolHandlers;

type GameBananaReadmeScanResult = {
  readmes: { path: string; content: string }[];
};

function isReadmeFileName(fileName: string) {
  const normalized = fileName.toLowerCase();
  return (
    /^read[\s_-]*me(?:[^\w].*)?$/i.test(fileName) ||
    normalized === 'readme' ||
    normalized.startsWith('readme.')
  );
}

function findReadmeArchiveEntries(entries: string[]) {
  return entries
    .filter((entry) => {
      const normalizedEntry = entry.replace(/\\/g, '/');
      const fileName = normalizedEntry.split('/').pop() || '';
      return (
        normalizedEntry &&
        !normalizedEntry.endsWith('/') &&
        !path.isAbsolute(normalizedEntry) &&
        !normalizedEntry.split('/').includes('..') &&
        isReadmeFileName(fileName)
      );
    })
    .slice(0, 5);
}

function decodeReadmeBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le').replace(/^\uFEFF/, '');
  }

  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

const ProtocolHandlers = {
  ['confirm-protocol-install']: async (
    common: BaseHandlerArg,
    url: string,
    downloadId: string,
  ) => {
    try {
      const protocolHandler = getProtocolHandler();

      if (protocolHandler) {
        await protocolHandler.proceedWithInstall(downloadId);
        return { success: true };
      }

      return createErrorResponse(
        ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
        'Protocol handler not available',
      );
    } catch (error) {
      handleError(error, 'confirm-protocol-install');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['cancel-protocol-install']: async (
    common: BaseHandlerArg,
    downloadId: string,
  ) => {
    try {
      const protocolHandler = getProtocolHandler();
      if (protocolHandler && protocolHandler.pendingInstalls) {
        protocolHandler.pendingInstalls.delete(downloadId);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      handleError(error, 'cancel-protocol-install');
      return { success: false };
    }
  },

  ['fetch-gamebanana-preview']: async (
    common: BaseHandlerArg,
    modId: string,
  ): HandlerResponse<{
    imageUrl: string;
  }> => {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;

      return new Promise((resolve) => {
        https
          .get(apiUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                const json = JSON.parse(data);

                if (
                  json._aPreviewMedia &&
                  json._aPreviewMedia._aImages &&
                  json._aPreviewMedia._aImages.length > 0
                ) {
                  const firstImage = json._aPreviewMedia._aImages[0];
                  if (firstImage._sBaseUrl && firstImage._sFile) {
                    const imageUrl =
                      firstImage._sBaseUrl + '/' + firstImage._sFile;
                    resolve({ success: true, imageUrl });
                    return;
                  }
                }

                resolve({
                  success: false,
                  error: 'No preview image found',
                });
              } catch (error) {
                resolve(
                  createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
                );
              }
            });
          })
          .on('error', (error) => {
            resolve(
              createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
            );
          });
      });
    } catch (error) {
      handleError(error, 'fetch-gamebanana-preview');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['fetch-gamebanana-details']: async (
    common: BaseHandlerArg,
    modelName: string,
    submissionId: string,
  ): HandlerResponse<any> => {
    try {
      const safeModelName = encodeURIComponent(modelName || 'Mod');
      const safeSubmissionId = encodeURIComponent(submissionId);
      const fetchGameBananaJson = (apiUrl: string) =>
        new Promise<any>((resolve, reject) => {
          https
            .get(apiUrl, (res) => {
              let data = '';

              res.on('data', (chunk) => {
                data += chunk;
              });

              res.on('end', () => {
                try {
                  const json = JSON.parse(data);

                  if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`GameBanana returned ${res.statusCode}`));
                    return;
                  }

                  if (json?._sErrorCode) {
                    reject(
                      new Error(
                        json?._aErrorData?._csvProperties?._sErrorMessage ||
                          json._sErrorCode,
                      ),
                    );
                    return;
                  }

                  resolve(json);
                } catch (error) {
                  reject(error);
                }
              });
            })
            .on('error', (error) => {
              reject(error);
            });
        });

      const profileUrl = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=%40gbprofile`;
      const descriptionProperties = [
        '_nDownloadCount',
        '_sText',
        '_sDescription',
        ...(String(modelName || 'Mod').toLowerCase() === 'wip'
          ? []
          : ['_aRequirements']),
      ].join(',');
      const textUrl = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=${encodeURIComponent(descriptionProperties)}`;
      const [profileData, textResult] = await Promise.all([
        fetchGameBananaJson(profileUrl),
        fetchGameBananaJson(textUrl).catch((error) => {
          console.warn(
            '[Protocol] Failed to fetch GameBanana description:',
            error.message,
          );
          return {};
        }),
      ]);

      return { success: true, data: { ...profileData, ...textResult } };
    } catch (error) {
      handleError(error, 'fetch-gamebanana-details');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['fetch-gamebanana-files']: async (
    common: BaseHandlerArg,
    modelName: string,
    submissionId: string,
  ): HandlerResponse<{ files: any[] }> => {
    try {
      const safeModelName = encodeURIComponent(modelName || 'Mod');
      const safeSubmissionId = encodeURIComponent(submissionId);
      const apiUrl = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=_aFiles,_aModManagerIntegrations`;

      return new Promise((resolve) => {
        https
          .get(apiUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                const json = JSON.parse(data);

                if (res.statusCode && res.statusCode >= 400) {
                  resolve({
                    success: false,
                    error: `GameBanana returned ${res.statusCode}`,
                  });
                  return;
                }

                const integrations = json?._aModManagerIntegrations || {};
                const getFightPlannerDownloadUrl = (fileId: string) => {
                  const entries = Array.isArray(integrations[fileId])
                    ? integrations[fileId]
                    : [];
                  const integration = entries.find((entry) => {
                    const alias = String(
                      entry?._sModManagerAlias || '',
                    ).toLowerCase();
                    const installer = String(
                      entry?._sInstallerName || '',
                    ).toLowerCase();
                    return (
                      entry?._sDownloadUrl?.startsWith('fightplanner:') &&
                      (alias === 'fightplanner' || installer === 'fightplanner')
                    );
                  });
                  return integration?._sDownloadUrl || '';
                };

                const files = json?._aFiles;
                const fileEntries = Array.isArray(files)
                  ? files
                  : Object.values(files || {});
                const enrichedFileEntries = fileEntries.map((file: any) => {
                  const fileId = file?._idRow ? String(file._idRow) : '';
                  const fightPlannerUrl = fileId
                    ? getFightPlannerDownloadUrl(fileId)
                    : '';
                  return fightPlannerUrl
                    ? { ...file, _sFightPlannerDownloadUrl: fightPlannerUrl }
                    : file;
                });

                resolve({ success: true, files: enrichedFileEntries });
              } catch (error) {
                resolve(
                  createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
                );
              }
            });
          })
          .on('error', (error) => {
            resolve(
              createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
            );
          });
      });
    } catch (error) {
      handleError(error, 'fetch-gamebanana-files');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['scan-gamebanana-readme']: async (
    common: BaseHandlerArg,
    downloadUrl: string,
  ): HandlerResponse<GameBananaReadmeScanResult> => {
    const protocolHandler = getProtocolHandler();
    if (!protocolHandler) {
      return createErrorResponse(
        ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
        'Protocol handler not available',
      );
    }

    let downloadedPath = '';

    try {
      const cleanUrl = String(downloadUrl || '').replace(/^fightplanner:/i, '');
      const resolvedUrl =
        (await protocolHandler.resolveGameBananaDownloadUrl(cleanUrl)) ||
        cleanUrl;

      if (!/^https?:\/\//i.test(resolvedUrl)) {
        return { success: true, readmes: [] };
      }

      const scanId = `gamebanana_readme_${Date.now()}`;
      console.log('[GameBanana README] scanning:', resolvedUrl);
      downloadedPath = await protocolHandler.downloadMod(
        resolvedUrl,
        scanId,
        () => {},
      );

      const archiveEntries = await FileExtractor.listFppContents(downloadedPath);
      const readmeEntries = findReadmeArchiveEntries(archiveEntries);
      console.log(
        `[GameBanana README] archive entries: ${archiveEntries.length}, readme entries: ${readmeEntries.length}`,
      );
      if (!readmeEntries.length) {
        console.log(
          '[GameBanana README] no README found. First entries:',
          archiveEntries.slice(0, 20),
        );
      } else {
        console.log('[GameBanana README] README entries:', readmeEntries);
      }

      if (!readmeEntries.length) {
        return { success: true, readmes: [] };
      }

      const readmes: { path: string; content: string }[] = [];
      for (const entry of readmeEntries) {
        try {
          const buffer = await FileExtractor.readArchiveFile(
            downloadedPath,
            entry,
          );
          console.log(
            `[GameBanana README] read stdout bytes for ${entry}: ${buffer.length}`,
          );
          if (buffer.length > 256 * 1024) continue;

          readmes.push({
            path: entry.replace(/\\/g, '/'),
            content: decodeReadmeBuffer(buffer).slice(0, 120000),
          });
        } catch (readError) {
          console.warn(
            `[GameBanana README] failed to read README entry ${entry}:`,
            readError,
          );
        }
      }

      console.log(
        `[GameBanana README] read ${readmes.length}/${readmeEntries.length} README file(s):`,
        readmes.map((readme) => readme.path),
      );
      if (readmes[0]?.content) {
        console.log(
          '[GameBanana README] full README content:',
          readmes[0].content,
        );
      }

      return { success: true, readmes };
    } catch (error) {
      handleError(error, 'scan-gamebanana-readme');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    } finally {
      try {
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          fs.unlinkSync(downloadedPath);
        }
      } catch (cleanupError) {
        console.warn(
          '[Protocol] Failed to remove README scan archive:',
          cleanupError,
        );
      }

    }
  },
} as const;

/**
 * Register all IPC handlers related to protocol operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerProtocolHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ProtocolHandlers) as Array<
    keyof typeof ProtocolHandlers
  >) {
    const handler = ProtocolHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
