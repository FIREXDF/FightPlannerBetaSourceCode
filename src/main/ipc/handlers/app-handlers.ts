import { app, IpcMain } from 'electron';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type AppHandlers = typeof AppHandlers;

const AppHandlers = {
  ['get-app-version']: async (common: BaseHandlerArg) => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
    };
  },

  ['relaunch-app']: async (common: BaseHandlerArg) => {
    app.relaunch();
    app.exit(0);
    return { success: true };
  },
} as const;

/**
 * Register all IPC handlers related to app operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerAppHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(AppHandlers) as Array<
    keyof typeof AppHandlers
  >) {
    const handler = AppHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
