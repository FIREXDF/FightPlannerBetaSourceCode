import { IpcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';

import FppHandler from '../../fpp-handler';
import store from '../../store';
import {
    handleError,
    createErrorResponse,
    ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type FppHandlers = typeof FppHandlers;

const FppHandlers = {
    ['create-fpp']: async (
        common: BaseHandlerArg,
        name: string,
        modPaths: string[],
    ): HandlerResponse<{ filePath: string }> => {
        try {
            const mainWindow = BrowserWindow.fromWebContents(common.event.sender);
            if (!mainWindow) {
                return createErrorResponse('FPP_ERROR', 'No main window found');
            }

            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save FPP File',
                defaultPath: `${name}.fpp`,
                filters: [{ name: 'FightPlanner Pack', extensions: ['fpp'] }],
            });

            if (result.canceled || !result.filePath) {
                return { success: false, canceled: true };
            }

            const createResult = await FppHandler.createFpp(name, '1.0.0', null, modPaths, result.filePath, mainWindow);

            if (createResult.success && createResult.filePath) {
                return { success: true, filePath: createResult.filePath };
            }

            return createErrorResponse('FPP_CREATE_ERROR', createResult.error || 'Unknown error');
        } catch (error) {
            handleError(error, 'create-fpp');
            return createErrorResponse('FPP_CREATE_ERROR', error.message);
        }
    },

    ['read-fpp']: async (
        common: BaseHandlerArg,
        fppPath: string,
    ): HandlerResponse<{ summary: any }> => {
        try {
            const summary = await FppHandler.readFpp(fppPath);
            if (!summary) {
                return createErrorResponse('FPP_READ_ERROR', 'Failed to read FPP file');
            }
            return { success: true, summary };
        } catch (error) {
            handleError(error, 'read-fpp');
            return createErrorResponse('FPP_READ_ERROR', error.message);
        }
    },

    ['install-fpp']: async (
        common: BaseHandlerArg,
        fppPath: string,
    ): HandlerResponse<{ installedMods: string[]; downloadedLinks: string[] }> => {
        try {
            const mainWindow = BrowserWindow.fromWebContents(common.event.sender);
            if (!mainWindow) {
                return createErrorResponse('FPP_ERROR', 'No main window found');
            }

            const result = await FppHandler.installFpp(fppPath, mainWindow);

            if (result.success) {
                return {
                    success: true,
                    installedMods: result.installedMods || [],
                    downloadedLinks: result.downloadedLinks || [],
                };
            }

            return createErrorResponse('FPP_INSTALL_ERROR', result.error || 'Unknown error');
        } catch (error) {
            handleError(error, 'install-fpp');
            return createErrorResponse('FPP_INSTALL_ERROR', error.message);
        }
    },

    ['select-fpp-file']: async (
        common: BaseHandlerArg,
    ): HandlerResponse<{ filePath: string }> => {
        try {
            const mainWindow = BrowserWindow.fromWebContents(common.event.sender);
            if (!mainWindow) {
                return createErrorResponse('FPP_ERROR', 'No main window found');
            }

            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Open FPP File',
                filters: [{ name: 'FightPlanner Pack', extensions: ['fpp'] }],
                properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, canceled: true };
            }

            return { success: true, filePath: result.filePaths[0] };
        } catch (error) {
            handleError(error, 'select-fpp-file');
            return createErrorResponse('FPP_SELECT_ERROR', error.message);
        }
    },
} as const;

export function registerFppHandlers(ipcMain: IpcMain) {
    for (const channel of Object.keys(FppHandlers) as Array<
        keyof typeof FppHandlers
    >) {
        const handler = FppHandlers[channel] as GenericHandler;

        ipcMain.handle(channel, (event, ...rest: unknown[]) => {
            return handler({ event }, ...rest);
        });
    }
}
