class ProtocolListener {
  idMap: Map<string, string>;
  gameBananaNames: Map<string, string>;

  constructor() {
    this.idMap = new Map();
    this.gameBananaNames = new Map();
    this.setupListeners();
  }

  t(key: string, params = {}) {
    return window.i18n?.t ? window.i18n.t(key, params) : key;
  }

  sanitizeSuggestedName(name: string) {
    return name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 120);
  }

  validateCustomName(name: string) {
    if (!name) return this.t('modals.unnamedMod.nameRequired');
    if (
      name === '.' ||
      name === '..' ||
      name.length > 120 ||
      /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
      /[. ]$/.test(name)
    ) {
      return this.t('modals.unnamedMod.invalidName');
    }
    return null;
  }

  async promptForUnnamedMod(
    mod: { modPath: string; modName: string },
    gameBananaName: string | null,
  ): Promise<{ modPath: string; modName: string } | null> {
    if (!window.modalManager?.showCustomModal) return null;

    const suggestedName = gameBananaName
      ? this.sanitizeSuggestedName(gameBananaName)
      : '';

    return new Promise((resolve) => {
      let renamedMod: { modPath: string; modName: string } | null = null;
      let renaming = false;
      const body = document.createElement('div');
      body.className = 'unnamed-mod-name-body';

      const description = document.createElement('p');
      description.className = 'modal-hint';
      description.textContent = this.t('modals.unnamedMod.description', {
        name: mod.modName,
      });

      const currentName = document.createElement('code');
      currentName.className = 'unnamed-mod-current-name';
      currentName.textContent = mod.modName;

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.htmlFor = 'unnamed-mod-name-input';
      label.textContent = this.t('modals.unnamedMod.label');

      const input = document.createElement('input');
      input.id = 'unnamed-mod-name-input';
      input.className = 'modal-input';
      input.type = 'text';
      input.maxLength = 120;
      input.autocomplete = 'off';
      input.placeholder = this.t('modals.unnamedMod.placeholder');

      const error = document.createElement('p');
      error.className = 'unnamed-mod-name-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      body.append(description, currentName, label, input);

      if (suggestedName) {
        const suggestion = document.createElement('p');
        suggestion.className = 'unnamed-mod-gamebanana-suggestion';
        suggestion.textContent = this.t(
          'modals.unnamedMod.gameBananaSuggestion',
          { name: suggestedName },
        );
        body.appendChild(suggestion);
      }

      body.appendChild(error);

      const rename = async (name: string) => {
        if (renaming) return false;

        const trimmedName = name.trim();
        const validationError = this.validateCustomName(trimmedName);
        if (validationError) {
          error.textContent = validationError;
          error.hidden = false;
          input.focus();
          return false;
        }

        renaming = true;
        const modal = body.closest<HTMLElement>('.modal');
        modal?.setAttribute('aria-busy', 'true');
        modal
          ?.querySelectorAll<HTMLButtonElement>('.modal-btn')
          .forEach((button) => (button.disabled = true));
        input.disabled = true;

        const result = await window.electronAPI.renameMod(
          mod.modPath,
          trimmedName,
        );
        if (!result.success) {
          error.textContent = this.t('modals.unnamedMod.renameFailed', {
            error: result.error || 'Unknown error',
          });
          error.hidden = false;
          renaming = false;
          modal?.removeAttribute('aria-busy');
          modal
            ?.querySelectorAll<HTMLButtonElement>('.modal-btn')
            .forEach((button) => (button.disabled = false));
          input.disabled = false;
          input.focus();
          return false;
        }

        renamedMod = { modPath: result.newPath, modName: trimmedName };
        return true;
      };

      const buttons: Array<{
        text: string;
        type: string;
        id?: string;
        onClick: () => void | Promise<boolean>;
      }> = [
        {
          text: this.t('common.cancel'),
          type: 'cancel',
          onClick: () => {},
        },
      ];

      if (suggestedName) {
        buttons.push({
          text: this.t('modals.unnamedMod.useGameBanana'),
          type: 'secondary',
          onClick: () => rename(suggestedName),
        });
      }

      buttons.push({
        text: this.t('modals.unnamedMod.useCustomName'),
        type: 'primary',
        id: 'unnamed-mod-custom-name-btn',
        onClick: () => rename(input.value),
      });

      window.modalManager.showCustomModal({
        id: 'unnamed-mod-name-modal',
        title: this.t('modals.unnamedMod.title'),
        body,
        clickOverlayToClose: false,
        buttons,
        onClose: () => resolve(renamedMod),
      });

      input.addEventListener('input', () => {
        error.hidden = true;
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          document
            .querySelector<HTMLButtonElement>('#unnamed-mod-custom-name-btn')
            ?.click();
        }
      });
      window.setTimeout(() => input.focus(), 100);
    });
  }

  async resolveUnnamedMods(
    mods: Array<{ modPath: string; modName: string }>,
    gameBananaName: string | null,
  ) {
    for (let index = 0; index < mods.length; index++) {
      if (!/^mod-\d+$/.test(mods[index].modName)) continue;
      const renamed = await this.promptForUnnamedMod(
        mods[index],
        gameBananaName,
      );
      if (renamed) mods[index] = renamed;
    }
  }

  setupListeners() {
    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }

    window.electronAPI.onModInstallStart((data) => {
      console.log('Mod installation started:', data);

      if (window.downloadManager) {
        const rendererId = window.downloadManager.startDownload(
          data.url,
          data.downloadId,
          data.statusText,
          data.subItems,
        );
        this.idMap.set(data.downloadId, rendererId);

        if (data.modName && window.downloadManager.activeDownloads) {
          const download =
            window.downloadManager.activeDownloads.get(rendererId);
          if (download) {
            download.modName = data.modName;
          }
        }
      }

      if (data.modName && !data.subItems?.length) {
        this.gameBananaNames.set(data.downloadId, data.modName);
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.downloadStarted');
      }
    });

    window.electronAPI.onModDownloadProgress((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        if (data.statusText?.toLowerCase().includes('extract')) {
          console.log('[extract-progress][renderer-ipc] received', {
            mainDownloadId: data.downloadId,
            rendererId,
            progress: data.progress,
            statusText: data.statusText,
          });
        }
        window.downloadManager.updateProgress(
          rendererId,
          data.progress,
          data.receivedBytes,
          data.totalBytes,
        );

        if (data.statusText !== undefined || data.subItems !== undefined) {
          window.downloadManager.updateStatus(rendererId, data.statusText, data.subItems);
        }
      }
    });

    window.electronAPI.onModDownloadPaused((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.pauseDownload(
          rendererId,
          data.receivedBytes,
          data.totalBytes,
        );
      }

      if (window.toastManager) {
        window.toastManager.warning('toasts.downloadCancelled');
      }
    });

    window.electronAPI.onModExtractStart((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        console.log('[extract-progress][renderer-ipc] extract start', {
          mainDownloadId: data.downloadId,
          rendererId,
        });
        window.downloadManager.markExtracting(rendererId);
      }
    });
    window.electronAPI.onModExtractComplete((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.updateProgress(rendererId, 100, 0, 0);
      }
    });

    window.electronAPI.onModInstallSuccess(async (data) => {
      console.log('Mod installed successfully:', data);

      const gameBananaName =
        this.gameBananaNames.get(data.downloadId) || null;
      await this.resolveUnnamedMods(data.resultingMods, gameBananaName);

      if (window.downloadManager) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.completeDownload(rendererId, data.resultingMods);
      }

      if (window.toastManager) {
        window.toastManager.success('toasts.modInstalledSuccessfully', 5000, {
          name: data.resultingMods
            .map((resultingMod) => resultingMod.modName)
            .join(', '),

          plural: data.resultingMods.length > 1 ? 's' : '',
        });
      }

      setTimeout(() => {
        if (window.modManager) {
          console.log('Refreshing mod list...');
          window.modManager.fetchMods();
        }
      }, 500);

      if (data.downloadId) {
        this.idMap.delete(data.downloadId);
        this.gameBananaNames.delete(data.downloadId);
      }
    });

    window.electronAPI.onModInstallError((data) => {
      console.error('Mod installation failed:', data);

      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.failDownload(rendererId, data.error);
      }

      if (window.toastManager) {
        window.toastManager.error('toasts.installationFailed', 3000, {
          error: data.error,
        });
      }

      if (data.downloadId) {
        this.idMap.delete(data.downloadId);
        this.gameBananaNames.delete(data.downloadId);
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.protocolListener = new ProtocolListener();
  console.log('Protocol Listener initialized');
}

export { type ProtocolListener };
