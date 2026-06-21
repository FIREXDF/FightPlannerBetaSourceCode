import { BrowserWindow, dialog, IpcMain } from 'electron';

import {
  BaseHandlerArg,
  GenericHandler,
  HandlerResponse,
} from '../../types/common';
import {
  getStageLayoutData,
  importStageLayoutSource,
  loadStageLayoutPreset,
  saveStageLayout,
  saveStageLayoutPreset,
  StageLayoutOrderState,
} from '../../stages/stage-layout-service';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';

export type StageHandlers = typeof StageHandlers;

const StageHandlers = {
  ['get-stage-layout']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<ReturnType<typeof getStageLayoutData>> => {
    try {
      return {
        success: true,
        ...getStageLayoutData(),
      };
    } catch (error) {
      handleError(error, 'get-stage-layout');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['import-stage-layout-source']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<ReturnType<typeof importStageLayoutSource>> => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: 'Select ui_stage_db.xml',
        properties: ['openFile'],
        filters: [{ name: 'Stage XML', extensions: ['xml'] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, 'No file selected');
      }

      return importStageLayoutSource(result.filePaths[0]);
    } catch (error) {
      handleError(error, 'import-stage-layout-source');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['save-stage-layout']: async (
    common: BaseHandlerArg,
    layoutState: StageLayoutOrderState,
  ): HandlerResponse<Awaited<ReturnType<typeof saveStageLayout>>> => {
    try {
      return await saveStageLayout(layoutState);
    } catch (error) {
      handleError(error, 'save-stage-layout');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['load-stage-layout-preset']: async (
    common: BaseHandlerArg,
    presetId: string,
  ): HandlerResponse<ReturnType<typeof loadStageLayoutPreset>> => {
    try {
      return {
        success: true,
        ...loadStageLayoutPreset(presetId),
      };
    } catch (error) {
      handleError(error, 'load-stage-layout-preset');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['save-stage-layout-preset']: async (
    common: BaseHandlerArg,
    presetName: string,
    layoutState: StageLayoutOrderState,
    presetId?: string | null,
  ): HandlerResponse<ReturnType<typeof saveStageLayoutPreset>> => {
    try {
      return saveStageLayoutPreset(presetName, layoutState, presetId);
    } catch (error) {
      handleError(error, 'save-stage-layout-preset');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },
} as const;

export function registerStageHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(StageHandlers) as Array<
    keyof typeof StageHandlers
  >) {
    const handler = StageHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
