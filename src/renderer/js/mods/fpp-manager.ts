export class FppManager {
    isCreating: boolean = false;
    isInstalling: boolean = false;
    fppThumbnailPath: string | null = null;
    private lottieInstance: any = null;

    init() {
        this.isCreating = false;
        this.setupFppListeners();
    }

    setupFppListeners() {
        if (window.electronAPI && window.electronAPI.onFppInstallProgress) {
            window.electronAPI.onFppInstallProgress((data: any) => {
                this.updateStatusBar(data);
            });
        }

        if (window.electronAPI && window.electronAPI.onFppCreateProgress) {
            window.electronAPI.onFppCreateProgress((data: any) => {
                const statusEl = document.getElementById('fpp-create-status');
                if (!statusEl) return;

                const t = (key: string, fallback: string) => {
                    if (window.i18n && window.i18n.t) return window.i18n.t(key);
                    return fallback;
                };

                let text = '';
                switch (data.step) {
                    case 'initializing': text = t('fpp.status.initializing', 'Initializing...'); break;
                    case 'preparing_manifest': text = t('fpp.status.preparingManifest', 'Preparing manifest...'); break;
                    case 'adding_thumbnail': text = t('fpp.status.addingThumbnail', 'Adding thumbnail...'); break;
                    case 'adding_mods':
                        text = data.modName ?
                            `${t('fpp.status.addingMod', 'Adding mod')}: ${data.modName}...` :
                            t('fpp.status.addingMods', 'Adding mods...');
                        break;
                    case 'finalizing': text = t('fpp.status.finalizing', 'Finalizing archive...'); break;
                    case 'complete': text = t('fpp.status.complete', 'Complete!'); break;
                    default: text = t('fpp.status.processing', 'Processing...');
                }

                statusEl.textContent = text;
            });
        }

        if (window.electronAPI && window.electronAPI.onFppDownloadLink) {
            window.electronAPI.onFppDownloadLink((data: any) => {
                if (data.url) {
                    console.log('[FppManager] Triggering download for:', data.url);
                    if (window.electronAPI.openFightPlannerLink) {
                        window.electronAPI.openFightPlannerLink(`fightplanner:${data.url}`);
                    }
                }
            });
        }

        if (window.electronAPI && window.electronAPI.onOpenFppFile) {
            window.electronAPI.onOpenFppFile((data: { filePath: string }) => {
                console.log('[FppManager] Opening FPP file:', data.filePath);
                this.openInstallModal(data.filePath);
            });
        }
    }

    async openCreateModal() {
        if (!window.modManager || !window.modManager.mods) {
            if (window.toastManager) {
                window.toastManager.error('fpp.noModsLoaded');
            }
            return;
        }

        if ((window as any).pluginManager && !(window as any).pluginManager.plugins?.length) {
            console.log('[FppManager] Pre-fetching plugins before opening creator modal...');
            await (window as any).pluginManager.fetchPlugins();
        }

        const mods = window.modManager.mods;

        const modal = document.getElementById('fpp-create-modal');
        if (!modal) return;

        // Reset inputs
        const nameInput = document.getElementById('fpp-name-input') as HTMLInputElement;
        if (nameInput) nameInput.value = '';

        const versionInput = document.getElementById('fpp-version-input') as HTMLInputElement;
        if (versionInput) versionInput.value = '';

        this.fppThumbnailPath = null;
        const thumbnailPreview = document.getElementById('fpp-thumbnail-preview') as HTMLImageElement;
        const thumbnailIcon = document.getElementById('fpp-thumbnail-placeholder-icon');
        const thumbnailText = document.getElementById('fpp-thumbnail-placeholder-text');
        const removeThumbnailBtn = document.getElementById('fpp-remove-thumbnail-btn');
        if (thumbnailPreview) {
            thumbnailPreview.src = '';
            thumbnailPreview.style.display = 'none';
        }
        if (thumbnailIcon) thumbnailIcon.style.display = 'block';
        if (thumbnailText) thumbnailText.style.display = 'block';
        if (removeThumbnailBtn) removeThumbnailBtn.style.display = 'none';

        const chooseThumbnailBtn = document.getElementById('fpp-choose-thumbnail-btn');
        const thumbnailInput = document.getElementById('fpp-thumbnail-input') as HTMLInputElement;
        if (chooseThumbnailBtn && thumbnailInput) {
            chooseThumbnailBtn.onclick = () => thumbnailInput.click();
            thumbnailInput.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                    const file = target.files[0];
                    this.fppThumbnailPath = window.electronAPI.getPathForFile(file);

                    const reader = new FileReader();
                    reader.onload = (re) => {
                        if (thumbnailPreview && thumbnailIcon && removeThumbnailBtn) {
                            thumbnailPreview.src = re.target?.result as string;
                            thumbnailPreview.style.display = 'block';
                            thumbnailIcon.style.display = 'none';
                            if (thumbnailText) thumbnailText.style.display = 'none';
                            removeThumbnailBtn.style.display = 'inline-block';
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        if (removeThumbnailBtn) {
            removeThumbnailBtn.onclick = () => {
                this.fppThumbnailPath = null;
                if (thumbnailInput) thumbnailInput.value = '';
                if (thumbnailPreview) {
                    thumbnailPreview.src = '';
                    thumbnailPreview.style.display = 'none';
                }
                if (thumbnailIcon) thumbnailIcon.style.display = 'block';
                if (thumbnailText) thumbnailText.style.display = 'block';
                removeThumbnailBtn.style.display = 'none';
            };
        }

        const modsListContainer = document.getElementById('fpp-mods-table');
        const pluginsListContainer = document.getElementById('fpp-plugins-table');

        if (modsListContainer && pluginsListContainer) {
            modsListContainer.innerHTML = '';
            pluginsListContainer.innerHTML = '';

            // Add mods
            for (const mod of mods) {
                const item = document.createElement('div');
                item.className = 'smart-rename-select-item';
                item.style.cssText = 'display: flex; align-items: center; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s; gap: 10px;';

                item.innerHTML = `
            <input type="checkbox" class="fpp-mod-checkbox fpp-core-mod-checkbox" data-path="${mod.path}" data-name="${mod.name}" style="margin-right: 8px;" />
            <div style="display: flex; flex-direction: column;">
              <span style="color: var(--text-primary); font-weight: 500;">${mod.name} 
                <span style="font-size: 10px; padding: 2px 4px; border-radius: 4px; background: rgba(var(--primary-rgb), 0.2); color: var(--primary-color); margin-left: 4px;">Mod</span>
              </span>
              <span style="color: var(--text-muted); font-size: 11px;">${mod.status === 'active' ? 'Active' : 'Disabled'}${mod.hash ? ' | #' + mod.hash : ''}</span>
            </div>
          `;

                item.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).tagName !== 'INPUT') {
                        const cb = item.querySelector<HTMLInputElement>('.fpp-core-mod-checkbox')!;
                        cb.checked = !cb.checked;
                    }
                    this.updateSelectedCount();
                });

                modsListContainer.appendChild(item);
            }

            // Add plugins
            if ((window as any).pluginManager && (window as any).pluginManager.plugins) {
                const plugins = (window as any).pluginManager.plugins;
                for (const plugin of plugins) {
                    const item = document.createElement('div');
                    item.className = 'smart-rename-select-item';
                    item.style.cssText = 'display: flex; align-items: center; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s; gap: 10px; border-left: 3px solid var(--accent-color);';

                    item.innerHTML = `
                <input type="checkbox" class="fpp-mod-checkbox fpp-plugin-checkbox" data-path="${plugin.filePath}" data-name="${plugin.name}" style="margin-right: 8px;" />
                <div style="display: flex; flex-direction: column;">
                  <span style="color: var(--text-primary); font-weight: 500;">${plugin.name}
                    <span style="font-size: 10px; padding: 2px 4px; border-radius: 4px; background: rgba(var(--accent-rgb), 0.2); color: var(--accent-color); margin-left: 4px;">Plugin</span>
                  </span>
                  <span style="color: var(--text-muted); font-size: 11px;">${plugin.status === 'active' ? 'Active' : 'Disabled'} | ${plugin.size}</span>
                </div>
              `;

                    item.addEventListener('click', (e) => {
                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                            const cb = item.querySelector<HTMLInputElement>('.fpp-plugin-checkbox')!;
                            cb.checked = !cb.checked;
                        }
                        this.updateSelectedCount();
                    });

                    pluginsListContainer.appendChild(item);
                }
            }
        }

        const closeBtn = document.getElementById('fpp-create-close');
        const cancelBtn1 = document.getElementById('fpp-cancel-btn-1');
        const cancelBtn2 = document.getElementById('fpp-cancel-btn-2');

        const nextBtn = document.getElementById('fpp-next-btn');
        const backBtn = document.getElementById('fpp-back-btn');
        const createBtn = document.getElementById('fpp-create-btn');

        const selectAllBtn = document.getElementById('fpp-select-all');
        const deselectAllBtn = document.getElementById('fpp-deselect-all');
        const searchInput = document.getElementById('fpp-search-input');
        const step1 = document.getElementById('fpp-create-step-1');
        const step2 = document.getElementById('fpp-create-step-2');
        const footer1 = document.getElementById('fpp-create-footer-step-1');
        const footer2 = document.getElementById('fpp-create-footer-step-2');

        if (step1 && step2 && footer1 && footer2) {
            step1.style.display = 'block';
            footer1.style.display = 'flex';
            step2.style.display = 'none';
            footer2.style.display = 'none';

            if (nextBtn) {
                nextBtn.onclick = () => {
                    step1.style.display = 'none';
                    footer1.style.display = 'none';
                    step2.style.display = 'block';
                    step2.classList.remove('fade-in');
                    void (step2 as HTMLElement).offsetWidth; // Trigger reflow
                    step2.classList.add('fade-in');
                    footer2.style.display = 'flex';
                };
            }

            if (backBtn) {
                backBtn.onclick = () => {
                    step2.style.display = 'none';
                    footer2.style.display = 'none';
                    step1.style.display = 'block';
                    step1.classList.remove('fade-in');
                    void (step1 as HTMLElement).offsetWidth; // Trigger reflow
                    step1.classList.add('fade-in');
                    footer1.style.display = 'flex';
                };
            }
        }

        if (closeBtn) closeBtn.onclick = () => this.closeCreateModal();
        if (cancelBtn1) cancelBtn1.onclick = () => this.closeCreateModal();
        if (cancelBtn2) cancelBtn2.onclick = () => this.closeCreateModal();

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                document.querySelectorAll<HTMLInputElement>('.fpp-mod-checkbox').forEach(cb => {
                    const parentItem = cb.closest('.smart-rename-select-item') as HTMLElement;
                    if (parentItem && parentItem.style.display !== 'none') {
                        cb.checked = true;
                    }
                });
                this.updateSelectedCount();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                document.querySelectorAll<HTMLInputElement>('.fpp-mod-checkbox').forEach(cb => cb.checked = false);
                this.updateSelectedCount();
            };
        }

        if (searchInput) {
            const newSearchInput = searchInput.cloneNode(true) as HTMLInputElement;
            searchInput.parentNode?.replaceChild(newSearchInput, searchInput);
            newSearchInput.value = '';
            newSearchInput.addEventListener('input', (e) => {
                const query = (e.target as HTMLInputElement).value.toLowerCase();
                document.querySelectorAll<HTMLElement>('.smart-rename-select-item').forEach(item => {
                    const name = item.querySelector<HTMLInputElement>('.fpp-mod-checkbox')?.dataset.name?.toLowerCase() || '';
                    item.style.display = name.includes(query) ? '' : 'none';
                });
            });
        }

        if (createBtn) {
            createBtn.onclick = () => this.handleCreate();
        }

        this.updateSelectedCount();

        if (window.modalManager) {
            window.modalManager.showOverlay();
        }
        modal.classList.remove('closing');
        modal.style.display = 'block';

        if (window.i18n && window.i18n.updateDOM) {
            window.i18n.updateDOM();
        }
    }

    closeCreateModal() {
        if (window.modalManager) {
            window.modalManager.closeModal('fpp-create-modal');
        } else {
            const modal = document.getElementById('fpp-create-modal');
            if (modal) modal.style.display = 'none';
        }
    }

    updateSelectedCount() {
        const modCount = document.querySelectorAll<HTMLInputElement>('.fpp-core-mod-checkbox:checked').length;
        const pluginCount = document.querySelectorAll<HTMLInputElement>('.fpp-plugin-checkbox:checked').length;

        const modCountEl = document.getElementById('fpp-selected-mods-count');
        const pluginCountEl = document.getElementById('fpp-selected-plugins-count');

        if (modCountEl) modCountEl.textContent = `(${modCount})`;
        if (pluginCountEl) pluginCountEl.textContent = `(${pluginCount})`;
    }

    async handleCreate() {
        const nameInput = document.getElementById('fpp-name-input') as HTMLInputElement;
        const name = nameInput?.value.trim() || 'ModPack';

        const versionInput = document.getElementById('fpp-version-input') as HTMLInputElement;
        const version = versionInput?.value.trim() || '1.0.0';

        const selectedPaths: string[] = [];
        const t = (key: string, fallback: string) => {
            if (window.i18n && window.i18n.t) return window.i18n.t(key);
            return fallback;
        };

        document.querySelectorAll<HTMLInputElement>('.fpp-core-mod-checkbox:checked, .fpp-plugin-checkbox:checked').forEach(cb => {
            if (cb.dataset.path) selectedPaths.push(cb.dataset.path);
        });

        if (selectedPaths.length === 0) {
            if (window.toastManager) {
                window.toastManager.warning(t('fpp.noModsSelected', 'Please select at least one mod'));
            }
            return;
        }

        const loadingOverlay = document.getElementById('fpp-create-loading');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            const statusEl = document.getElementById('fpp-create-status');
            if (statusEl) statusEl.textContent = t('fpp.status.initializing', 'Initializing...');

            const lottieContainer = document.getElementById('fpp-create-lottie');
            if (lottieContainer && (window as any).lottie) {
                if (this.lottieInstance) {
                    this.lottieInstance.destroy();
                }
                this.lottieInstance = (window as any).lottie.loadAnimation({
                    container: lottieContainer,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    path: '../images/loading.json'
                });
            }
        }

        this.isCreating = true;

        try {
            const result = await window.electronAPI.createFpp(name, version, this.fppThumbnailPath, selectedPaths);

            if (result.success) {
                if (window.toastManager) {
                    window.toastManager.success(t('fpp.created', 'FPP pack created successfully!'));
                }
                this.closeCreateModal();
            } else if (!result.canceled) {
                if (window.toastManager) {
                    window.toastManager.error(t('fpp.createError', 'Failed to create FPP pack'));
                }
            }
        } catch (error) {
            console.error('[FppManager] Create error:', error);
            if (window.toastManager) {
                window.toastManager.error(t('fpp.createError', 'Failed to create FPP pack'));
            }
        } finally {
            this.isCreating = false;
            if (this.lottieInstance) {
                this.lottieInstance.destroy();
                this.lottieInstance = null;
            }
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    async openInstallModal(fppPath: string) {
        const t = (key: string, fallback: string) => {
            if (window.i18n && window.i18n.t) return window.i18n.t(key);
            return fallback;
        };

        if (window.toastManager) {
            window.toastManager.info(t('fpp.reading', 'Reading FPP file...'));
        }

        try {
            const result = await window.electronAPI.readFpp(fppPath);

            if (!result.success || !result.summary) {
                if (window.toastManager) {
                    window.toastManager.error(t('fpp.readError', 'Failed to read FPP file'));
                }
                return;
            }

            const summary = result.summary;
            this.showInstallConfirmModal(fppPath, summary);
        } catch (error) {
            console.error('[FppManager] Read error:', error);
            if (window.toastManager) {
                window.toastManager.error(t('fpp.readError', 'Failed to read FPP file'));
            }
        }
    }

    showInstallConfirmModal(fppPath: string, summary: any) {
        const modal = document.getElementById('fpp-install-modal');
        const modalBody = document.getElementById('fpp-install-body');
        if (!modal || !modalBody) return;

        const t = (key: string, fallback: string) => {
            if (window.i18n && window.i18n.t) return window.i18n.t(key);
            return fallback;
        };

        const downloadCount = summary.manifest.download_count || 0;
        const embeddedCount = summary.manifest.embedded_count || 0;

        const justMods = summary.mods?.filter((m: any) => m.type !== 'plugin') || [];
        const justPlugins = summary.mods?.filter((m: any) => m.type === 'plugin') || [];

        const totalMods = justMods.length;
        const totalPlugins = justPlugins.length;

        const pluginVersions: Record<string, string> = {};
        if (summary.manifest.required_plugins) {
            summary.manifest.required_plugins.split(',').forEach((p: string) => {
                const [name, version] = p.split(':');
                if (name && version) pluginVersions[name] = version;
            });
        }

        modalBody.innerHTML = `
            <div style="display: flex; gap: 24px; align-items: stretch; height: 100%;">
                <!-- Left Column: Thumbnail and Pack Info -->
                <div style="width: 300px; display: flex; flex-direction: column; align-items: center; text-align: center; flex-shrink: 0;">
                    <div style="width: 100%; border-radius: 12px; overflow: hidden; border: 2px solid var(--border-color); box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 16px; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary);">
                        ${summary.thumbnailPath
                ? `<img src="file://${summary.thumbnailPath}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<i class="bi bi-file-zip-fill" style="color: var(--primary-color); font-size: 64px;"></i>`
            }
                    </div>
                    <h3 style="color: var(--text-primary); margin: 0 0 8px 0; font-size: 24px; word-break: break-word;">${summary.manifest.name || 'Unknown Pack'}</h3>
                    <div style="display: flex; justify-content: center; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span style="color: var(--text-muted); font-size: 12px; padding: 2px 8px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">v${summary.manifest.pack_version || '1.0.0'}</span>
                        <span style="color: var(--text-muted); font-size: 11px;">FPP Format v${summary.manifest.fpp_version}</span>
                    </div>
                </div>

                <!-- Right Column: Stats and Mod List -->
                <div style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
                    <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 14px; margin-bottom: 16px; flex-shrink: 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-secondary);">${t('fpp.totalMods', 'Total Mods')}</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${totalMods}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-secondary);">${t('fpp.totalPlugins', 'Total Plugins')}</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${totalPlugins}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-secondary);">${t('fpp.embeddedMods', 'Embedded Items')}</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${embeddedCount}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-secondary);">${t('fpp.downloadableMods', 'Downloadable Items')}</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${downloadCount}</span>
                        </div>
                    </div>

                    ${(summary.mods && summary.mods.length > 0) ? `
                    <div style="flex: 1; overflow-y: auto; background: var(--bg-secondary); border-radius: 8px; padding: 8px; border: 1px solid var(--border-hover); box-shadow: inset 0 2px 8px rgba(0,0,0,0.1); min-height: 120px; max-height: 250px;">
                      ${(summary.mods || []).map((mod: any) => `
                        <div style="display: flex; align-items: center; padding: 6px 8px; gap: 8px;">
                          <i class="bi ${mod.source === 'download' ? 'bi-cloud-download' : (mod.type === 'plugin' ? 'bi-puzzle' : 'bi-folder')}" style="color: ${mod.source === 'download' ? 'var(--accent-color)' : (mod.type === 'plugin' ? 'var(--primary-color)' : 'var(--primary-color)')}; font-size: 14px; flex-shrink: 0;"></i>
                          <span style="color: var(--text-primary); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mod.name}</span>
                          ${mod.type === 'plugin' ? `<span style="font-size: 10px; padding: 2px 4px; border-radius: 4px; background: rgba(var(--primary-rgb), 0.2); color: var(--primary-color); margin-left: auto; flex-shrink: 0;">Plugin ${pluginVersions[mod.name.replace(/\\.nro$/i, '')] ? `v${pluginVersions[mod.name.replace(/\\.nro$/i, '')]}` : ''}</span>` : ''}
                        </div>
                      `).join('')}
                    </div>` : `
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; min-height: 120px; background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-hover);">
                        ${t('fpp.noModsFound', 'No items found in this pack.')}
                    </div>
                    `}
                </div>
            </div>
        `;

        const closeBtn = document.getElementById('fpp-install-close');
        const cancelBtn = document.getElementById('fpp-install-cancel');
        const confirmBtn = document.getElementById('fpp-install-confirm');

        const closeModal = () => {
            if (window.modalManager) {
                window.modalManager.closeModal('fpp-install-modal');
            } else {
                modal.style.display = 'none';
            }
        };

        if (closeBtn) closeBtn.onclick = () => closeModal();
        if (cancelBtn) cancelBtn.onclick = () => closeModal();
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                closeModal();
                await this.handleInstall(fppPath);
            };
        }

        if (window.modalManager) {
            window.modalManager.showOverlay();
        }
        modal.classList.remove('closing');
        modal.style.display = 'block';

        if (window.i18n && window.i18n.updateDOM) {
            window.i18n.updateDOM();
        }
    }

    async handleInstall(fppPath: string) {
        if (window.toastManager) {
            window.toastManager.info('fpp.installing');
        }

        try {
            const result = await window.electronAPI.installFpp(fppPath);

            if (result.success) {
                const embeddedCount = result.installedMods?.length || 0;
                const downloadCount = result.downloadedLinks?.length || 0;

                if (window.toastManager) {
                    window.toastManager.success('fpp.installed');
                }

                if (result.downloadedLinks && result.downloadedLinks.length > 0) {
                    console.log('[FppManager] Downloads to trigger:', result.downloadedLinks.length);
                }

                if (window.modManager && window.modManager.modsPath) {
                    window.modManager.loadModsFromFolder(window.modManager.modsPath);
                }
                if ((window as any).pluginManager && (window as any).pluginManager.pluginsPath) {
                    (window as any).pluginManager.loadPlugins((window as any).pluginManager.pluginsPath);
                }
            } else {
                if (window.toastManager) {
                    window.toastManager.error('fpp.installError');
                }
            }
        } catch (error) {
            console.error('[FppManager] Install error:', error);
            if (window.toastManager) {
                window.toastManager.error('fpp.installError');
            }
        }
    }

    updateStatusBar(data: any) {
        const t = (key: string, fallback: string) => {
            if (window.i18n && window.i18n.t) return window.i18n.t(key);
            return fallback;
        };

        const statusBar = window.statusBarManager;
        if (!statusBar) return;

        const progress = Math.max(0, Math.min(100, Math.round(Number(data.progress) || 0)));
        const showProgress = (
            phaseLabel: string,
            fileName: string,
            iconClass: string,
            displayProgress = progress,
        ) => {
            statusBar.updateExtendedBar({
                type: 'download',
                downloads: [{
                    id: 'fpp-install',
                    fileName,
                    progress: Math.max(0, Math.min(100, Math.round(displayProgress))),
                    phaseLabel,
                    iconClass,
                }],
            });
        };

        switch (data.step) {
            case 'extracting': {
                const extractProgress = Math.max(
                    0,
                    Math.min(100, Math.round(Number(data.extractProgress) || progress * 2)),
                );
                const phaseLabel = t('fpp.statusExtracting', 'FPP: Extracting...');
                const fileName = (data.file || 'FPP package').split(/[\\/]/).pop();

                statusBar.showTemporaryStatus(
                    `${t('fpp.statusExtracting', 'FPP: Extracting...')} ${extractProgress}%`,
                );
                showProgress(phaseLabel, fileName, 'bi-file-zip-fill', extractProgress);
                break;
            }
            case 'installing': {
                const modName = data.modName || '';
                const phaseLabel = t('fpp.statusInstalling', 'Installing');
                statusBar.showTemporaryStatus(
                    `FPP: ${phaseLabel} ${modName}... ${progress}%`,
                );
                showProgress(`FPP: ${phaseLabel}`, modName || 'FPP package', 'bi-folder-check');
                break;
            }
            case 'downloading': {
                const phaseLabel = t('fpp.statusDownloading', 'Downloading');
                statusBar.showTemporaryStatus(
                    `FPP: ${phaseLabel} (${data.totalDownloads} mods)... ${progress}%`,
                );
                showProgress(
                    `FPP: ${phaseLabel}`,
                    `${data.totalDownloads} mods`,
                    'bi-cloud-arrow-down-fill',
                );
                break;
            }
            case 'complete':
                statusBar.showTemporaryStatus(
                    t('fpp.statusComplete', 'FPP: Installation complete!'),
                    { autoRestoreMs: 3000 },
                );
                showProgress(
                    t('fpp.statusComplete', 'FPP: Installation complete!'),
                    'FPP package',
                    'bi-check-circle-fill',
                );
                setTimeout(() => {
                    window.statusBarManager?.updateExtendedBar?.({ type: 'none' });
                }, 3000);
                break;
        }
    }
}

(window as any).fppManager = new FppManager();
