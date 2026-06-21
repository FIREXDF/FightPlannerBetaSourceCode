import { BrowserWindow, IpcMain } from 'electron';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type WindowHandlers = typeof WindowEventHandlers;

const WindowEventHandlers = {
  ['minimize-window']: (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;
    if (win) win.minimize();
  },

  ['maximize-window']: (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;

    console.log('Toggling maximize for window:', win?.id);

    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  },

  ['close-window']: (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;
    if (win) win.close();
  },
} as const;

/**
 * Register all IPC event handlers related to window operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerWindowHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(WindowEventHandlers) as Array<
    keyof typeof WindowEventHandlers
  >) {
    const handler = WindowEventHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
