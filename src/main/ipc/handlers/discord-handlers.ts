import { IpcMain } from 'electron';
import DiscordRPCManager from '../../discord-rpc';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type DiscordHandlers = typeof DiscordHandlers;

const DiscordHandlers = {
  ['discord-rpc-update']: async (
    common: BaseHandlerArg<{
      discordRPC: DiscordRPCManager | null;
    }>,
    data: { tab: string | null; modCount?: number },
  ) => {
    console.log('Received discord-rpc-update:', data);

    if (!common.discordRPC) {
      console.warn('Discord RPC manager not initialized');
      return;
    }

    const { tab, modCount } = data;

    switch (tab) {
      case 'tools':
        console.log(`Setting Mods tab with ${modCount} mods`);
        common.discordRPC.setModsTab(modCount || 0);
        break;

      case 'plugins':
        console.log('Setting Plugins tab');
        common.discordRPC.setPluginsTab();
        break;

      case 'characters':
        console.log('Setting Characters tab');
        common.discordRPC.setCharactersTab();
        break;

      case 'downloads':
        console.log('Setting Downloads tab');
        common.discordRPC.setDownloadsTab();
        break;

      case 'settings':
        console.log('Setting Settings tab');
        common.discordRPC.setSettingsTab();
        break;

      default:
        console.log('Setting Idle state');
        common.discordRPC.setIdleState();
        break;
    }
  },
} as const;

/**
 * Register all IPC event handlers related to Discord RPC operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 * @param discordRPC - Discord RPC manager instance
 */
export function registerDiscordHandlers(
  ipcMain: IpcMain,
  discordRPC: DiscordRPCManager | null,
) {
  for (const channel of Object.keys(DiscordHandlers) as Array<
    keyof typeof DiscordHandlers
  >) {
    const handler = DiscordHandlers[channel] as GenericHandler<{
      discordRPC: DiscordRPCManager | null;
    }>;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event, discordRPC }, ...rest);
    });
  }
}
