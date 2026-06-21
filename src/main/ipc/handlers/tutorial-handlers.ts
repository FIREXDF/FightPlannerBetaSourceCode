import { BrowserWindow, IpcMain, dialog, ipcMain } from 'electron';
import {
  createTutorialWindow,
  closeTutorialWindow,
} from '../../tutorial-window';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { detectDrives, isSwitchSdCard } from '../../utils/drive-detector';
import {
  getLatestArcropolisRelease,
  getLatestSkylineRelease,
  downloadArcropolis,
  extractAndInstallArcropolis,
  extractAndInstallSkyline,
  checkArcropolisInstalled,
  checkArcropolisFolder,
  createDirectory,
} from '../../utils/arcropolis-installer';

import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type TutorialHandlers = typeof TutorialHandlers;

const TutorialHandlers = {
  ['open-tutorial-window']: async (common: BaseHandlerArg) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(common.event.sender);

      createTutorialWindow(mainWindow || null);

      return { success: true };
    } catch (error) {
      handleError(error, 'open-tutorial-window');
      return createErrorResponse(
        ErrorCodes.TUTORIAL_WINDOW_ERROR,
        error.message,
      );
    }
  },

  ['close-tutorial-window']: async (common: BaseHandlerArg) => {
    console.log('Received close-tutorial-window event');
    closeTutorialWindow();
    return { success: true };
  },

  ['skip-tutorial']: async (common: BaseHandlerArg) => {
    console.log('Received skip-tutorial event');
    closeTutorialWindow();
    return { success: true };
  },

  ['tutorial-intro-complete']: async (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender);
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(false);
    }

    return { success: true };
  },

  ['detect-sd-drives']: async (common: BaseHandlerArg) => {
    try {
      const drives = await detectDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'detect-sd-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['detect-yuzu-path']: async (common: BaseHandlerArg) => {
    try {
      const homeDir = os.homedir();
      const yuzuPath = path.join(homeDir, 'AppData', 'Roaming', 'yuzu');

      if (fs.existsSync(yuzuPath)) {
        return { success: true, path: yuzuPath };
      }

      return { success: false, path: null };
    } catch (error) {
      handleError(error, 'detect-yuzu-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['detect-ryujinx-path']: async (common: BaseHandlerArg) => {
    try {
      const homeDir = os.homedir();
      const ryujinxPath = path.join(homeDir, 'AppData', 'Roaming', 'Ryujinx');

      if (fs.existsSync(ryujinxPath)) {
        return { success: true, path: ryujinxPath };
      }

      return { success: false, path: null };
    } catch (error) {
      handleError(error, 'detect-ryujinx-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['get-github-release']: async (
    common: BaseHandlerArg,
    repo = 'Raytwo/ARCropolis',
  ) => {
    try {
      let release;
      if (repo === 'skyline-dev/skyline') {
        release = await getLatestSkylineRelease();
      } else {
        release = await getLatestArcropolisRelease();
      }
      return { success: true, ...release };
    } catch (error) {
      handleError(error, 'get-github-release');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['get-skyline-release']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    tag: string;
    downloadUrl: string;
    version: string;
    name: string;
  }> => {
    try {
      return { success: true, ...(await getLatestSkylineRelease()) };
    } catch (error) {
      handleError(error, 'get-skyline-release');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['extract-skyline']: async (
    common: BaseHandlerArg,
    zipPath: string,
    targetDir: string,
  ) => {
    try {
      return await extractAndInstallSkyline(zipPath, targetDir);
    } catch (error) {
      handleError(error, 'extract-skyline');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['download-arcropolis']: async (
    common: BaseHandlerArg,
    downloadUrl: string,
    targetPath: string,
  ): Promise<HandlerResponse<{ path: string }>> => {
    try {
      const downloadedPath = await downloadArcropolis(downloadUrl, targetPath);
      return { success: true, path: downloadedPath };
    } catch (error) {
      handleError(error, 'download-arcropolis');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['extract-arcropolis']: async (
    common: BaseHandlerArg,
    zipPath: string,
    targetDir: string,
  ) => {
    try {
      return await extractAndInstallArcropolis(zipPath, targetDir);
    } catch (error) {
      handleError(error, 'extract-arcropolis');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['create-directory']: async (
    common: BaseHandlerArg,
    dirPath: string,
  ): HandlerResponse => {
    try {
      await createDirectory(dirPath);
      return { success: true };
    } catch (error) {
      handleError(error, 'create-directory');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['check-arcropolis-installed']: async (
    common: BaseHandlerArg,
    targetDir: string,
  ) => {
    try {
      const installed = checkArcropolisInstalled(targetDir);
      return { success: true, installed };
    } catch (error) {
      handleError(error, 'check-arcropolis-installed');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['check-arcropolis-folder']: async (
    common: BaseHandlerArg,
    ultimatePath: string,
  ) => {
    try {
      const exists = checkArcropolisFolder(ultimatePath);
      return { success: true, exists };
    } catch (error) {
      handleError(error, 'check-arcropolis-folder');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['join-path']: async (
    common: BaseHandlerArg,
    ...parts: string[]
  ): HandlerResponse<{
    path: string;
  }> => {
    try {
      const path = require('path');
      return { success: true, path: path.join(...parts) };
    } catch (error) {
      handleError(error, 'join-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['get-temp-dir']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    path: string;
  }> => {
    try {
      const os = require('os');
      return { success: true, path: os.tmpdir() };
    } catch (error) {
      handleError(error, 'get-temp-dir');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['select-drive']: async (common: BaseHandlerArg) => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;

      // Show custom dialog or use file picker
      const result = await dialog.showOpenDialog(win, {
        title: 'Select SD Card Drive',
        properties: ['openDirectory'],
        message: 'Please select your Nintendo Switch SD card drive',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const isSwitch = isSwitchSdCard(selectedPath);

      return {
        success: true,
        path: selectedPath,
        isSwitchCard: isSwitch,
      };
    } catch (error) {
      handleError(error, 'select-drive');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to tutorial operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerTutorialHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(TutorialHandlers) as Array<
    keyof typeof TutorialHandlers
  >) {
    const handler = TutorialHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
