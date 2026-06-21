class UpdateManager {
  updateInfo: any | null;
  isDownloading: boolean;

  constructor() {
    this.updateInfo = null;
    this.isDownloading = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    window.electronAPI.onUpdateChecking(() => {
      console.log('[UpdateManager] Checking for updates...');
    });

    window.electronAPI.onUpdateAvailable((data) => {
      console.log('[UpdateManager] Update available:', data);
      console.log('[UpdateManager] New version:', data.version);
      this.updateInfo = data;
      this.showUpdateAvailable(data);
    });

    window.electronAPI.onUpdateNotAvailable((data) => {
      console.log('[UpdateManager] No updates available');
      console.log('[UpdateManager] Current version:', data.version);
      console.log('[UpdateManager] Latest version:', data.latestVersion);
      console.log('[UpdateManager] Update data:', data);
    });

    window.electronAPI.onUpdateDownloadProgress((data) => {
      console.log(
        '[UpdateManager] Download progress:',
        data.percent.toFixed(2) + '%',
      );
      this.updateDownloadProgress(data);
    });

    window.electronAPI.onUpdateDownloaded((data) => {
      console.log('[UpdateManager] Update downloaded:', data);
      this.showUpdateDownloaded(data);
    });

    window.electronAPI.onUpdateError((data) => {
      console.error('[UpdateManager] Update error:', data.message);
      window.appSoundManager?.stop('downloading', { force: true });
      if (window.toastManager) {
        window.toastManager.error('toasts.updateError', 5000, {
          error: data.message,
        });
      }
      this.closeUpdateModal();
    });
  }

  showUpdateAvailable(data) {
    const modal = document.querySelector<HTMLElement>('#update-modal');
    const versionNumber = document.querySelector<HTMLElement>(
      '#update-version-number',
    );
    const releaseNotesContent = document.querySelector<HTMLElement>(
      '#update-release-notes-content',
    );

    const availableContent = document.querySelector<HTMLElement>(
      '#update-available-content',
    );
    const downloadingContent = document.querySelector<HTMLElement>(
      '#update-downloading-content',
    );
    const downloadedContent = document.querySelector<HTMLElement>(
      '#update-downloaded-content',
    );

    const availableActions = document.querySelector<HTMLElement>(
      '#update-available-actions',
    );
    const downloadingActions = document.querySelector<HTMLElement>(
      '#update-downloading-actions',
    );
    const downloadedActions = document.querySelector<HTMLElement>(
      '#update-downloaded-actions',
    );

    if (!modal) return;

    versionNumber!.textContent = data.version;

    if (data.releaseNotes) {
      if (typeof data.releaseNotes === 'string') {
        releaseNotesContent!.innerHTML = this.formatReleaseNotes(
          data.releaseNotes,
        );
      } else if (Array.isArray(data.releaseNotes)) {
        const notes = data.releaseNotes
          .map((note) => note.note || '')
          .join('\n\n');
        releaseNotesContent!.innerHTML = this.formatReleaseNotes(notes);
      }
    } else {
      releaseNotesContent!.innerHTML = '<p>No release notes available.</p>';
    }

    availableContent!.style.display = 'block';
    downloadingContent!.style.display = 'none';
    downloadedContent!.style.display = 'none';

    availableActions!.style.display = 'flex';
    downloadingActions!.style.display = 'none';
    downloadedActions!.style.display = 'none';

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    modal.classList.remove('closing');
    modal.style.display = 'block';

    if (window.toastManager) {
      window.toastManager.info('toasts.updateAvailable', 5000, {
        version: data.version,
      });
    }
  }

  formatReleaseNotes(notes) {
    if (!notes) return '';

    let formatted = notes.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    formatted = '<p>' + formatted + '</p>';

    return formatted;
  }

  async downloadUpdate() {
    if (this.isDownloading) return;

    this.isDownloading = true;

    const availableContent = document.querySelector<HTMLElement>(
      '#update-available-content',
    );
    const downloadingContent = document.querySelector<HTMLElement>(
      '#update-downloading-content',
    );
    const availableActions = document.querySelector<HTMLElement>(
      '#update-available-actions',
    );
    const downloadingActions = document.querySelector<HTMLElement>(
      '#update-downloading-actions',
    );

    availableContent!.style.display = 'none';
    downloadingContent!.style.display = 'block';
    availableActions!.style.display = 'none';
    downloadingActions!.style.display = 'flex';
    window.appSoundManager?.play('downloading');

    const progressFill = document.querySelector<HTMLElement>(
      '#update-progress-fill',
    );
    const progressPercent = document.querySelector<HTMLElement>(
      '#update-progress-percent',
    );

    progressFill!.style.width = '0%';
    progressPercent!.textContent = '0%';

    try {
      const result = await window.electronAPI.downloadUpdate();
      if (!result.success) {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Failed to start download:', error);
      window.appSoundManager?.stop('downloading');
      if (window.toastManager) {
        window.toastManager.error('toasts.updateDownloadFailed', 5000);
      }
      this.closeUpdateModal();
      this.isDownloading = false;
    }
  }

  updateDownloadProgress(data) {
    const progressFill = document.querySelector<HTMLElement>(
      '#update-progress-fill',
    );
    const progressPercent = document.querySelector<HTMLElement>(
      '#update-progress-percent',
    );
    const progressSpeed = document.querySelector<HTMLElement>(
      '#update-progress-speed',
    );

    const percent = Math.round(data.percent);
    progressFill!.style.width = percent + '%';
    progressPercent!.textContent = percent + '%';

    if (data.bytesPerSecond) {
      const speedMB = (data.bytesPerSecond / 1024 / 1024).toFixed(2);
      progressSpeed!.textContent = speedMB + ' MB/s';
    }
  }

  showUpdateDownloaded(data) {
    this.isDownloading = false;

    const downloadingContent = document.querySelector<HTMLElement>(
      '#update-downloading-content',
    );
    const downloadedContent = document.querySelector<HTMLElement>(
      '#update-downloaded-content',
    );
    const downloadingActions = document.querySelector<HTMLElement>(
      '#update-downloading-actions',
    );
    const downloadedActions = document.querySelector<HTMLElement>(
      '#update-downloaded-actions',
    );

    downloadingContent!.style.display = 'none';
    downloadedContent!.style.display = 'block';
    downloadingActions!.style.display = 'none';
    downloadedActions!.style.display = 'flex';
    window.appSoundManager?.stop('downloading');
    window.appSoundManager?.play('complete');

    if (window.toastManager) {
      window.toastManager.success('toasts.updateDownloaded', 5000, {
        version: data.version,
      });
    }
  }

  async installUpdate() {
    try {
      await window.electronAPI.installUpdate();
    } catch (error) {
      console.error('Failed to install update:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.updateInstallFailed', 5000);
      }
    }
  }

  closeUpdateModal() {
    const modal = document.querySelector<HTMLElement>('#update-modal');
    if (!modal) return;

    modal.classList.add('closing');
    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('closing');

      const availableContent = document.querySelector<HTMLElement>(
        '#update-available-content',
      );
      const downloadingContent = document.querySelector<HTMLElement>(
        '#update-downloading-content',
      );
      const downloadedContent = document.querySelector<HTMLElement>(
        '#update-downloaded-content',
      );

      availableContent!.style.display = 'none';
      downloadingContent!.style.display = 'none';
      downloadedContent!.style.display = 'none';
    }, 300);

    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }

    this.isDownloading = false;
  }

  async checkForUpdatesManually() {
    console.log('[UpdateManager] Manual update check initiated');
    window.appSoundManager?.play('loading', { volume: 0.55 });

    if (window.toastManager) {
      window.toastManager.info('toasts.checkingForUpdates', 3000);
    }

    try {
      const result = await window.electronAPI.checkForUpdates();
      console.log('[UpdateManager] Manual check result:', result);

      if (result.checking) {
        console.log('[UpdateManager] Already checking for updates');
        if (window.toastManager) {
          window.toastManager.info('toasts.alreadyCheckingUpdates', 3000);
        }
        return;
      }

      if (!result.success) {
        console.error('[UpdateManager] Check failed:', result.error);
        throw new Error(result.error || 'Check failed');
      }

      // If updateInfo is present in the result, it means an update was found
      if (result.updateInfo) {
        console.log(
          '[UpdateManager] Update found via manual check:',
          result.updateInfo,
        );
        this.updateInfo = result.updateInfo;
        this.showUpdateAvailable(result.updateInfo);
      } else {
        console.log('[UpdateManager] No update found via manual check');
        if (window.toastManager) {
          window.toastManager.success('toasts.noUpdatesAvailable', 3000);
        }
      }
    } catch (error) {
      console.error('[UpdateManager] Failed to check for updates:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.updateCheckFailed', 5000);
      }
    } finally {
      window.appSoundManager?.stop('loading');
    }
  }
}

if (typeof window !== 'undefined') {
  window.updateManager = new UpdateManager();
  console.log('Update Manager initialized');
}

export { type UpdateManager };
