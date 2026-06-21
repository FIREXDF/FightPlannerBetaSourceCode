import { IpcMain } from 'electron';
import autoUpdater from '../../auto-updater';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type UpdateHandlers = typeof UpdateHandlers;

const UpdateHandlers = {
  ['check-for-updates']: async (common: BaseHandlerArg) => {
    return await autoUpdater.checkForUpdates();
  },

  ['download-update']: async (common: BaseHandlerArg) => {
    return await autoUpdater.downloadUpdate();
  },

  ['install-update']: async (common: BaseHandlerArg) => {
    autoUpdater.quitAndInstall();
    return { success: true };
  },

  ['get-update-info']: async (common: BaseHandlerArg) => {
    return autoUpdater.getUpdateInfo();
  },

  ['set-auto-check-enabled']: async (
    common: BaseHandlerArg,
    enabled: boolean,
  ) => {
    autoUpdater.setAutoCheckEnabled(enabled);
    return { success: true };
  },

  ['get-auto-check-enabled']: async (common: BaseHandlerArg) => {
    return autoUpdater.getAutoCheckEnabled();
  },

  ['set-update-channel']: async (common: BaseHandlerArg, channel: string) => {
    autoUpdater.setUpdateChannel(channel);
    return { success: true };
  },

  ['get-update-channel']: async (common: BaseHandlerArg) => {
    return autoUpdater.getUpdateChannel();
  },

  ['set-force-update']: async (common: BaseHandlerArg, enabled: boolean) => {
    autoUpdater.setForceUpdateAvailable(enabled);
    return { success: true };
  },

  ['get-force-update']: async (common: BaseHandlerArg) => {
    return autoUpdater.getForceUpdateAvailable();
  },

  ['simulate-update']: async (common: BaseHandlerArg) => {
    return autoUpdater.simulateUpdate();
  },
} as const;

/**
 * Register all IPC handlers related to update operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerUpdateHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(UpdateHandlers) as Array<
    keyof typeof UpdateHandlers
  >) {
    const handler = UpdateHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
