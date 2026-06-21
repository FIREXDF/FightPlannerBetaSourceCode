import RPC from 'discord-rpc';

interface ActivityData {
  tab: string;
  details: string;
  state: string | null;
  modCount: number;
}

export default class DiscordRPCManager {
  client: RPC.Client | null;
  clientId: string;
  connected: boolean;
  startTimestamp: number;
  currentActivity: ActivityData;

  constructor() {
    this.client = null;
    this.clientId = '1304806839115972628';
    this.connected = false;
    this.startTimestamp = Date.now();
    this.currentActivity = {
      tab: 'Idle',
      details: 'In menus',
      state: null,
      modCount: 0,
    };
  }

  async connect() {
    if (this.connected) {
      console.log('Discord RPC already connected');
      return;
    }

    try {
      console.log('Attempting to connect to Discord RPC...');
      this.client = new RPC.Client({ transport: 'ipc' });

      this.client.on('ready', () => {
        console.log('✅ Discord RPC connected successfully!');
        this.connected = true;
        this.updatePresence();
      });

      this.client.on('disconnected', () => {
        console.log('❌ Discord RPC disconnected');
        this.connected = false;
      });

      await this.client.login({ clientId: this.clientId });
    } catch (error) {
      console.error('❌ Failed to connect to Discord RPC:', error.message);
      console.error(
        'Make sure Discord is running and you have a valid Client ID',
      );
      this.connected = false;
    }
  }

  disconnect() {
    if (this.client && this.connected) {
      try {
        this.client.clearActivity();
        this.client.destroy();
      } catch (error) {
        console.error('Error disconnecting Discord RPC:', error);
      }
      this.connected = false;
      this.client = null;
    }
  }

  setActivity(
    tab: string,
    details: string | null = null,
    state: string | null = null,
    modCount: number | null = null,
  ) {
    this.currentActivity.tab = tab;
    if (details !== null) this.currentActivity.details = details;
    if (state !== null) this.currentActivity.state = state;
    if (modCount !== null) this.currentActivity.modCount = modCount;

    this.updatePresence();
  }

  updatePresence() {
    if (!this.client || !this.connected) {
      console.warn('Cannot update presence: Discord RPC not connected');
      return;
    }

    const activity: RPC.Presence = {
      details: this.currentActivity.details,
      startTimestamp: this.startTimestamp,
      instance: false,
    };

    if (this.currentActivity.state) {
      activity.state = this.currentActivity.state;
    }

    try {
      console.log('📡 Updating Discord presence:', this.currentActivity);
      this.client.setActivity(activity);
    } catch (error) {
      console.error('❌ Error updating Discord presence:', error.message);
    }
  }

  setModsTab(modCount: number = 0) {
    this.setActivity(
      'Mods',
      'Managing mods',
      `${modCount} mods installed`,
      modCount,
    );
  }

  setPluginsTab() {
    this.setActivity('Plugins', 'Managing plugins', null, null);
  }

  setCharactersTab() {
    this.setActivity('Characters', 'Browsing characters', null, null);
  }

  setDownloadsTab() {
    this.setActivity('Downloads', 'Downloading mods', null, null);
  }

  setSettingsTab() {
    this.setActivity('Settings', 'Configuring settings', null, null);
  }

  setIdleState() {
    this.setActivity('Idle', 'In menus', null, null);
  }
}
