import { IpcMain } from 'electron';
import store from '../../store';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type StoreHandlers = typeof StoreHandlers;

const LOGGED_SETTING_KEYS = new Set([
  'modsPath',
  'pluginsPath',
  'emulatorPath',
  'gamePath',
  'switchIp',
  'switchFtpPath',
  'switchFtpPluginsPath',
]);

const StoreHandlers = {
  ['store-get']: async (
    common: BaseHandlerArg,
    key: string,
  ): Promise<unknown | null> => {
    try {
      return store.get(key);
    } catch (error) {
      handleError(error, 'store-get');
      return null;
    }
  },

  ['store-set']: async (
    common: BaseHandlerArg,
    key: string,
    value: unknown,
  ) => {
    try {
      if (LOGGED_SETTING_KEYS.has(key)) {
        const previousValue = store.get(key);
        console.log('[Store] Setting changed:', {
          key,
          previousValue,
          nextValue: value,
        });
      }

      store.set(key, value);
      return { success: true };
    } catch (error) {
      handleError(error, `store-set:${key}`);
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  ['store-delete']: async (common: BaseHandlerArg, key: string) => {
    try {
      store.delete(key);
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  ['store-clear']: async (common: BaseHandlerArg) => {
    try {
      store.clear();
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },
} as const;

/**
 * Register all IPC handlers related to store operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerStoreHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(StoreHandlers) as Array<
    keyof typeof StoreHandlers
  >) {
    const handler = StoreHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
