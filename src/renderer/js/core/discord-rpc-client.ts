class DiscordRPCClient {
  currentTab: string | null;
  modCount: number;

  constructor() {
    this.currentTab = null;
    this.modCount = 0;
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        this.setupListeners(),
      );
    } else {
      this.setupListeners();
    }
  }

  setupListeners() {
    console.log('Setting up Discord RPC listeners...');
    const tabButtons = document.querySelectorAll<HTMLElement>('.sidebar-btn');
    console.log(`Found ${tabButtons.length} tab buttons`);

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        console.log(`Tab switched to: ${tab}`);
        this.updateTab(tab);
      });
    });

    setTimeout(() => {
      this.updateTab('tools');
    }, 500);
  }

  updateTab(tab) {
    this.currentTab = tab;
    this.sendUpdate();
  }

  updateModCount(count) {
    this.modCount = count;
    if (this.currentTab === 'tools') {
      this.sendUpdate();
    }
  }

  sendUpdate() {
    if (window.electronAPI && window.electronAPI.updateDiscordRPC) {
      console.log('Sending Discord RPC update:', {
        tab: this.currentTab,
        modCount: this.modCount,
      });

      window.electronAPI.updateDiscordRPC({
        tab: this.currentTab,
        modCount: this.modCount,
      });
    } else {
      console.warn('electronAPI.updateDiscordRPC not available');
    }
  }
}

if (typeof window !== 'undefined') {
  window.discordRPCClient = new DiscordRPCClient();
  console.log('Discord RPC Client initialized');
}

export { type DiscordRPCClient };
