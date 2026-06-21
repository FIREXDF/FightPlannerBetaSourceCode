import { IpcMain } from 'electron';
import { getMigrationStatus } from '../../migration';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type MigrationHandlers = typeof MigrationHandlers;

const MigrationHandlers = {
  ['get-migration-status']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    completed: boolean | null;
    from: string | null;
    date: string | null;
    settingKeys: string[];
  }> => {
    try {
      const status = await getMigrationStatus();
      return { success: true, ...status };
    } catch (error) {
      handleError(error, 'get-migration-status');
      return createErrorResponse(ErrorCodes.MIGRATION_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to migration operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerMigrationHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(MigrationHandlers) as Array<
    keyof typeof MigrationHandlers
  >) {
    const handler: GenericHandler = MigrationHandlers[channel];

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
