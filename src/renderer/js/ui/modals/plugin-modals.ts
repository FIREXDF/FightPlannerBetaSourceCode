export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) {
    console.error('[plugin-modals] ModalManagerClass not found');
    return;
  }

  M.prototype.openPluginUpdateModal = function (updates, plugins) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'plugin-update-modal';

    const updatesList = updates
      .map((update) => {
        const plugin = plugins.find(
          (p) =>
            p.name === update.pluginName ||
            p.name.replace('.nro', '') === update.pluginName,
        );
        const pluginPath = plugin ? plugin.filePath : null;

        return `
        <div class="plugin-update-item" data-plugin-name="${update.pluginName}">
          <div class="plugin-update-info">
            <span class="plugin-update-name">${this.escapeHtml(update.pluginName)}</span>
            <span class="plugin-update-versions">
              ${update.currentVersion} → ${update.latestVersion}
            </span>
          </div>
          <button class="modal-btn modal-btn-primary update-plugin-btn" 
                  data-plugin-name="${update.pluginName}"
                  data-download-url="${update.downloadUrl || ''}"
                  data-plugin-path="${pluginPath || ''}"
                  data-latest-version="${update.latestVersion || ''}">
            Update
          </button>
        </div>
      `;
      })
      .join('');

    modal.innerHTML = `
    <div class="modal-header">
      <h2>Plugin Updates Available</h2>
    </div>
    <div class="modal-body">
      <p style="margin-bottom: 15px; color: #aaa;">
        The following plugins have updates available:
      </p>
      <div class="plugin-updates-list">
        ${updatesList}
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-primary" id="update-all-plugins-btn">
        Update All
      </button>
      <button class="modal-btn modal-btn-secondary" id="close-plugin-update-modal">
        Close
      </button>
    </div>
  `;

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (!overlay) {
      const newOverlay = document.createElement('div');
      newOverlay.id = 'modal-overlay';
      document.body.appendChild(newOverlay);
    }

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    const closeBtn = modal.querySelector<HTMLButtonElement>(
      '#close-plugin-update-modal',
    );
    closeBtn!.addEventListener('click', () => {
      this.closePluginUpdateModal();
    });

    const updateAllBtn = modal.querySelector<HTMLButtonElement>(
      '#update-all-plugins-btn',
    );

    updateAllBtn!.addEventListener('click', async () => {
      const updateButtons = modal.querySelectorAll<HTMLButtonElement>(
        '.update-plugin-btn:not(:disabled)',
      );

      if (updateButtons.length === 0) {
        if (window.toastManager) {
          window.toastManager.info('No plugins to update');
        }
        return;
      }

      updateAllBtn!.disabled = true;
      updateAllBtn!.textContent = 'Updating all...';

      for (const btn of updateButtons) {
        const pluginName = btn.dataset.pluginName;
        const downloadUrl = btn.dataset.downloadUrl;
        const pluginPath = btn.dataset.pluginPath;
        const targetVersion = btn.dataset.latestVersion;

        if (!downloadUrl || !pluginPath) {
          continue;
        }

        btn.disabled = true;
        btn.textContent = 'Updating...';

        if (window.pluginManager) {
          await window.pluginManager.updatePlugin(
            pluginName,
            downloadUrl,
            pluginPath,
            targetVersion,
          );
        }

        const updateItem = modal.querySelector<HTMLElement>(
          `[data-plugin-name="${pluginName}"]`,
        );
        if (updateItem) {
          updateItem.style.opacity = '0.5';
        }
      }

      setTimeout(() => {
        this.closePluginUpdateModal();

        if (window.toastManager) {
          window.toastManager.success('All updates completed');
        }
      }, 1000);
    });

    const updateButtons =
      modal.querySelectorAll<HTMLButtonElement>('.update-plugin-btn');

    updateButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pluginName = btn.dataset.pluginName;
        const downloadUrl = btn.dataset.downloadUrl;
        const pluginPath = btn.dataset.pluginPath;
        const targetVersion = btn.dataset.latestVersion;

        if (!downloadUrl) {
          if (window.toastManager) {
            window.toastManager.error(
              `No download URL available for ${pluginName}`,
            );
          }
          return;
        }

        if (!pluginPath) {
          if (window.toastManager) {
            window.toastManager.error(
              `Plugin path not found for ${pluginName}`,
            );
          }
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Updating...';

        if (window.pluginManager) {
          await window.pluginManager.updatePlugin(
            pluginName,
            downloadUrl,
            pluginPath,
            targetVersion,
          );
        }

        const updateItem = modal.querySelector<HTMLElement>(
          `[data-plugin-name="${pluginName}"]`,
        );

        if (updateItem) {
          updateItem.style.opacity = '0.5';
        }

        const remainingUpdates = modal.querySelectorAll<HTMLElement>(
          ".plugin-update-item:not([style*='opacity: 0.5'])",
        );
        if (remainingUpdates.length === 0) {
          setTimeout(() => {
            this.closePluginUpdateModal();

            if (window.toastManager) {
              window.toastManager.success('All updates completed');
            }
          }, 1000);
        }
      });
    });

    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closePluginUpdateModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  };

  M.prototype.closePluginUpdateModal = function () {
    this.closeModal('plugin-update-modal');
  };

  M.prototype.openPluginMarketplaceModal = async function () {
    document
      .querySelectorAll<HTMLElement>('#plugin-marketplace-modal')
      .forEach((existingModal) => existingModal.remove());

    const modal = document.createElement('div');
    modal.className = 'modal modal-large modal-marketplace';
    modal.id = 'plugin-marketplace-modal';

    modal.innerHTML = `
    <div class="modal-header">
      <h2 data-i18n="plugins.marketplace">Plugin Marketplace</h2>
    </div>
    <div class="modal-body">
      <div id="marketplace-results" class="marketplace-results">
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-secondary" id="close-marketplace-modal">
        <span data-i18n="common.close">Close</span>
      </button>
    </div>
  `;

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (!overlay) {
      const newOverlay = document.createElement('div');
      newOverlay.id = 'modal-overlay';
      document.body.appendChild(newOverlay);
    }

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    const resultsContainer = modal.querySelector<HTMLElement>(
      '#marketplace-results',
    );

    let installedRepos: string[] = [];
    if (window.electronAPI && window.electronAPI.getPluginRepoMapping) {
      try {
        const result = await window.electronAPI.getPluginRepoMapping();
        if (result.success && result.mappings) {
          installedRepos = Object.values(result.mappings) as string[];
        }
      } catch (error) {
        console.warn(
          '[openPluginMarketplaceModal] Failed to get plugin repo mappings:',
          error,
        );
      }
    }

    if (window.pluginMarketplace) {
      const plugins = window.pluginMarketplace.getPlugins();
      this.renderMarketplaceResults(plugins, resultsContainer!, installedRepos);
    }

    const closeBtn = modal.querySelector<HTMLElement>(
      '#close-marketplace-modal',
    );

    closeBtn!.addEventListener('click', () => {
      this.closePluginMarketplaceModal(modal);
    });

    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closePluginMarketplaceModal(modal);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  };

  M.prototype.renderMarketplaceResults = function (
    plugins: any[],
    container: HTMLElement,
    installedRepos: string[] = [],
  ) {
    if (!plugins || plugins.length === 0) {
      container.innerHTML = `
      <div class="marketplace-empty">
        <i class="bi bi-inbox" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
        <p data-i18n="plugins.marketplaceNoResults">No plugins available</p>
      </div>
    `;
      if (window.i18n) {
        window.i18n.updateDOM();
      }
      return;
    }

    const pluginsGrid = plugins
      .map((plugin) => {
        const isInstalled = installedRepos.some(
          (installedRepo) =>
            installedRepo.toLowerCase() === plugin.repo.toLowerCase(),
        );
        const isGameBanana = plugin.source === 'gamebanana';
        const isCskCollection = plugin.specialInstaller === 'csk-collection';
        const buttonClass = isInstalled
          ? 'marketplace-card-install-btn installed'
          : 'marketplace-card-install-btn';
        const buttonIcon =
          isInstalled && isCskCollection
            ? 'bi-sliders'
            : isInstalled
              ? 'bi-arrow-clockwise'
              : 'bi-download';
        const buttonTextKey = isInstalled
          ? isCskCollection
            ? ''
            : 'plugins.reinstall'
          : 'plugins.install';
        const buttonDefaultText = isInstalled
          ? isCskCollection
            ? 'Tweak'
            : 'Reinstall'
          : 'Install';
        const cardClass = isInstalled
          ? 'marketplace-plugin-card installed'
          : 'marketplace-plugin-card';

        return `
      <div class="${cardClass}" data-installed="${isInstalled}">
        <div class="marketplace-card-header">
          <div class="marketplace-card-title-section">
            <h3 class="marketplace-card-name">${this.escapeHtml(plugin.name)}</h3>
            <span class="marketplace-card-repo">${this.escapeHtml(plugin.repo)}</span>
          </div>
        </div>
        <div class="marketplace-card-body">
          <p class="marketplace-card-description">${this.escapeHtml(plugin.description || 'No description available')}</p>
        </div>
        <div class="marketplace-card-footer">
          <a href="${this.escapeHtml(plugin.url || `https://github.com/${plugin.repo}`)}" target="_blank" class="marketplace-card-link" rel="noopener noreferrer">
            <i class="bi ${isGameBanana ? 'bi-box-arrow-up-right' : 'bi-github'}"></i>
            <span>${isGameBanana ? 'View on GameBanana' : 'View on GitHub'}</span>
          </a>
          <button class="${buttonClass}" 
                  data-plugin-name="${this.escapeHtml(plugin.name)}"
                  data-plugin-repo="${this.escapeHtml(plugin.repo)}"
                  data-special-installer="${this.escapeHtml(plugin.specialInstaller || '')}"
                  data-is-installed="${isInstalled}">
            <i class="bi ${buttonIcon}"></i>
            <span ${buttonTextKey ? `data-i18n="${buttonTextKey}"` : ''}>${buttonDefaultText}</span>
          </button>
        </div>
      </div>
    `;
      })
      .join('');

    container.innerHTML = `<div class="marketplace-grid">${pluginsGrid}</div>`;

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    const githubLinks = container.querySelectorAll<HTMLElement>(
      '.marketplace-card-link',
    );
    githubLinks.forEach((link) => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        if (url && window.electronAPI && window.electronAPI.openUrl) {
          await window.electronAPI.openUrl(url);
        } else if (url) {
          window.open(url, '_blank');
        }
      });
    });

    const installButtons = container.querySelectorAll<HTMLButtonElement>(
      '.marketplace-card-install-btn',
    );

    installButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pluginName = btn.dataset.pluginName as string;
        const pluginRepo = btn.dataset.pluginRepo as string;
        const specialInstaller = btn.dataset.specialInstaller as string;
        const isInstalled = btn.dataset.isInstalled === 'true';
        const isCskCollection = specialInstaller === 'csk-collection';
        const restoreIcon =
          isInstalled && isCskCollection
            ? 'bi-sliders'
            : isInstalled
              ? 'bi-arrow-clockwise'
              : 'bi-download';
        const restoreTextKey = isInstalled
          ? isCskCollection
            ? ''
            : 'plugins.reinstall'
          : 'plugins.install';
        const restoreText = isInstalled
          ? isCskCollection
            ? 'Tweak'
            : 'Reinstall'
          : 'Install';
        const plugin = plugins.find(
          (item) => item.name === pluginName && item.repo === pluginRepo,
        );

        btn.disabled = true;
        btn.innerHTML =
          '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> <span data-i18n="plugins.installing">Installing...</span>';
        if (window.i18n) {
          window.i18n.updateDOM();
        }

        if (window.pluginMarketplace) {
          if (specialInstaller === 'csk-collection' && plugin) {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi ${restoreIcon}"></i> <span ${restoreTextKey ? `data-i18n="${restoreTextKey}"` : ''}>${restoreText}</span>`;
            if (window.i18n) {
              window.i18n.updateDOM();
            }
            const marketplaceModal = btn.closest<HTMLElement>(
              '#plugin-marketplace-modal',
            );
            if (marketplaceModal) {
              marketplaceModal.style.display = 'none';
            }
            await this.openCskCollectionInstallModal(
              plugin,
              marketplaceModal,
              isInstalled,
            );
            return;
          }

          if (specialInstaller === 'one-slot-effects' && plugin) {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi ${restoreIcon}"></i> <span ${restoreTextKey ? `data-i18n="${restoreTextKey}"` : ''}>${restoreText}</span>`;
            if (window.i18n) {
              window.i18n.updateDOM();
            }
            const marketplaceModal = btn.closest<HTMLElement>(
              '#plugin-marketplace-modal',
            );
            if (marketplaceModal) {
              marketplaceModal.style.display = 'none';
            }
            await this.openOneSlotEffectsInstallModal(
              plugin,
              marketplaceModal,
            );
            return;
          }

          const downloadUrl =
            await window.pluginMarketplace.getLatestReleaseDownloadUrl(
              pluginRepo,
            );

          if (downloadUrl) {
            await window.pluginMarketplace.downloadAndInstallPlugin(
              pluginName,
              pluginRepo,
              downloadUrl,
            );

            const card = btn.closest('.marketplace-plugin-card');
            if (card) {
              card.classList.add('installed');
              btn.disabled = false;
              btn.innerHTML =
                '<i class="bi bi-check-circle-fill"></i> <span data-i18n="plugins.installed">Installed</span>';
              if (window.i18n) {
                window.i18n.updateDOM();
              }
            }
          } else {
            console.error(
              `[renderMarketplaceResults] Failed to get download URL for ${pluginName} from repo ${pluginRepo}`,
            );
            if (window.toastManager) {
              window.toastManager.error(
                `No .nro or .zip file found in latest release for ${pluginName}. Please check the GitHub repository.`,
              );
            }
            btn.disabled = false;
            btn.innerHTML =
              '<i class="bi bi-download"></i> <span data-i18n="plugins.install">Install</span>';
            if (window.i18n) {
              window.i18n.updateDOM();
            }
          }
        }
      });
    });
  };

  M.prototype.openCskCollectionInstallModal = async function (
    plugin: any,
    marketplaceModal?: HTMLElement | null,
    isInstalled = false,
  ) {
    document
      .querySelectorAll<HTMLElement>('#csk-collection-install-modal')
      .forEach((existingModal) => existingModal.remove());

    const modal = document.createElement('div');
    modal.className = 'modal modal-large';
    modal.id = 'csk-collection-install-modal';
    modal.style.maxWidth = '680px';

    const restoreMarketplace = () => {
      if (marketplaceModal && document.body.contains(marketplaceModal)) {
        marketplaceModal.style.display = 'block';
      }
    };

    const closeAndRestoreMarketplace = () => {
      this.closeModal('csk-collection-install-modal', {
        skipHideOverlay: true,
        onModalClosed: () => {
          modal.remove();
          restoreMarketplace();
          this.showOverlay();
        },
      });
    };

    modal.innerHTML = `
      <div class="modal-header">
        <h2>${isInstalled ? 'Tweak CSK Collection' : 'Install CSK Collection'}</h2>
        <button class="modal-close" id="close-csk-install" type="button">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="csk-install-panel">
          <label class="csk-install-label" for="csk-version-select">Version</label>
          <select id="csk-version-select" class="input-field"></select>
          <div class="csk-install-row">
            <strong>Optional toggles</strong>
            <div class="csk-install-actions">
              <button class="modal-btn modal-btn-secondary" id="csk-select-all" type="button">Select all</button>
              <button class="modal-btn modal-btn-secondary" id="csk-select-none" type="button">Select none</button>
            </div>
          </div>
          <div id="csk-options-list" class="csk-options-list">
            <div class="marketplace-empty">Loading options...</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-secondary" id="cancel-csk-install">Cancel</button>
        <button class="modal-btn modal-btn-primary" id="confirm-csk-install">
          <i class="bi ${isInstalled ? 'bi-check2' : 'bi-download'}"></i>
          <span>${isInstalled ? 'Apply' : 'Install'}</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    const versionSelect =
      modal.querySelector<HTMLSelectElement>('#csk-version-select')!;
    const optionsList = modal.querySelector<HTMLElement>('#csk-options-list')!;
    const confirmBtn =
      modal.querySelector<HTMLButtonElement>('#confirm-csk-install')!;
    const cancelBtn =
      modal.querySelector<HTMLButtonElement>('#cancel-csk-install')!;
    const closeBtn = modal.querySelector<HTMLButtonElement>(
      '#close-csk-install',
    )!;
    const selectAllBtn =
      modal.querySelector<HTMLButtonElement>('#csk-select-all')!;
    const selectNoneBtn =
      modal.querySelector<HTMLButtonElement>('#csk-select-none')!;

    let files: any[] = [];
    let activeOptions: string[] = [];
    let installedCskMods = new Set<string>();

    const escape = (value: string) => this.escapeHtml(String(value || ''));
    const setBusy = (busy: boolean, text = 'Install') => {
      confirmBtn.disabled = busy;
      confirmBtn.innerHTML = busy
        ? '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i><span>Installing...</span>'
        : `<i class="bi ${isInstalled ? 'bi-check2' : 'bi-download'}"></i><span>${text}</span>`;
    };

    const getSelectedFile = () =>
      files.find((file) => String(file._idRow) === versionSelect.value) ||
      files[0];

    const getInstalledCskMods = async (options: string[]) => {
      if (!isInstalled || !window.settingsManager?.getModsPath) {
        return new Set<string>();
      }

      const modsPath = window.settingsManager.getModsPath();
      if (!modsPath || !window.electronAPI?.readModsFolder) {
        return new Set<string>();
      }

      try {
        const result = await window.electronAPI.readModsFolder(modsPath);
        if (!result.success) {
          return new Set<string>();
        }

        const optionNames = new Set(options);
        const installedNames = [
          ...(result.activeMods || []),
          ...(result.disabledMods || []),
        ]
          .map((mod) => mod?.name || mod?.folderName || '')
          .filter((name) => optionNames.has(name));

        return new Set(installedNames);
      } catch (error) {
        console.warn('[CSK Collection] Failed to detect installed toggles:', error);
        return new Set<string>();
      }
    };

    const renderOptions = (options: string[]) => {
      activeOptions = options;
      if (!options.length) {
        optionsList.innerHTML =
          '<div class="marketplace-empty">No optional toggles found in archive.</div>';
        return;
      }

      optionsList.innerHTML = options
        .map(
          (name) => `
            <label class="csk-option-item">
              <input type="checkbox" value="${escape(name)}" ${isInstalled ? (installedCskMods.has(name) ? 'checked' : '') : 'checked'}>
              <span>${escape(name)}</span>
            </label>
          `,
        )
        .join('');
    };

    const loadOptions = async () => {
      const selectedFile = getSelectedFile();
      if (!selectedFile) return;

      optionsList.innerHTML =
        '<div class="marketplace-empty">Reading archive options...</div>';
      setBusy(true, 'Install');

      try {
        const inspection =
          await window.pluginMarketplace.inspectCskCollectionArchive(
            selectedFile._sDownloadUrl,
          );
        const availableMods = inspection.availableMods || [];
        installedCskMods = await getInstalledCskMods(availableMods);
        renderOptions(availableMods);
      } catch (error) {
        console.error('[CSK Collection] Failed to inspect archive:', error);
        optionsList.innerHTML = `<div class="marketplace-empty">${escape(error.message || 'Failed to inspect archive')}</div>`;
      } finally {
        setBusy(false, isInstalled ? 'Apply' : 'Install');
      }
    };

    try {
      files = await window.pluginMarketplace.getGameBananaFiles(
        plugin.gameBanana.modelName,
        plugin.gameBanana.submissionId,
      );

      versionSelect.innerHTML = files
        .map(
          (file) => `
            <option value="${escape(String(file._idRow || ''))}">
              ${escape(window.pluginMarketplace.getGameBananaFileLabel(file))}
            </option>
          `,
        )
        .join('');

      await loadOptions();
    } catch (error) {
      console.error('[CSK Collection] Failed to load versions:', error);
      optionsList.innerHTML = `<div class="marketplace-empty">${escape(error.message || 'Failed to load versions')}</div>`;
      confirmBtn.disabled = true;
    }

    versionSelect.addEventListener('change', () => {
      void loadOptions();
    });

    selectAllBtn.addEventListener('click', () => {
      optionsList
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => (input.checked = true));
    });

    selectNoneBtn.addEventListener('click', () => {
      optionsList
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => (input.checked = false));
    });

    cancelBtn.addEventListener('click', closeAndRestoreMarketplace);
    closeBtn.addEventListener('click', closeAndRestoreMarketplace);

    confirmBtn.addEventListener('click', async () => {
      const selectedFile = getSelectedFile();
      if (!selectedFile) return;

      const selectedMods = Array.from(
        optionsList.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]:checked',
        ),
      )
        .map((input) => input.value)
        .filter((name) => activeOptions.includes(name));

      setBusy(true);

      try {
        await window.pluginMarketplace.installCskCollection({
          downloadUrl: selectedFile._sDownloadUrl,
          version: selectedFile._sVersion || '',
          selectedMods,
        });
        window.toastManager?.success(
          `CSK Collection installed with ${selectedMods.length} toggle(s)`,
        );
        this.closeModal('csk-collection-install-modal', {
          onModalClosed: () => {
            modal.remove();
            marketplaceModal?.remove();
          },
        });
      } catch (error) {
        console.error('[CSK Collection] Install failed:', error);
        window.toastManager?.error(
          `Failed to install CSK Collection: ${error.message}`,
        );
        setBusy(false, isInstalled ? 'Apply' : 'Install');
      }
    });
  };

  M.prototype.openOneSlotEffectsInstallModal = async function (
    plugin: any,
    marketplaceModal?: HTMLElement | null,
  ) {
    document
      .querySelectorAll<HTMLElement>('#one-slot-effects-install-modal')
      .forEach((existingModal) => existingModal.remove());

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'one-slot-effects-install-modal';
    modal.style.maxWidth = '520px';

    const restoreMarketplace = () => {
      if (marketplaceModal && document.body.contains(marketplaceModal)) {
        marketplaceModal.style.display = 'block';
      }
    };

    const closeAndRestoreMarketplace = () => {
      this.closeModal('one-slot-effects-install-modal', {
        skipHideOverlay: true,
        onModalClosed: () => {
          modal.remove();
          restoreMarketplace();
          this.showOverlay();
        },
      });
    };

    modal.innerHTML = `
      <div class="modal-header">
        <h2>Install One Slot Effects</h2>
        <button class="modal-close" id="close-one-slot-effects-install" type="button">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="csk-install-panel">
          <label class="csk-install-label" for="one-slot-effects-version-select">Version</label>
          <select id="one-slot-effects-version-select" class="input-field"></select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-secondary" id="cancel-one-slot-effects-install">Cancel</button>
        <button class="modal-btn modal-btn-primary" id="confirm-one-slot-effects-install">
          <i class="bi bi-download"></i>
          <span>Install</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    const versionSelect = modal.querySelector<HTMLSelectElement>(
      '#one-slot-effects-version-select',
    )!;
    const confirmBtn = modal.querySelector<HTMLButtonElement>(
      '#confirm-one-slot-effects-install',
    )!;
    const cancelBtn = modal.querySelector<HTMLButtonElement>(
      '#cancel-one-slot-effects-install',
    )!;
    const closeBtn = modal.querySelector<HTMLButtonElement>(
      '#close-one-slot-effects-install',
    )!;

    let files: any[] = [];
    const escape = (value: string) => this.escapeHtml(String(value || ''));
    const getSelectedFile = () =>
      files.find((file) => String(file._idRow) === versionSelect.value) ||
      files[0];

    const setBusy = (busy: boolean) => {
      confirmBtn.disabled = busy;
      confirmBtn.innerHTML = busy
        ? '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i><span>Installing...</span>'
        : '<i class="bi bi-download"></i><span>Install</span>';
    };

    try {
      files = await window.pluginMarketplace.getGameBananaFiles(
        plugin.gameBanana.modelName,
        plugin.gameBanana.submissionId,
      );

      versionSelect.innerHTML = files
        .map(
          (file) => `
            <option value="${escape(String(file._idRow || ''))}">
              ${escape(window.pluginMarketplace.getGameBananaFileLabel(file))}
            </option>
          `,
        )
        .join('');
    } catch (error) {
      console.error('[One Slot Effects] Failed to load versions:', error);
      versionSelect.innerHTML = '<option>Failed to load versions</option>';
      confirmBtn.disabled = true;
    }

    cancelBtn.addEventListener('click', closeAndRestoreMarketplace);
    closeBtn.addEventListener('click', closeAndRestoreMarketplace);

    confirmBtn.addEventListener('click', async () => {
      const selectedFile = getSelectedFile();
      if (!selectedFile) return;

      setBusy(true);

      try {
        await window.pluginMarketplace.installOneSlotEffects({
          downloadUrl: selectedFile._sDownloadUrl,
          version: selectedFile._sVersion || selectedFile._sFile || '',
        });
        window.toastManager?.success('One Slot Effects installed');
        this.closeModal('one-slot-effects-install-modal', {
          onModalClosed: () => {
            modal.remove();
            marketplaceModal?.remove();
          },
        });
      } catch (error) {
        console.error('[One Slot Effects] Install failed:', error);
        window.toastManager?.error(
          `Failed to install One Slot Effects: ${error.message}`,
        );
        setBusy(false);
      }
    });
  };

  M.prototype.closePluginMarketplaceModal = function (
    modalToClose?: HTMLElement,
  ) {
    const modals = modalToClose
      ? [modalToClose]
      : Array.from(
          document.querySelectorAll<HTMLElement>('#plugin-marketplace-modal'),
        );

    modals.forEach((modal) => {
      this.closeModal(modal, {
        onModalClosed: () => modal.remove(),
      });
    });
  };

  M.prototype.openPluginUpdateIntroModal = function (onEnable, onDisable) {
    const modal = document.createElement('div');

    modal.className = 'modal';
    modal.id = 'plugin-intro-modal';
    modal.style.maxWidth = '500px';
    modal.dataset.blocking = 'true';

    modal.style.transform = 'translate(-50%, -50%)';

    modal.innerHTML = `
    <div class="modal-header">
      <h3 data-i18n="modals.pluginIntro.title">Automatic Plugin Updates</h3>
    </div>
    <div class="modal-body">
      <p data-i18n="modals.pluginIntro.message">
        We detected that you have a plugins folder configured. Would you like to enable automatic plugin update checks on startup?
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-primary" id="enable-plugin-updates">
        <i class="bi bi-check-lg"></i> <span data-i18n="modals.pluginIntro.enable">Yes, Enable Auto-Updates</span>
      </button>
      <button class="modal-btn modal-btn-secondary" id="disable-plugin-updates">
        <span data-i18n="modals.pluginIntro.disable">No, thanks</span>
      </button>
    </div>
  `;

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    const enableBtn = modal.querySelector<HTMLElement>(
      '#enable-plugin-updates',
    );
    const disableBtn = modal.querySelector<HTMLElement>(
      '#disable-plugin-updates',
    );
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    if (!document.querySelector<HTMLElement>('#shake-style')) {
      const style = document.createElement('style');
      style.id = 'shake-style';
      style.textContent = `
      @keyframes shake {
          0%, 100% { transform: translate(-50%, -50%); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(5px); }
      }
      .shake-animation {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
      }
    `;
      document.head.appendChild(style);
    }

    let pointerStartedOnOverlay = false;
    const shakePointerHandler = (e) => {
      pointerStartedOnOverlay = e.target === overlay;
    };
    const shakeHandler = (e) => {
      const shouldShake = pointerStartedOnOverlay && e.target === overlay;
      pointerStartedOnOverlay = false;
      if (shouldShake) {
        console.log('[openPluginUpdateIntroModal] Shake handler triggered');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        modal.classList.remove('shake-animation');
        void modal.offsetWidth;
        modal.classList.add('shake-animation');
      }
    };

    if (overlay) {
      overlay.addEventListener('pointerdown', shakePointerHandler, true);
      overlay.addEventListener('click', shakeHandler, true);
    }

    enableBtn!.addEventListener('click', () => {
      if (onEnable) {
        const keepOverlay = onEnable();

        this.closeModal(modal, {
          skipHideOverlay: keepOverlay,
        });
      } else {
        this.closeModal(modal);
      }
    });

    disableBtn!.addEventListener('click', () => {
      if (onDisable) onDisable();
      this.closeModal(modal);
    });
  };
})();
