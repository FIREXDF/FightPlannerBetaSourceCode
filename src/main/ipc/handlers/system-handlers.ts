import { shell, IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getProtocolHandler } from '../../main-protocol-setup';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { PATHS, TEMP_FOLDERS } from '../../config';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import store from '../../store';
import type { ChildProcess } from 'child_process';

let emulatorProcess: ChildProcess | null = null;

const EMULATOR_START_TIMEOUT_MS = 1500;

export type SystemHandlers = typeof SystemHandlers;

const resolveMacAppExecutable = (appPath: string): string | null => {
  const macOsDir = path.join(appPath, 'Contents', 'MacOS');

  if (!fs.existsSync(macOsDir)) {
    return null;
  }

  const executable = fs
    .readdirSync(macOsDir)
    .map((fileName) => path.join(macOsDir, fileName))
    .find((filePath) => {
      const stats = fs.statSync(filePath);
      return stats.isFile() && (stats.mode & 0o111) !== 0;
    });

  return executable || null;
};

const ensureExecutableOnLinux = (filePath: string) => {
  if (process.platform !== 'linux') {
    return;
  }

  const stats = fs.statSync(filePath);
  if (stats.isFile() && (stats.mode & 0o111) === 0) {
    fs.chmodSync(filePath, stats.mode | 0o755);
  }
};

const getEmulatorArgs = (
  emulatorType: string,
  gamePath: string,
  fullscreen: boolean,
) => {
  switch (emulatorType.toLowerCase()) {
    case 'yuzu':
      return fullscreen ? ['-f', '-g', gamePath] : ['-g', gamePath];
    case 'ryujinx':
      return [gamePath];
    default:
      return [gamePath];
  }
};

const waitForProcessStart = (
  childProcess: ChildProcess,
): Promise<{ success: true } | { success: false; error: string }> => {
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      childProcess.off('error', onError);
      childProcess.off('exit', onExit);
      childProcess.off('spawn', onSpawn);
    };

    const settle = (
      result: { success: true } | { success: false; error: string },
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(
      () => settle({ success: true }),
      EMULATOR_START_TIMEOUT_MS,
    );

    const onSpawn = () => {
      if (childProcess.pid) {
        console.log(
          '[launch-emulator] Spawned emulator process PID:',
          childProcess.pid,
        );
      }
    };

    const onError = (error: Error) => {
      settle({ success: false, error: error.message });
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) {
        settle({ success: true });
        return;
      }

      const exitReason =
        code !== null
          ? `exited immediately with code ${code}`
          : `exited immediately with signal ${signal}`;
      settle({ success: false, error: `Emulator ${exitReason}` });
    };

    childProcess.once('spawn', onSpawn);
    childProcess.once('error', onError);
    childProcess.once('exit', onExit);
  });
};

const SystemHandlers = {
  ['open-url']: async (common: BaseHandlerArg, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      handleError(error, 'open-url');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['open-fightplanner-link']: async (common: BaseHandlerArg, url: string) => {
    try {
      if (!url || !url.startsWith('fightplanner:')) {
        return createErrorResponse(
          ErrorCodes.INVALID_PROTOCOL_LINK,
          'Invalid fightplanner link',
        );
      }
      const handler = getProtocolHandler();
      if (handler) {
        handler.handleDeepLink(url);
        return { success: true };
      } else {
        return createErrorResponse(
          ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
          'Protocol handler not initialized',
        );
      }
    } catch (error) {
      handleError(error, 'open-fightplanner-link');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['cancel-download']: async (common: BaseHandlerArg, downloadId: string) => {
    try {
      const handler = getProtocolHandler();
      if (handler) {
        return handler.cancelDownload(downloadId);
      } else {
        return createErrorResponse(
          ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
          'Protocol handler not initialized',
        );
      }
    } catch (error) {
      handleError(error, 'cancel-download');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['resume-download']: async (common: BaseHandlerArg, downloadId: string) => {
    try {
      const handler = getProtocolHandler();
      if (handler) {
        return handler.resumeDownload(downloadId);
      } else {
        return createErrorResponse(
          ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
          'Protocol handler not initialized',
        );
      }
    } catch (error) {
      handleError(error, 'resume-download');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['open-config-file']: async (common: BaseHandlerArg) => {
    try {
      if (store && store.path) {
        await shell.openPath(store.path);
        return { success: true };
      }
      return createErrorResponse(
        ErrorCodes.FILE_NOT_FOUND,
        'Configuration file path not found',
      );
    } catch (error) {
      handleError(error, 'open-config-file');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['get-logs-path']: async (common: BaseHandlerArg) => {
    return PATHS.logsDir();
  },

  ['read-log-file']: async (common: BaseHandlerArg, filePath: string) => {
    try {
      const logsDir = PATHS.logsDir();
      if (!filePath.startsWith(logsDir)) {
        throw new Error('Invalid log file path');
      }
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      handleError(error, 'read-log-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['clear-temp-files']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    deletedFiles: number;
    deletedFolders: number;
    totalSize: string;
  }> => {
    try {
      const tempPath = PATHS.tempDir();
      const foldersToClean = TEMP_FOLDERS;

      let deletedFiles = 0;
      let deletedFolders = 0;
      let totalSize = 0;

      for (const folderName of foldersToClean) {
        const folderPath = path.join(tempPath, folderName);

        if (fs.existsSync(folderPath)) {
          const calculateSize = (dirPath) => {
            let size = 0;
            try {
              const items = fs.readdirSync(dirPath);
              for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                  size += calculateSize(itemPath);
                  deletedFolders++;
                } else {
                  size += stats.size;
                  deletedFiles++;
                }
              }
            } catch (err) {
              console.warn('Error calculating size:', err);
            }
            return size;
          };

          totalSize += calculateSize(folderPath);

          try {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`Cleaned temporary folder: ${folderPath}`);
          } catch (err) {
            console.warn(`Failed to delete ${folderPath}:`, err.message);
          }
        }
      }

      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      return {
        success: true,
        deletedFiles,
        deletedFolders,
        totalSize: sizeMB,
      };
    } catch (error) {
      handleError(error, 'clear-temp-files');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['launch-emulator']: async (
    common: BaseHandlerArg,
    emulatorType: string,
    emulatorPath: string,
    gamePath: string,
    fullscreen: boolean,
    force: boolean = false,
  ): HandlerResponse => {
    try {
      if (!force && emulatorProcess && emulatorProcess.pid) {
        try {
          process.kill(emulatorProcess.pid, 0);
          console.log(
            '[launch-emulator] Emulator process is already running (PID:',
            emulatorProcess.pid,
            ')',
          );
          return createErrorResponse(
            'EMULATOR_ALREADY_RUNNING' as any,
            'emulator_already_running',
          );
        } catch {
          emulatorProcess = null;
        }
      }

      if (!fs.existsSync(emulatorPath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Emulator not found at specified path',
        );
      }

      if (!fs.existsSync(gamePath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Game file not found at specified path',
        );
      }

      const launchPath =
        process.platform === 'darwin' &&
        emulatorPath.toLowerCase().endsWith('.app')
          ? resolveMacAppExecutable(emulatorPath)
          : emulatorPath;

      if (!launchPath) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Could not find an executable inside the selected macOS app bundle',
        );
      }

      ensureExecutableOnLinux(launchPath);

      console.log('[launch-emulator] Launching emulator:', emulatorType);
      console.log('[launch-emulator] Emulator path:', launchPath);
      console.log('[launch-emulator] With game:', gamePath);
      console.log('[launch-emulator] Fullscreen:', fullscreen);

      const args = getEmulatorArgs(emulatorType, gamePath, fullscreen);

      const childProcess = spawn(launchPath, args, {
        cwd: path.dirname(launchPath),
        detached: true,
        stdio: 'ignore',
      });
      emulatorProcess = childProcess;

      childProcess.on('exit', () => {
        console.log('[launch-emulator] Emulator process exited');
        emulatorProcess = null;
      });

      childProcess.on('error', () => {
        console.log('[launch-emulator] Emulator process error');
        emulatorProcess = null;
      });

      const startResult = await waitForProcessStart(childProcess);

      if (!startResult.success) {
        emulatorProcess = null;
        return createErrorResponse(
          ErrorCodes.EMULATOR_LAUNCH_ERROR,
          startResult.error,
        );
      }

      childProcess.unref();
      console.log(
        '[launch-emulator] Emulator launched successfully with args:',
        args,
      );
      return { success: true };
    } catch (error) {
      handleError(error, 'launch-emulator');
      return createErrorResponse(
        ErrorCodes.EMULATOR_LAUNCH_ERROR,
        error.message,
      );
    }
  },

  ['load-locale']: async (
    common: BaseHandlerArg,
    locale: string,
  ): HandlerResponse<{
    translations: Record<string, string>;
  }> => {
    try {
      const localesPath = PATHS.localesDir();
      const localePath = path.join(localesPath, `${locale}.json`);

      if (!fs.existsSync(localePath)) {
        console.warn(
          `Locale file not found: ${localePath}, falling back to English`,
        );
        const enPath = path.join(localesPath, 'en.json');
        if (fs.existsSync(enPath)) {
          const content = fs.readFileSync(enPath, 'utf8');
          return { success: true, translations: JSON.parse(content) };
        }
        return createErrorResponse(
          ErrorCodes.LOCALE_LOAD_ERROR,
          'Locale file not found',
        );
      }

      const content = fs.readFileSync(localePath, 'utf8');
      const translations = JSON.parse(content);
      console.log(`Locale loaded successfully: ${locale}`);
      return { success: true, translations };
    } catch (error) {
      handleError(error, 'load-locale');
      return createErrorResponse(ErrorCodes.LOCALE_LOAD_ERROR, error.message);
    }
  },

  ['get-available-drives']: async (common: BaseHandlerArg) => {
    try {
      const { detectDrives } = require('../../utils/drive-detector');
      const drives = await detectDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'get-available-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['check-path-accessible']: async (
    common: BaseHandlerArg,
    targetPath: string,
  ) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') {
        return { success: true, accessible: false };
      }

      const { resolveDrivePath } = require('../../utils/drive-detector');
      const resolvedPath = await resolveDrivePath(targetPath);

      if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return { success: true, accessible: false };
      }

      fs.accessSync(resolvedPath, fs.constants.R_OK);
      return { success: true, accessible: true, resolvedPath };
    } catch (error) {
      return { success: true, accessible: false };
    }
  },
} as const;

/**
 * Register all IPC handlers related to system operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerSystemHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(SystemHandlers)) {
    const handler = SystemHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
