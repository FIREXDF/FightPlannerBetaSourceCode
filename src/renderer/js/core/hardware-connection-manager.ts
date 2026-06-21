type HardwareMode = 'hardware' | 'emulator' | null;

export class HardwareConnectionManager {
  private readonly checkIntervalMs = 2500;
  private intervalId: number | null = null;
  private overlay: HTMLElement | null = null;
  private currentMode: HardwareMode = null;
  private waitingForReconnect = false;
  private checkInFlight = false;
  private initialized = false;
  private dismissedDrivePath: string | null = null;

  async initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.ensureOverlay();

    if (window.settingsManager?.readyPromise) {
      await window.settingsManager.readyPromise;
    }

    await this.refresh();

    window.addEventListener('focus', () => {
      this.refresh();
    });
  }

  async refresh() {
    const mode = await this.resolveMode();
    this.currentMode = mode;

    if (mode !== 'hardware') {
      this.dismissedDrivePath = null;
      this.stopWatching();
      this.hideOverlay();
      return;
    }

    this.startWatching();
    await this.checkNow();
  }

  async checkNow() {
    if (this.checkInFlight || this.currentMode !== 'hardware') {
      return;
    }

    const drivePath = this.getConfiguredDrivePath();
    if (!drivePath) {
      this.dismissedDrivePath = null;
      this.hideOverlay();
      return;
    }

    this.checkInFlight = true;
    try {
      const result = await window.electronAPI.checkPathAccessible(drivePath);
      const accessible = !!result?.success && result.accessible === true;
      const resolvedPath =
        typeof result?.resolvedPath === 'string' ? result.resolvedPath : null;

      if (accessible) {
        await this.syncResolvedDrivePath(drivePath, resolvedPath);
        this.dismissedDrivePath = null;
        this.hideOverlay();
        if (this.waitingForReconnect) {
          this.waitingForReconnect = false;
          window.toastManager?.success?.('toasts.switchReconnected');
        }
      } else {
        this.waitingForReconnect = true;
        if (this.dismissedDrivePath === drivePath) {
          this.hideOverlay();
          return;
        }
        this.showOverlay(resolvedPath || drivePath);
      }
    } catch (error) {
      console.warn(
        '[HardwareConnectionManager] Connection check failed:',
        error,
      );
      this.waitingForReconnect = true;
      if (this.dismissedDrivePath === drivePath) {
        this.hideOverlay();
        return;
      }
      this.showOverlay(drivePath);
    } finally {
      this.checkInFlight = false;
    }
  }

  showTestOverlay() {
    this.dismissedDrivePath = null;
    this.waitingForReconnect = true;
    this.showOverlay('DEV_TEST_SWITCH_PATH');
  }

  private async resolveMode(): Promise<HardwareMode> {
    const configuredMode =
      window.settingsManager?.getAppRunMode?.() ||
      (await window.electronAPI.store.get('appRunMode'));
    if (configuredMode === 'hardware' || configuredMode === 'emulator') {
      return configuredMode;
    }

    const transferMethod =
      window.settingsManager?.getSwitchTransferMethod?.() ||
      (await window.electronAPI.store.get('switchTransferMethod'));

    if (transferMethod && transferMethod !== 'none') {
      return 'hardware';
    }

    const emulatorPath =
      window.settingsManager?.getEmulatorPath?.() ||
      (await window.electronAPI.store.get('emulatorPath'));
    const gamePath =
      window.settingsManager?.getGamePath?.() ||
      (await window.electronAPI.store.get('gamePath'));

    return emulatorPath || gamePath ? 'emulator' : null;
  }

  private getConfiguredDrivePath() {
    const transferMethod =
      window.settingsManager?.getSwitchTransferMethod?.() || 'none';

    if (transferMethod !== 'drive') {
      return null;
    }

    return window.settingsManager?.getSwitchDriveLetter?.() || null;
  }

  private async syncResolvedDrivePath(
    configuredPath: string,
    resolvedPath: string | null,
  ) {
    if (!resolvedPath || resolvedPath === configuredPath) {
      return;
    }

    const isResolvedFilesystemPath =
      resolvedPath.startsWith('/') || resolvedPath.includes(':\\');
    if (!isResolvedFilesystemPath) {
      return;
    }

    const settingsManager = window.settingsManager as any;
    if (settingsManager?.settings) {
      settingsManager.settings.switchDriveLetter = resolvedPath;
      settingsManager.applyHardwareLibraryModePaths?.();
      settingsManager.updateSwitchDriveLetterUI?.();
    }

    await window.electronAPI.store.set('switchDriveLetter', resolvedPath);
    if (settingsManager?.settings) {
      await window.electronAPI.store.set(
        'modsPath',
        settingsManager.settings.modsPath || null,
      );
      await window.electronAPI.store.set(
        'pluginsPath',
        settingsManager.settings.pluginsPath || null,
      );
    }
  }

  private startWatching() {
    if (this.intervalId !== null) {
      return;
    }

    this.intervalId = window.setInterval(() => {
      this.checkNow();
    }, this.checkIntervalMs);
  }

  private stopWatching() {
    if (this.intervalId === null) {
      return;
    }

    window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.waitingForReconnect = false;
  }

  private ensureOverlay() {
    this.overlay = document.querySelector<HTMLElement>(
      '#hardware-connection-overlay',
    );

    const useAnywayButton = this.overlay?.querySelector<HTMLButtonElement>(
      '#hardware-connection-use-anyway',
    );
    if (useAnywayButton && !useAnywayButton.dataset.listenerAttached) {
      useAnywayButton.addEventListener('click', () => {
        const drivePath = this.getConfiguredDrivePath();
        this.dismissedDrivePath = drivePath;
        this.hideOverlay();
      });
      useAnywayButton.dataset.listenerAttached = 'true';
    }
  }

  private showOverlay(drivePath: string) {
    if (!this.overlay) {
      return;
    }

    const pathLabel = this.overlay.querySelector<HTMLElement>(
      '[data-hardware-drive-path]',
    );
    if (pathLabel) {
      pathLabel.textContent = drivePath;
    }

    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hardware-connection-blocked');
  }

  private hideOverlay() {
    if (!this.overlay) {
      return;
    }

    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hardware-connection-blocked');
  }
}

window.HardwareConnectionManager = HardwareConnectionManager;
