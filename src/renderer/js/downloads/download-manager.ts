interface Download {
  id: string;
  url: string;
  fileName: string;
  status: 'downloading' | 'extracting' | 'completed' | 'failed' | 'paused';
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
  modName?: string;
  folderPath?: string | null;
  error?: string;
  statusText?: string;
  subItems?: string[];
}

interface FtpTransferState {
  id: string;
  status: string;
  currentMod: number;
  totalMods: number;
  transferredCount: number;
  totalFiles: number;
  progress: number;
  currentModName?: string;
  currentFileName?: string;
}

class DownloadManager {
  activeDownloads: Map<string, Download>;
  completedDownloads: Download[];
  activeDownloadsList: HTMLElement | null;
  completedDownloadsList: HTMLElement | null;
  downloadsEmpty: HTMLElement | null;
  downloadsCount: HTMLElement | null;
  clearCompletedBtn: HTMLButtonElement | null;
  sendToSwitchBtn: HTMLButtonElement | null;
  initialized: boolean;

  ftpTransfer: FtpTransferState | null;

  constructor() {
    this.activeDownloads = new Map();
    this.completedDownloads = [];
    this.activeDownloadsList = null;
    this.completedDownloadsList = null;
    this.downloadsEmpty = null;
    this.downloadsCount = null;
    this.clearCompletedBtn = null;
    this.sendToSwitchBtn = null;
    this.initialized = false;
    this.ftpTransfer = null;
    this.setupFtpProgressListener();
  }

  setupFtpProgressListener() {
    if (!window.electronAPI?.onFtpTransferProgress) {
      return;
    }

    window.electronAPI.onFtpTransferProgress((data: any) => {
      const currentState = this.ftpTransfer;

      this.ftpTransfer = {
        id: currentState?.id || Date.now().toString(),
        status: data.status || currentState?.status || 'uploading',
        currentMod: data.currentMod ?? currentState?.currentMod ?? 0,
        totalMods: data.totalMods ?? currentState?.totalMods ?? 0,
        transferredCount:
          data.transferredCount ?? currentState?.transferredCount ?? 0,
        totalFiles: data.totalFiles ?? currentState?.totalFiles ?? 0,
        progress: data.progress ?? currentState?.progress ?? 0,
        currentModName: data.currentModName ?? currentState?.currentModName,
        currentFileName: data.currentFileName ?? currentState?.currentFileName,
      };

      if (window.statusBarManager) {
        window.statusBarManager.checkAndUpdateForDownloads();
      }
    });
  }

  initialize() {
    console.log('Initializing Download Manager...');

    this.activeDownloadsList = document.querySelector<HTMLElement>(
      '#active-downloads-list',
    );
    this.completedDownloadsList = document.querySelector<HTMLElement>(
      '#completed-downloads-list',
    );
    this.downloadsEmpty =
      document.querySelector<HTMLElement>('#downloads-empty');
    this.downloadsCount =
      document.querySelector<HTMLElement>('#downloads-count');
    this.clearCompletedBtn = document.querySelector<HTMLButtonElement>(
      '#clear-completed-btn',
    );
    this.sendToSwitchBtn = document.querySelector<HTMLButtonElement>(
      '#send-to-switch-btn',
    );

    if (!this.activeDownloadsList || !this.completedDownloadsList) {
      console.error('Download lists not found');
      return;
    }

    this.initialized = true;

    this.setupEventListeners();

    this.renderAllDownloads();

    this.updateUI();

    console.log('Download Manager initialized');
  }

  /**
   * Render all stored downloads (called when tab is opened)
   */
  renderAllDownloads() {
    if (this.activeDownloadsList) {
      this.activeDownloadsList.innerHTML = '';
    }
    if (this.completedDownloadsList) {
      this.completedDownloadsList.innerHTML = '';
    }

    this.activeDownloads.forEach((download) => {
      this.renderActiveDownload(download);
    });

    this.completedDownloads.forEach((download) => {
      this.renderCompletedDownload(download);
    });
  }

  setupEventListeners() {
    if (this.clearCompletedBtn) {
      this.clearCompletedBtn.addEventListener('click', () => {
        this.clearCompleted();
      });
    }

    if (this.sendToSwitchBtn) {
      this.sendToSwitchBtn.addEventListener('click', () => {
        this.sendToSwitch();
      });
    }
  }

  /**
   * Start a new download
   */
  startDownload(url: string, forcedId: string, statusText?: string, subItems?: string[]) {
    const downloadId = forcedId || Date.now().toString();
    const existingDownload = this.activeDownloads.get(downloadId);

    if (existingDownload) {
      existingDownload.status = 'downloading';
      existingDownload.statusText = statusText || 'Downloading...';
      existingDownload.subItems = subItems || existingDownload.subItems;

      const element = document.querySelector<HTMLElement>(
        `[data-download-id="${downloadId}"]`,
      );
      if (element) {
        element.classList.remove('download-failed');
        this.updateActiveDownloadActions(element, existingDownload);
        this.updateStatus(downloadId, existingDownload.statusText, existingDownload.subItems);
      } else if (this.initialized) {
        this.renderActiveDownload(existingDownload);
      }

      window.appSoundManager?.play('downloading');
      this.updateUI();
      this.updateBadge();
      return downloadId;
    }

    const download: Download = {
      id: downloadId,
      url: url,
      fileName: this.extractFileName(url),
      status: 'downloading',
      progress: 0,
      receivedBytes: 0,
      totalBytes: 0,
      startTime: Date.now(),
      statusText: statusText,
      subItems: subItems,
    };

    this.activeDownloads.set(downloadId, download);
    window.appSoundManager?.play('downloading');

    if (this.initialized) {
      this.renderActiveDownload(download);
      this.updateUI();
    }

    this.updateBadge();

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }

    return downloadId;
  }

  /**
   * Update download progress
   */
  updateProgress(downloadId, progress, receivedBytes, totalBytes) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return;
    }

    download.progress = progress;
    download.receivedBytes = receivedBytes;
    download.totalBytes = totalBytes;
    const isExtractProgress = download.statusText?.toLowerCase().includes('extract');
    if (isExtractProgress) {
      console.log('[extract-progress][download-manager] updateProgress', {
        downloadId,
        progress,
        receivedBytes,
        totalBytes,
        statusText: download.statusText,
      });
    }

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );

    if (element) {
      const progressBar = element.querySelector<HTMLElement>(
        '.download-progress-fill',
      );
      const progressText = element.querySelector<HTMLElement>(
        '.download-progress-text',
      );

      if (progressBar) {
        const isExtracting = download.statusText?.toLowerCase().includes('extract');
        if (isExtracting && progress <= 0) {
          progressBar.classList.add('download-progress-indeterminate');
          progressBar.style.width = '';
          console.log('[extract-progress][download-manager] using indeterminate bar', {
            downloadId,
          });
        } else {
          progressBar.classList.remove('download-progress-indeterminate');
          progressBar.style.width = `${progress}%`;
          if (isExtractProgress) {
            console.log('[extract-progress][download-manager] set bar width', {
              downloadId,
              width: `${progress}%`,
            });
          }
        }
      }

      if (progressText) {
        if (download.statusText) {
          const lowerStatus = download.statusText.toLowerCase();
          if (lowerStatus.includes('extract')) {
            progressText.textContent = progress > 0 ? `${Math.round(progress)}%` : 'Extracting...';
            return;
          } else if (lowerStatus.includes('verif')) {
            progressText.textContent = 'Verifying...';
            return;
          }
        }
        progressText.textContent = `${progress}% (${this.formatBytes(
          receivedBytes,
        )} / ${this.formatBytes(totalBytes)})`;
      }
    }
  }

  /**
   * Update download status and subitems
   */
  updateStatus(downloadId: string, statusText?: string, subItems?: string[]) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    if (statusText !== undefined) {
      download.statusText = statusText;
    }
    if (subItems !== undefined) {
      download.subItems = subItems;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );

    if (element) {
      // Update status text
      const statusTextEl = element.querySelector<HTMLElement>('.download-status-text');
      if (statusTextEl && download.statusText) {
        statusTextEl.textContent = download.statusText;
      }

      // Update subitems
      const infoContainer = element.querySelector<HTMLElement>('.download-info');
      let subItemsContainer = element.querySelector<HTMLElement>('.download-subitems');

      if (download.subItems && download.subItems.length > 0) {
        const subItemsHtml = download.subItems.map(item =>
          `<span style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: var(--text-light); text-transform: uppercase;">${item}</span>`
        ).join('');

        if (subItemsContainer) {
          subItemsContainer.innerHTML = subItemsHtml;
        } else if (infoContainer) {
          // Find the URL element to insert after
          const urlEl = infoContainer.querySelector('.download-url');
          if (urlEl) {
            urlEl.insertAdjacentHTML('afterend', `
              <div class="download-subitems" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
                 ${subItemsHtml}
              </div>
            `);
          }
        }
      } else if (subItemsContainer) {
        // Remove container if no subitems left
        subItemsContainer.remove();
      }
    }
  }

  /**
   * Mark extracting phase
   */
  markExtracting(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    download.status = 'extracting';
    download.statusText = 'Extracting mod...';
    download.progress = 0;
    download.receivedBytes = 0;
    download.totalBytes = 0;
    console.log('[extract-progress][download-manager] markExtracting', {
      downloadId,
    });

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );

    if (element) {
      const progressBar = element.querySelector<HTMLElement>(
        '.download-progress-fill',
      );
      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );
      const progressText = element.querySelector<HTMLElement>(
        '.download-progress-text',
      );

      if (progressBar) {
        progressBar.classList.add('download-progress-indeterminate');
        progressBar.style.width = '';
      }
      if (statusText)
        statusText.innerHTML = '<i class="bi bi-file-zip"></i> Extracting mod...';
      if (progressText) progressText.textContent = 'Extracting...';
    }

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }
  }

  /**
   * Complete a download
   */
  completeDownload(
    downloadId: string,
    resultingMods: {
      modPath: string;
      modName: string;
    }[],
  ) {
    const downloadBase = this.activeDownloads.get(downloadId);

    if (!downloadBase) {
      const downloads = Array.from(this.activeDownloads.values());

      if (downloads.length > 0) {
        const latestDownload = downloads[downloads.length - 1];
        this.completeDownload(latestDownload.id, resultingMods);
      }

      return;
    }

    resultingMods.forEach((mod) => {
      const download = { ...downloadBase };

      download.status = 'completed';
      download.progress = 100;
      download.modName = mod.modName;
      download.folderPath = mod.modPath;
      download.endTime = Date.now();

      this.completedDownloads.unshift(download);

      if (this.initialized) {
        const element = document.querySelector<HTMLElement>(
          `[data-download-id="${downloadId}"]`,
        );

        if (element) {
          element.remove();
        }

        this.renderCompletedDownload(download);
      }
    });

    this.activeDownloads.delete(downloadId);

    this.updateUI();
    this.updateBadge();
    window.appSoundManager?.stop('downloading');
    window.appSoundManager?.play('complete');

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }
  }

  /**
   * Fail a download
   */
  failDownload(downloadId, error) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      const downloads = Array.from(this.activeDownloads.values());
      if (downloads.length > 0) {
        const latestDownload = downloads[downloads.length - 1];
        this.failDownload(latestDownload.id, error);
      }
      return;
    }

    download.status = 'failed';
    download.error = error;
    window.appSoundManager?.stop('downloading');
    window.appSoundManager?.play('error');

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );
    if (element) {
      element.classList.add('download-failed');

      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );

      if (statusText) {
        statusText.innerHTML = `<i class="bi bi-x-circle"></i> Failed: ${error}`;
        statusText.style.color = '#ff4444';
      }
    }

    setTimeout(() => {
      this.activeDownloads.delete(downloadId);
      if (element) {
        element.remove();
      }
      this.updateUI();
      this.updateBadge();

      if (window.statusBarManager) {
        window.statusBarManager.checkAndUpdateForDownloads();
      }
    }, 5000);
  }

  pauseDownload(downloadId, receivedBytes = 0, totalBytes = 0) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    download.status = 'paused';
    download.receivedBytes = receivedBytes || download.receivedBytes;
    download.totalBytes = totalBytes || download.totalBytes;
    download.statusText = 'Paused';
    window.appSoundManager?.stop('downloading');

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );

    if (element) {
      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );
      if (statusText) {
        statusText.innerHTML = '<i class="bi bi-pause-circle"></i> Paused';
        statusText.style.color = '#f59e0b';
      }
      this.updateActiveDownloadActions(element, download);
    }

    this.updateUI();
    this.updateBadge();
  }

  async resumeDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download || download.status !== 'paused') return;

    if (window.electronAPI?.resumeDownload) {
      const result = await window.electronAPI.resumeDownload(downloadId);
      if (!result?.success) {
        this.failDownload(downloadId, result?.error || 'Unable to resume download');
        return;
      }
    }

    download.status = 'downloading';
    download.statusText = 'Downloading...';
    window.appSoundManager?.play('downloading');

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );
    if (element) {
      element.classList.remove('download-failed');
      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );
      if (statusText) {
        statusText.innerHTML = 'Downloading...';
        statusText.style.color = '';
      }
      this.updateActiveDownloadActions(element, download);
    }
  }

  updateActiveDownloadActions(element: HTMLElement, download: Download) {
    const actions = element.querySelector<HTMLElement>('.download-actions');
    if (!actions) return;

    if (download.status === 'paused') {
      actions.innerHTML = `
        <button class="download-action-btn" data-action="resume" title="Resume"><i class="bi bi-play-circle"></i></button>
      `;
      actions
        .querySelector<HTMLElement>('[data-action="resume"]')
        ?.addEventListener('click', () => this.resumeDownload(download.id));
      return;
    }

    actions.innerHTML = `
      <button class="download-action-btn" data-action="cancel" title="Cancel"><i class="bi bi-x-circle"></i></button>
    `;
    actions
      .querySelector<HTMLElement>('[data-action="cancel"]')
      ?.addEventListener('click', () => this.cancelDownload(download.id));
  }

  /**
   * Render active download
   */
  renderActiveDownload(download) {
    if (!this.activeDownloadsList) return;

    const element = document.createElement('div');
    element.className = 'download-item download-active';
    element.setAttribute('data-download-id', download.id);

    const subItemsHtml = download.subItems && download.subItems.length > 0
      ? `<div class="download-subitems" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
             ${download.subItems.map(item => `<span style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: var(--text-light); text-transform: uppercase;">${item}</span>`).join('')}
           </div>`
      : '';

    element.innerHTML = `
<div class="download-icon">
<i class="bi bi-download"></i>
</div>
<div class="download-info">
<div class="download-name">${download.fileName}</div>
<div class="download-url">${this.shortenUrl(download.url)}</div>
${subItemsHtml}
<div class="download-progress-container">
<div class="download-progress-bar">
<div class="download-progress-fill" style="width: ${download.progress}%"></div>
</div>
<div class="download-progress-text">0%</div>
</div>
<div class="download-status-text">${download.statusText || 'Downloading...'}</div>
</div>
<div class="download-actions">
  <button class="download-action-btn" data-action="cancel" title="Cancel"><i class="bi bi-x-circle"></i></button>
</div>
`;

    this.updateActiveDownloadActions(element, download);

    this.activeDownloadsList.appendChild(element);
  }

  /**
   * Render completed download
   */
  renderCompletedDownload(download) {
    if (!this.completedDownloadsList) return;

    const element = document.createElement('div');
    element.className = 'download-item download-completed';
    element.setAttribute('data-download-id', download.id);

    // Safely format duration
    let duration = 'N/A';
    if (download.endTime && download.startTime) {
      try {
        duration = this.formatDuration(download.endTime - download.startTime);
      } catch (e) {
        console.warn('Error formatting duration:', e);
      }
    }

    // Safely format file size
    let fileSize = 'Unknown';
    if (download.totalBytes) {
      try {
        fileSize = this.formatBytes(download.totalBytes);
      } catch (e) {
        console.warn('Error formatting bytes:', e);
      }
    }

    element.innerHTML = `
    <div class="download-icon download-icon-success">
      <i class="bi bi-check-circle-fill"></i>
    </div>
    <div class="download-info">
      <div class="download-name">${download.modName || download.fileName}</div>
      <div class="download-url">${this.shortenUrl(download.url)}</div>
      <div class="download-meta">
        <span><i class="bi bi-check-circle"></i> Completed in ${duration}</span>
        <span><i class="bi bi-file-earmark-zip"></i> ${fileSize}</span>
      </div>
    </div>
    <div class="download-actions">
      <button class="download-action-btn" data-action="goto" title="Go to mod">
        <i class="bi bi-arrow-right-circle"></i>
      </button>
    </div>
  `;

    const gotoBtn = element.querySelector<HTMLElement>('[data-action="goto"]');
    if (gotoBtn) {
      gotoBtn.addEventListener('click', () => {
        this.navigateToMod(download.modName || download.fileName);
      });
    }

    this.completedDownloadsList.appendChild(element);
  }

  navigateToMod(modName: string) {
    if (!window.modManager || !window.modManager.mods) return;

    const normalizedName = modName.toLowerCase().replace(/^\[.*?\]\s*/, '');
    const mod = window.modManager.mods.find((m) => {
      const mName = m.name.toLowerCase().replace(/^\[.*?\]\s*/, '');
      return mName === normalizedName || m.name.toLowerCase().includes(normalizedName);
    });

    if (!mod) {
      console.log('[navigateToMod] Mod not found:', modName);
      if (window.toastManager) {
        window.toastManager.warning('Mod not found in your library');
      }
      return;
    }

    const toolsBtn = document.querySelector<HTMLElement>('[data-tab="tools"]');
    if (toolsBtn) {
      toolsBtn.click();
    }

    setTimeout(() => {
      window.modManager.selectMod(mod.id);

      const modElement = document.querySelector<HTMLElement>(`[data-mod-id="${mod.id}"]`);
      if (modElement) {
        modElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  }

  navigateToSetting(settingsTab: string, targetSelector: string) {
    const settingsBtn = document.querySelector<HTMLElement>('[data-tab="settings"]');
    if (settingsBtn) settingsBtn.click();

    setTimeout(() => {
      if (window.settingsManager) {
        window.settingsManager.switchSettingsTab(settingsTab);
      }

      setTimeout(() => {
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (!target) return;

        const section = target.closest<HTMLElement>('.settings-section') || target;

        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const original = section.style.boxShadow;
        section.style.transition = 'box-shadow 0.4s ease';
        section.style.boxShadow = '0 0 0 2px rgba(var(--accent-rgb), 0.6), 0 0 20px rgba(var(--accent-rgb), 0.3)';
        section.style.borderRadius = '12px';

        setTimeout(() => {
          section.style.boxShadow = original;
          setTimeout(() => {
            section.style.transition = '';
            section.style.borderRadius = '';
          }, 400);
        }, 3000);
      }, 400);
    }, 300);
  }

  /**
   * Update UI visibility
   */
  updateUI() {
    const hasActiveDownloads = this.activeDownloads.size > 0;
    const hasCompletedDownloads = this.completedDownloads.length > 0;
    const hasAnyDownloads = hasActiveDownloads || hasCompletedDownloads;

    if (this.downloadsEmpty) {
      this.downloadsEmpty.style.display = hasAnyDownloads ? 'none' : 'flex';
    }

    const activeSections = document.querySelector<HTMLElement>(
      '#active-downloads-section',
    );
    const completedSections = document.querySelector<HTMLElement>(
      '#completed-downloads-section',
    );

    if (activeSections) {
      activeSections.style.display = hasActiveDownloads ? 'block' : 'none';
    }

    if (completedSections) {
      completedSections.style.display = hasCompletedDownloads
        ? 'block'
        : 'none';
    }

    if (this.downloadsCount) {
      const totalCount =
        this.activeDownloads.size + this.completedDownloads.length;

      this.downloadsCount.textContent = `${totalCount}`;
    }

    if (this.clearCompletedBtn) {
      this.clearCompletedBtn.style.display = hasCompletedDownloads
        ? 'block'
        : 'none';
    }
  }

  /**
   * Update notification badge
   */
  updateBadge() {
    const downloadsBtn = document.querySelector<HTMLElement>(
      '[data-tab="downloads"]',
    );
    if (!downloadsBtn) return;

    let badge = downloadsBtn.querySelector<HTMLElement>('.notification-badge');

    if (this.activeDownloads.size > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notification-badge';
        downloadsBtn.style.position = 'relative';
        downloadsBtn.appendChild(badge);
      }

      badge.textContent = `${this.activeDownloads.size}`;
      badge.style.display = 'flex';
    } else {
      if (badge) {
        badge.style.display = 'none';
      }
    }
  }

  /**
   * Switch to downloads tab
   */
  switchToDownloadsTab() {
    const downloadsBtn = document.querySelector<HTMLElement>(
      '[data-tab="downloads"]',
    );

    if (downloadsBtn) {
      downloadsBtn.click();
    }
  }

  /**
   * Clear completed downloads
   */
  clearCompleted() {
    this.completedDownloads = [];
    if (this.completedDownloadsList) {
      this.completedDownloadsList.innerHTML = '';
    }
    this.updateUI();
  }

  /**
   * Extract filename from URL
   */
  extractFileName(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      return filename || 'mod.zip';
    } catch {
      return 'mod.zip';
    }
  }

  /**
   * Shorten URL for display
   */
  shortenUrl(url) {
    if (url.length > 60) {
      return url.substring(0, 57) + '...';
    }
    return url;
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Send newly installed mods to Switch via FTP
   */
  async sendToSwitch() {
    if (!window.settingsManager || !window.settingsManager.hasSwitchConfig()) {
      if (window.toastManager) {
        window.toastManager.error('toasts.switchSettingsNotConfigured', 5000, {}, {
          actionButton: {
            text: window.i18n?.t?.('toasts.settings') || 'Settings',
            onClick: () => this.navigateToSetting('advanced', '#switch-transfer-method-select'),
          },
        });
      }
      return;
    }

    const transferMethod = window.settingsManager.getSwitchTransferMethod();
    if (
      window.settingsManager.getAppRunMode?.() === 'hardware' &&
      window.settingsManager.getHardwareLibraryMode?.() === 'direct'
    ) {
      window.toastManager?.info?.('toasts.directSwitchLibraryNoSync');
      return;
    }

    if (transferMethod === 'none') {
      if (window.toastManager) {
        window.toastManager.error('toasts.switchSettingsNotConfigured', 5000, {}, {
          actionButton: {
            text: window.i18n?.t?.('toasts.settings') || 'Settings',
            onClick: () => this.navigateToSetting('advanced', '#switch-transfer-method-select'),
          },
        });
      }
      return;
    }

    if (transferMethod === 'mtp') {
      await this.sendToSwitchMtp();
      return;
    }

    const switchIp = window.settingsManager.getSwitchIp();
    const switchPort = parseInt(window.settingsManager.getSwitchPort());
    const switchFtpUser = window.settingsManager.getSwitchFtpUser();
    const switchFtpPassword = window.settingsManager.getSwitchFtpPassword();
    const switchFtpModsPath =
      window.settingsManager.getSwitchFtpModsPath?.() ||
      window.settingsManager.getSwitchFtpPath() ||
      '/ultimate/mods';
    const switchFtpPluginsPath =
      window.settingsManager.getSwitchFtpPluginsPath?.() ||
      '/ultimate/contents/01006A800016E000/romfs/skyline/plugins';
    const switchDriveLetter = window.settingsManager.getSwitchDriveLetter();

    if (!window.settingsManager || !window.settingsManager.hasModsPath()) {
      if (window.toastManager) {
        window.toastManager.error('toasts.modsFolderPathNotSet', 5000, {}, {
          actionButton: {
            text: window.i18n?.t?.('toasts.settings') || 'Settings',
            onClick: () => this.navigateToSetting('paths', '#mods-folder-path'),
          },
        });
      }
      return;
    }

    const modsPath = window.settingsManager.getModsPath();
    const pluginsPath = window.settingsManager.getPluginsPath?.() || null;

    // Call the Electron API to send mods to Switch
    if (!window.electronAPI || !window.electronAPI.sendModsToSwitch) {
      if (window.toastManager) {
        window.toastManager.error('toasts.ftpNotAvailable');
      } else {
        alert('FTP functionality not available');
      }
      console.error('Electron API sendModsToSwitch not available');
      return;
    }

    try {
      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = true;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> ${t(
          'downloads.sending',
        )}`;
      }
      window.appSoundManager?.play('loading', { volume: 0.55 });

      // Update FTP transfer status
      this.ftpTransfer = {
        id: Date.now().toString(),
        status: 'uploading',
        currentMod: 0,
        totalMods: 0,
        transferredCount: 0,
        totalFiles: 0,
        progress: 0,
      };

      if (window.statusBarManager) {
        window.statusBarManager.checkAndUpdateForDownloads();
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.startingFtpTransfer');
      }

      const result = await window.electronAPI.sendModsToSwitch({
        switchTransferMethod: transferMethod,
        switchIp,
        switchPort,
        switchFtpUser,
        switchFtpPassword,
        switchFtpPath: switchFtpModsPath,
        switchFtpModsPath,
        switchFtpPluginsPath,
        switchDriveLetter,
        modsPath,
        pluginsPath,
        recentDownloads: [],
      });

      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = false;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-device-hdd"></i> ${t(
          'downloads.sendToSwitch',
        )}`;
      }

      // Clear FTP transfer status
      this.ftpTransfer = null;

      if (result.success) {
        window.appSoundManager?.stop('loading');
        window.appSoundManager?.play('complete');
        window.statusBarManager?.completeFtpTransfer?.(
          result.transferredCount || 0,
        );
        if (window.toastManager) {
          window.toastManager.success('toasts.modsSentToSwitch', 3000, {
            count: result.transferredCount || 0,
          });
        }
      } else {
        window.appSoundManager?.stop('loading');
        window.appSoundManager?.play('error');
        window.statusBarManager?.updateExtendedBar?.({ type: 'none' });
        window.statusBarManager?.refreshStandardStatus?.();
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSendMods', 3000, {
            error: result.error || 'Unknown error',
          });
        } else {
          alert(`Failed to send mods: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error sending mods to Switch:', error);
      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = false;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-device-hdd"></i> ${t(
          'downloads.sendToSwitch',
        )}`;
      }
      this.ftpTransfer = null;
      window.appSoundManager?.stop('loading');
      window.statusBarManager?.updateExtendedBar?.({ type: 'none' });
      window.statusBarManager?.refreshStandardStatus?.();
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSendMods', 3000, {
          error: error.message,
        });
      } else {
        alert(`Error: ${error.message}`);
      }
    }

    if (window.statusBarManager && this.ftpTransfer) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }
  }

  async sendToSwitchMtp() {
    if (!window.settingsManager || !window.settingsManager.hasModsPath()) {
      if (window.toastManager) {
        window.toastManager.error('toasts.modsFolderPathNotSet', 5000, {}, {
          actionButton: {
            text: window.i18n?.t?.('toasts.settings') || 'Settings',
            onClick: () => this.navigateToSetting('paths', '#mods-folder-path'),
          },
        });
      }
      return;
    }

    if (
      !window.electronAPI?.prepareMtpTransfer ||
      !window.electronAPI?.readMtpTransferFile
    ) {
      window.toastManager?.error('toasts.ftpNotAvailable');
      return;
    }

    const modsPath = window.settingsManager.getModsPath();
    const pluginsPath = window.settingsManager.getPluginsPath?.() || null;
    const switchFtpModsPath =
      window.settingsManager.getSwitchFtpModsPath?.() ||
      window.settingsManager.getSwitchFtpPath() ||
      '/ultimate/mods';
    const switchFtpPluginsPath =
      window.settingsManager.getSwitchFtpPluginsPath?.() ||
      '/ultimate/contents/01006A800016E000/romfs/skyline/plugins';

    let mtpClient: MTPTransferClient | null = null;

    try {
      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = true;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> ${t(
          'downloads.sending',
        )}`;
      }

      window.appSoundManager?.play('loading', { volume: 0.55 });
      window.toastManager?.info('toasts.startingMtpTransfer');

      mtpClient = new MTPTransferClient();
      await mtpClient.connect();

      const manifest = await window.electronAPI.prepareMtpTransfer({
        switchTransferMethod: 'mtp',
        switchIp: '',
        switchPort: 0,
        switchFtpUser: null,
        switchFtpPassword: null,
        switchFtpPath: switchFtpModsPath,
        switchFtpModsPath,
        switchFtpPluginsPath,
        switchDriveLetter: '',
        modsPath,
        pluginsPath,
        recentDownloads: [],
      });

      if (!manifest.success) {
        throw new Error(manifest.error || 'Unable to prepare MTP transfer');
      }

      this.ftpTransfer = {
        id: Date.now().toString(),
        status: 'uploading',
        currentMod: 0,
        totalMods: 0,
        transferredCount: 0,
        totalFiles: manifest.totalFiles || 0,
        progress: 0,
      };

      const transferredCount = await mtpClient.uploadFiles(
        manifest.files,
        async (fileId) => {
          const result = await window.electronAPI.readMtpTransferFile(fileId);
          if (!result.success) {
            throw new Error(
              result.error || 'Unable to read file for MTP transfer',
            );
          }
          return new Uint8Array(result.bytes);
        },
        (progress) => {
          this.ftpTransfer = {
            id: this.ftpTransfer?.id || Date.now().toString(),
            status: 'uploading',
            ...progress,
          };
          window.statusBarManager?.checkAndUpdateForDownloads();
        },
      );

      this.ftpTransfer = null;
      window.appSoundManager?.stop('loading');
      window.appSoundManager?.play('complete');
      window.statusBarManager?.completeFtpTransfer?.(transferredCount);
      window.toastManager?.success('toasts.modsSentToSwitch', 3000, {
        count: transferredCount,
      });
    } catch (error) {
      console.error('Error sending mods to Switch over MTP:', error);
      this.ftpTransfer = null;
      window.appSoundManager?.stop('loading');
      window.appSoundManager?.play('error');
      window.statusBarManager?.updateExtendedBar?.({ type: 'none' });
      window.statusBarManager?.refreshStandardStatus?.();
      window.toastManager?.error('toasts.failedToSendMods', 3000, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (mtpClient) {
        await mtpClient.disconnect();
      }

      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = false;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-device-hdd"></i> ${t(
          'downloads.sendToSwitch',
        )}`;
      }
    }
  }

  /**
   * Cancel a download
   */
  cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    // Call main process to pause the download and keep the partial file.
    if (window.electronAPI && window.electronAPI.cancelDownload) {
      window.electronAPI.cancelDownload(downloadId);
    }

    this.pauseDownload(downloadId, download.receivedBytes, download.totalBytes);
  }
}

if (typeof window !== 'undefined') {
  window.downloadManager = new DownloadManager();
  console.log('Download Manager created');
}

export { type DownloadManager };
