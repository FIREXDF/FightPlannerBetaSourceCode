// Global Renderer Error Tracking
window.addEventListener('error', (event) => {
  console.error('[Renderer] Uncaught Error:', event.error || event.message);
  if (window.electronAPI && window.electronAPI.trackError) {
    const errorMsg = event.error ? event.error.message : event.message;
    const errorStack = event.error && event.error.stack ? event.error.stack : '';
    window.electronAPI.trackError(errorMsg, errorStack, {
      source: 'renderer_window_error',
      filename: event.filename,
      lineno: event.lineno,
    });
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled Rejection:', event.reason);
  if (window.electronAPI && window.electronAPI.trackError) {
    const errorMsg = event.reason instanceof Error ? event.reason.message : String(event.reason);
    const errorStack = event.reason instanceof Error && event.reason.stack ? event.reason.stack : '';
    window.electronAPI.trackError(errorMsg, errorStack, {
      source: 'renderer_unhandled_rejection',
    });
  }
});

document
  .querySelector<HTMLElement>('.minimize')!
  .addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  });

document
  .querySelector<HTMLElement>('.maximize')!
  .addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.maximize();
    }
  });

document.querySelector<HTMLElement>('.close')!.addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.close();
  }
});

let currentTimeline: {
  kill: () => void;
} | null = null;

async function switchTab(tabName) {
  if (currentTimeline) {
    currentTimeline.kill();
  }

  const currentTab = document.querySelector<HTMLElement>('.tab-content.active');
  const selectedTab = document.querySelector<HTMLElement>(`#tab-${tabName}`);

  if (currentTab === selectedTab) return;

  window.appSoundManager?.play('switchTab', { volume: 0.65, cooldownMs: 60 });

  if (window.tabLoader) {
    await window.tabLoader.loadTabContent(tabName);
  }

  // Use Animation Manager if available
  if (window.animationManager) {
    window.animationManager.animateTabSwitch(currentTab, selectedTab, tabName);
  } else {
    // Fallback if Animation Manager isn't loaded for some reason
    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.display = 'flex';
    }
    if (currentTab) {
      currentTab.classList.remove('active');
      currentTab.style.display = 'none';
    }
  }

  document.querySelectorAll<HTMLElement>('.sidebar-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  const activeButton = document.querySelector<HTMLElement>(
    `[data-tab="${tabName}"]`,
  );
  if (activeButton) {
    activeButton.classList.add('active');
  }

  console.log(`Switched to tab: ${tabName}`);

  // Reapply theme after tab switch
  if (window.settingsManager) {
    const currentTheme = window.settingsManager.settings.theme || 'dark';
    window.settingsManager.applyTheme(currentTheme);
  }

  if (window.statusBarManager) {
    window.statusBarManager.updateStatus(tabName);
  }
}

const sidebarButtons = document.querySelectorAll<HTMLElement>('.sidebar-btn');
sidebarButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    if (tabName) {
      switchTab(tabName);
    }
  });
});

const actionButtons = document.querySelectorAll<HTMLElement>('.action-btn');
actionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    console.log('Action button clicked:', btn.title);
  });
});

window.addEventListener('DOMContentLoaded', async () => {
  if (window.HardwareConnectionManager && !window.hardwareConnectionManager) {
    window.hardwareConnectionManager = new window.HardwareConnectionManager();
    await window.hardwareConnectionManager.initialize();
  }

  // Initialize Animation Manager
  if (window.animationManager) {
    window.animationManager.initialize();
  }

  if (window.startupSplashManager?.isStartupLaunch()) {
    await window.startupSplashManager.initialize();
  } else if (window.tabLoader) {
    await window.tabLoader.initializeTabs();

    if (window.modManager?.fetchMods) {
      await window.modManager.fetchMods();
    }
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('postTutorialIntro') === 'true') {
    setTimeout(() => window.tutorial?.showInApp?.(), 800);
  }

  setTimeout(() => {
    const activeTab = document.querySelector<HTMLElement>(
      '.tab-content.active',
    );
    if (activeTab) {
      const tabId = activeTab.id.replace('tab-', '');
      if (window.statusBarManager && tabId) {
        window.statusBarManager.updateStatus(tabId);
      } else {
        console.warn('[Renderer] StatusBarManager missing or tabId invalid for active tab');
      }
    } else {
      if (window.statusBarManager) {
        window.statusBarManager.updateStatus('tools');
      } else {
        console.warn('[Renderer] StatusBarManager missing, cannot default to tools');
      }
    }
  }, 100);

  setTimeout(async () => {
    if (window.pluginManager && window.settingsManager) {
      // Handles startup plugin update checks when enabled.
      window.pluginManager.checkForUpdatesOnStartup();
    }
  }, 2000); // Reduced delay slightly as checkForUpdatesOnStartup has its own delays if needed

  setTimeout(() => {
    window.remoteAnnouncementManager?.checkOnStartup();
  }, 900);
});

document.addEventListener('keydown', async (e) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.altKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.clear
      ) {
        await window.electronAPI.store.clear();
        if (window.toastManager) {
          window.toastManager.success('toasts.electronStoreReset');
        }
      }
    } catch (err) {
      console.error('Failed to reset store:', err);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToResetStore');
      }
    }
  }
});
