import { BrowserWindow, dialog, IpcMain } from 'electron';

import {
  BaseHandlerArg,
  GenericHandler,
  HandlerResponse,
} from '../../types/common';
import {
  CharacterCssLayoutPayload,
  CharacterCssSourceImportPayload,
  DuplicateCharacterCssPayload,
  duplicateCharacterCssEntry,
  getCharacterCssLayoutData,
  importCharacterCssSourceFiles,
  RemoveCharacterCssPayload,
  removeCharacterCssEntry,
  saveCharacterCssLayout,
} from '../../characters/character-css-service';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';

export type CharacterCssHandlers = typeof CharacterCssHandlers;

const CharacterCssHandlers = {
  ['get-character-css-layout']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<ReturnType<typeof getCharacterCssLayoutData>> => {
    try {
      return {
        success: true,
        ...getCharacterCssLayoutData(),
      };
    } catch (error) {
      handleError(error, 'get-character-css-layout');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['import-character-css-source-files']: async (
    common: BaseHandlerArg,
    payload: CharacterCssSourceImportPayload,
  ): HandlerResponse<Awaited<ReturnType<typeof importCharacterCssSourceFiles>>> => {
    try {
      return await importCharacterCssSourceFiles(payload);
    } catch (error) {
      handleError(error, 'import-character-css-source-files');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['select-character-css-source-file']: async (
    common: BaseHandlerArg,
    sourceKind: 'prc' | 'layout' | 'msbt',
  ): HandlerResponse<{ filePath: string }> => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender);
      const isPrc = sourceKind === 'prc';
      const isLayout = sourceKind === 'layout';
      const result = await dialog.showOpenDialog(win!, {
        title: isPrc
          ? 'Select ui_chara_db.prc'
          : isLayout
            ? 'Select ui_layout_db.prc'
            : 'Select msg_name.msbt',
        properties: ['openFile'],
        filters: [
          isPrc || isLayout
            ? { name: 'Character PRC', extensions: ['prc'] }
            : { name: 'MSBT message file', extensions: ['msbt'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, 'No file selected');
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error) {
      handleError(error, 'select-character-css-source-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['save-character-css-layout']: async (
    common: BaseHandlerArg,
    layoutState: CharacterCssLayoutPayload,
  ): HandlerResponse<Awaited<ReturnType<typeof saveCharacterCssLayout>>> => {
    try {
      return await saveCharacterCssLayout(layoutState);
    } catch (error) {
      handleError(error, 'save-character-css-layout');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['duplicate-character-css-entry']: async (
    common: BaseHandlerArg,
    payload: DuplicateCharacterCssPayload,
  ): HandlerResponse<ReturnType<typeof duplicateCharacterCssEntry>> => {
    try {
      return {
        success: true,
        ...duplicateCharacterCssEntry(payload),
      };
    } catch (error) {
      handleError(error, 'duplicate-character-css-entry');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['remove-character-css-entry']: async (
    common: BaseHandlerArg,
    payload: RemoveCharacterCssPayload,
  ): HandlerResponse<ReturnType<typeof removeCharacterCssEntry>> => {
    try {
      return {
        success: true,
        ...removeCharacterCssEntry(payload),
      };
    } catch (error) {
      handleError(error, 'remove-character-css-entry');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },
} as const;

export function registerCharacterCssHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(CharacterCssHandlers) as Array<
    keyof typeof CharacterCssHandlers
  >) {
    const handler = CharacterCssHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
