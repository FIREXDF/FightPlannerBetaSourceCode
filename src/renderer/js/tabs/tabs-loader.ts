const tabConfigs = {
  tools: 'tabs/tools.html',
  plugins: 'tabs/plugins.html',
  characters: 'tabs/characters.html',
  stages: 'tabs/stages.html',
  downloads: 'tabs/downloads.html',
  settings: 'tabs/settings.html',
  fightplanner: 'tabs/fightplanner.html',
};

// Track document click listeners to prevent duplicates
let categoryFilterDocumentListener: ((e: Event) => void) | null = null;
let modSortOrderDocumentListener: ((e: Event) => void) | null = null;

function getToastSettingsLabel() {
  return window.i18n?.t?.('toasts.settings') || 'Settings';
}

function navigateToEmulatorSettings() {
  const settingsTab = document.querySelector<HTMLElement>(
    '[data-tab="settings"]',
  );
  if (settingsTab) {
    settingsTab.click();
  }

  setTimeout(() => {
    window.settingsManager?.switchSettingsTab?.('emulator');
  }, 100);
}

async function isRealHardwareMode() {
  if (!window.settingsManager) {
    return false;
  }

  await window.settingsManager.readyPromise;
  return window.settingsManager.getAppRunMode?.() === 'hardware';
}

function updatePlayActionButtonForMode(btn: HTMLButtonElement) {
  isRealHardwareMode()
    .then((isHardwareMode) => {
      const icon = btn.querySelector<HTMLElement>('i');
      if (isHardwareMode) {
        btn.title =
          window.i18n?.t?.('downloads.sendToSwitch') || 'Send To Switch';
        btn.setAttribute('aria-label', btn.title);
        btn.dataset.i18n = 'downloads.sendToSwitch';
        if (icon) {
          icon.className = 'bi bi-device-hdd';
        }
      } else {
        btn.title = window.i18n?.t?.('tools.actionPlay') || 'Play';
        btn.setAttribute('aria-label', btn.title);
        btn.dataset.i18n = 'tools.actionPlay';
        if (icon) {
          icon.className = 'bi bi-play-fill';
        }
      }
    })
    .catch((error) => {
      console.warn('Failed to update play action button mode:', error);
    });
}

function initializeTabFeatures(tabName) {
  console.log(`Initializing features for tab: ${tabName}`);

  if (tabName === 'tools') {
    const searchInput =
      document.querySelector<HTMLInputElement>('#search-mods-input');
    const savedSearchValue = searchInput ? searchInput.value : '';

    if (searchInput) {
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode!.replaceChild(newSearchInput, searchInput);

      const finalSearchInput =
        document.querySelector<HTMLInputElement>('#search-mods-input');

      if (finalSearchInput) {
        finalSearchInput.addEventListener('input', (e) => {
          const value = finalSearchInput.value;
          if (window.modManager) {
            window.modManager.filterMods(value);
          }
        });

        finalSearchInput.addEventListener('paste', (e) => {
          setTimeout(() => {
            const value = finalSearchInput.value;
            if (window.modManager) {
              window.modManager.filterMods(value);
            }
          }, 10);
        });
      }
    }

    const refreshBtn = document.querySelector<HTMLElement>('#refresh-mods-btn');
    if (refreshBtn) {
      const newRefreshBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode!.replaceChild(newRefreshBtn, refreshBtn);

      newRefreshBtn.addEventListener('click', () => {
        if (window.modManager) {
          window.modManager.fetchMods();
        }
      });
    }

    const smartRenameBtn =
      document.querySelector<HTMLElement>('#smart-rename-btn');
    if (smartRenameBtn) {
      const newSmartRenameBtn = smartRenameBtn.cloneNode(true);
      smartRenameBtn.parentNode!.replaceChild(
        newSmartRenameBtn,
        smartRenameBtn,
      );

      newSmartRenameBtn.addEventListener('click', () => {
        if (window.smartRenameManager) {
          window.smartRenameManager.openSelectModal();
        }
      });
    }

    const createFppBtn = document.querySelector<HTMLElement>('#create-fpp-btn');
    if (createFppBtn) {
      const newCreateFppBtn = createFppBtn.cloneNode(true);
      createFppBtn.parentNode!.replaceChild(newCreateFppBtn, createFppBtn);

      newCreateFppBtn.addEventListener('click', () => {
        if ((window as any).fppManager) {
          (window as any).fppManager.openCreateModal();
        }
      });
    }

    const openFolderBtn =
      document.querySelector<HTMLElement>('#open-folder-btn');
    if (openFolderBtn) {
      const newOpenFolderBtn = openFolderBtn.cloneNode(true);
      openFolderBtn.parentNode!.replaceChild(newOpenFolderBtn, openFolderBtn);

      newOpenFolderBtn.addEventListener('click', () => {
        if (window.modManager) {
          window.modManager.openSelectedModFolder();
        }
      });
    }

    const editInfoBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editInfoBtn && window.modInfoEditor) {
      editInfoBtn.addEventListener('click', () => {
        window.modInfoEditor.handleClick();
      });
    }

    const actionButtons =
      document.querySelectorAll<HTMLButtonElement>('.action-btn');

    actionButtons.forEach((btn) => {
      const title = btn.getAttribute('title');
      const action = btn.dataset.action;

      if (
        (action === 'add-mod' || title === 'Add') &&
        !btn.dataset.listenerAttached
      ) {
        btn.dataset.listenerAttached = 'true';
        btn.addEventListener('click', async () => {
          try {
            if (!window.electronAPI || !window.electronAPI.selectModFile) {
              console.error('electronAPI.selectModFile not available');
              if (window.toastManager) {
                window.toastManager.error('toasts.functionNotAvailable');
              }
              return;
            }

            const result = await window.electronAPI.selectModFile();

            if (!result.success && result.canceled) {
              return;
            }

            if (!result.success) {
              if (window.toastManager) {
                window.toastManager.error(
                  result.error || 'Failed to select file',
                );
              }
              return;
            }

            const modsPath =
              window.settingsManager?.getModsPath?.() ||
              ((await window.electronAPI.store.get('modsPath')) as
                | string
                | null);

            if (!modsPath) {
              if (window.toastManager) {
                window.toastManager.error('toasts.modsFolderNotConfigured');
              }
              return;
            }

            if (window.toastManager) {
              window.toastManager.info('toasts.installingMod');
            }

            const installResult = await window.electronAPI.installModFromPath(
              result.filePath,
              modsPath,
            );

            if (installResult && installResult.success) {
              if (window.toastManager) {
                window.toastManager.success(
                  'toasts.modInstalledSuccessfully',
                  5000,
                  {
                    name: installResult.resultingMods
                      .map((resultingMod) => resultingMod.modName)
                      .join(', '),

                    plural: installResult.resultingMods.length > 1 ? 's' : '',
                  },
                );
              }
              setTimeout(() => {
                if (window.modManager) {
                  window.modManager.fetchMods();
                }
              }, 500);
            } else {
              if (window.toastManager) {
                window.toastManager.error('toasts.installationError', 3000, {
                  error: installResult?.error || 'Unknown error',
                });
              }
            }
          } catch (error) {
            console.error('Error installing mod:', error);
            if (window.toastManager) {
              window.toastManager.error('toasts.errorInstallingMod', 3000, {
                error: error.message,
              });
            }
          }
        });
      }

      if (action === 'launch-emulator' || title === 'Play') {
        updatePlayActionButtonForMode(btn);
      }

      if (
        (action === 'launch-emulator' || title === 'Play') &&
        !btn.dataset.listenerAttached
      ) {
        btn.dataset.listenerAttached = 'true';
        btn.addEventListener('click', async () => {
          try {
            if (!window.settingsManager) {
              if (window.toastManager) {
                window.toastManager.error('toasts.settingsManagerNotAvailable');
              }
              return;
            }

            await window.settingsManager.readyPromise;

            if (await isRealHardwareMode()) {
              if (window.downloadManager?.sendToSwitch) {
                await window.downloadManager.sendToSwitch();
              } else if (window.toastManager) {
                window.toastManager.error('toasts.functionNotAvailable');
              }
              return;
            }

            const emulatorType = window.settingsManager.getEmulatorType();
            const emulatorPath = window.settingsManager.getEmulatorPath();
            const gamePath = window.settingsManager.getGamePath();
            const fullscreen = window.settingsManager.getEmulatorFullscreen();

            if (!emulatorPath || !gamePath) {
              if (window.toastManager) {
                window.toastManager.warning(
                  'toasts.configureEmulatorPaths',
                  6000,
                  {},
                  {
                    actionButton: {
                      text: getToastSettingsLabel(),
                      onClick: navigateToEmulatorSettings,
                    },
                  },
                );
              }
              return;
            }

            if (window.toastManager) {
              window.toastManager.info('toasts.launchingEmulator');
            }

            const result = await window.electronAPI.launchEmulator(
              emulatorType,
              emulatorPath,
              gamePath,
              fullscreen,
            );

            if (result.success) {
              if (window.toastManager) {
                window.toastManager.success(
                  'toasts.emulatorLaunchedSuccessfully',
                );
              }
            } else if (result.error === 'emulator_already_running') {
              if (window.toastManager) {
                window.toastManager.warning(
                  'toasts.emulatorAlreadyRunning',
                  5000,
                  {},
                  {
                    actionButton: {
                      text:
                        window.i18n?.t('toasts.rerunAnyway') || 'Rerun anyway',
                      onClick: async () => {
                        const forceResult =
                          await window.electronAPI.launchEmulator(
                            emulatorType,
                            emulatorPath,
                            gamePath,
                            fullscreen,
                            true,
                          );
                        if (forceResult.success && window.toastManager) {
                          window.toastManager.success(
                            'toasts.emulatorLaunchedSuccessfully',
                          );
                        }
                      },
                    },
                  },
                );
              }
            } else {
              if (window.toastManager) {
                window.toastManager.error(
                  'toasts.failedToLaunchEmulator',
                  3000,
                  { error: result.error },
                );
              }
            }
          } catch (error) {
            console.error('Error launching emulator:', error);
            if (window.toastManager) {
              window.toastManager.error(`Error: ${error.message}`);
            }
          }
        });
      }
    });

    const categoryFilter =
      document.querySelector<HTMLElement>('#category-filter');
    if (categoryFilter) {
      const newCategoryFilter = categoryFilter.cloneNode(true);
      categoryFilter.parentNode!.replaceChild(
        newCategoryFilter,
        categoryFilter,
      );

      const finalCategoryFilter =
        document.querySelector<HTMLElement>('#category-filter');
      if (finalCategoryFilter) {
        const trigger = finalCategoryFilter.querySelector<HTMLElement>(
          '.custom-select-trigger',
        );
        const options = finalCategoryFilter.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );
        const selectedValue =
          finalCategoryFilter.querySelector<HTMLElement>('.selected-value');

        if (trigger) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            finalCategoryFilter.classList.toggle('open');
          });
        }

        // Remove any existing document click listener before adding a new one
        if (categoryFilterDocumentListener) {
          document.removeEventListener('click', categoryFilterDocumentListener);
        }

        // Create and add new document click listener
        categoryFilterDocumentListener = (e) => {
          const target = e.target as HTMLElement;

          if (!finalCategoryFilter.contains(target)) {
            finalCategoryFilter.classList.remove('open');
          }
        };
        document.addEventListener('click', categoryFilterDocumentListener);

        options.forEach((option) => {
          option.addEventListener('click', () => {
            const value = option.dataset.value;
            const text = option.querySelector<HTMLElement>('span')!.textContent;

            if (selectedValue) {
              selectedValue.textContent = text;
            }

            options.forEach((opt) => opt.classList.remove('active'));
            option.classList.add('active');

            finalCategoryFilter.classList.remove('open');

            if (window.modManager) {
              window.modManager.filterByCategory(value);
            }
          });
        });
      }
    }

    const modSortOrder = document.querySelector<HTMLElement>('#mod-sort-order');
    if (modSortOrder) {
      const newModSortOrder = modSortOrder.cloneNode(true);
      modSortOrder.parentNode!.replaceChild(newModSortOrder, modSortOrder);

      const finalModSortOrder =
        document.querySelector<HTMLElement>('#mod-sort-order');
      if (finalModSortOrder) {
        const trigger = finalModSortOrder.querySelector<HTMLElement>(
          '.custom-select-trigger',
        );
        const options = finalModSortOrder.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );
        const selectedValue =
          finalModSortOrder.querySelector<HTMLElement>('.selected-value');
        const currentOrder = window.modManager?.sortOrder || 'name-asc';
        const currentOption =
          Array.from(options).find(
            (option) => option.dataset.value === currentOrder,
          ) || options[0];

        if (currentOption) {
          options.forEach((option) => option.classList.remove('active'));
          currentOption.classList.add('active');

          const currentText =
            currentOption.querySelector<HTMLElement>('span')?.textContent;
          if (selectedValue && currentText) {
            selectedValue.textContent = currentText;
          }
        }

        if (trigger) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            finalModSortOrder.classList.toggle('open');
          });
        }

        if (modSortOrderDocumentListener) {
          document.removeEventListener('click', modSortOrderDocumentListener);
        }

        modSortOrderDocumentListener = (e) => {
          const target = e.target as HTMLElement;

          if (!finalModSortOrder.contains(target)) {
            finalModSortOrder.classList.remove('open');
          }
        };
        document.addEventListener('click', modSortOrderDocumentListener);

        options.forEach((option) => {
          option.addEventListener('click', () => {
            const value = option.dataset.value || 'name-asc';
            const text = option.querySelector<HTMLElement>('span')!.textContent;

            if (selectedValue) {
              selectedValue.textContent = text;
            }

            options.forEach((opt) => opt.classList.remove('active'));
            option.classList.add('active');

            finalModSortOrder.classList.remove('open');

            if (window.modManager) {
              window.modManager.sortModsBy(value);
            }
          });
        });
      }
    }

    if (window.resizeHandler) {
      window.resizeHandler.setupResizeHandlers();
    }

    if (window.modManager) {
      window.modManager.reinitialize();
    }

    if (window.modProfileManager) {
      window.modProfileManager.bindControls();
      window.modProfileManager.render();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    if (window.modManager) {
      const currentInput =
        document.querySelector<HTMLInputElement>('#search-mods-input');
      const currentValue = currentInput ? currentInput.value : '';

      window.modManager.searchQuery = currentValue.toLowerCase();

      if (currentValue) {
        setTimeout(() => {
          if (window.modManager) {
            window.modManager.updateVisibility();
          }
        }, 100);
      }
    }
  }

  if (tabName === 'plugins') {
    if (window.pluginManager) {
      window.pluginManager.reinitialize();
    }

    if (window.pluginManager) {
      console.log('Fetching plugins...');
      window.pluginManager.fetchPlugins();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'stages') {
    if (window.stagesManager) {
      void window.stagesManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'settings' && window.settingsManager) {
    window.settingsManager.readyPromise.then(() => {
      window.settingsManager.setupEventListeners();

      if (window.i18n) {
        window.i18n.updateDOM();
      }
    });
  }

  if (tabName === 'fightplanner') {
    if (window.fightPlannerManager) {
      console.log('Initializing FightPlanner tab...');
      window.fightPlannerManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'characters') {
    if (window.charactersManager) {
      console.log('Initializing Characters tab...');
      window.charactersManager.initialize();
    }

    const refreshBtn = document.querySelector<HTMLElement>(
      '#refresh-characters-btn',
    );

    if (refreshBtn) {
      const newRefreshBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode!.replaceChild(newRefreshBtn, refreshBtn);

      newRefreshBtn.addEventListener('click', () => {
        if (window.charactersManager) {
          window.charactersManager.refresh();
        }
      });
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'downloads') {
    if (window.downloadManager) {
      console.log('Initializing Downloads tab...');
      window.downloadManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }
}

async function loadTabContent(tabName) {
  const tabElement = document.querySelector<HTMLElement>(`#tab-${tabName}`);
  if (!tabElement) {
    console.warn(`Tab element not found: tab-${tabName}`);
    return;
  }

  if (tabElement.dataset.loaded === 'true') {
    console.log(`Tab already loaded: ${tabName} - reinitializing features`);
    // Reapply theme when reinitializing tab
    if (window.settingsManager) {
      const currentTheme = window.settingsManager.settings.theme || 'dark';
      window.settingsManager.applyTheme(currentTheme);
    }
    if (window.i18n) {
      window.i18n.updateDOM();
    }
    initializeTabFeatures(tabName);
    return;
  }

  const htmlFile = tabConfigs[tabName];
  if (!htmlFile) {
    console.warn(`No HTML file configured for tab: ${tabName}`);
    return;
  }

  try {
    console.log(`Loading tab content for: ${tabName} from ${htmlFile}`);
    const response = await fetch(htmlFile);
    const html = await response.text();
    tabElement.innerHTML = html;
    tabElement.dataset.loaded = 'true';
    console.log(`✓ Successfully loaded content for tab: ${tabName}`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Reapply theme after loading tab content
    if (window.settingsManager) {
      const currentTheme = window.settingsManager.settings.theme || 'dark';
      window.settingsManager.applyTheme(currentTheme);
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    initializeTabFeatures(tabName);
  } catch (error) {
    console.error(`Error loading tab ${tabName}:`, error);
    tabElement.innerHTML = `
            <div class="content-box">
                <h2>Error</h2>
                <p>Could not load content for ${tabName}</p>
            </div>
        `;
  }
}

async function initializeTabs() {
  await loadTabContent('tools');
}

window.addEventListener('localeChanged', () => {
  if (window.i18n) {
    window.i18n.updateDOM();
  }
});

window.tabLoader = {
  loadTabContent,
  initializeTabs,
};
