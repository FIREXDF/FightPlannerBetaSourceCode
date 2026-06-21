class SettingsManager {
  settings: any;
  initialized: boolean;
  tabSwitchingAttached: boolean;
  drivesLoaded: boolean;
  switchTabTimeout: any;
  readyPromise: Promise<void>;
  lastModsPathWarningPath: string | null;
  pathFixModalOpen: boolean;

  constructor() {
    this.settings = {
      modsPath: null,
      pluginsPath: null,
      appRunMode: 'emulator',
      hardwareLibraryMode: 'local',
      localModsPath: null,
      localPluginsPath: null,
      emulatorType: 'yuzu',
      emulatorPath: null,
      gamePath: null,
      emulatorFullscreen: false,
      switchIp: null,
      switchPort: '5000',
      switchFtpUser: null,
      switchFtpPassword: null,
      switchFtpPath: null,
      switchFtpModsPath: null,
      switchFtpPluginsPath: null,
      switchTransferMethod: 'none',
      switchDriveLetter: null,
      conflictDetectionEnabled: true,
      nroLimitCheckEnabled: true,
      libraryPathValidationEnabled: true,
      conflictWhitelistPatterns: [],
      ignoredConflictPaths: [],
      autoCheckPluginUpdates: false,
      pluginUpdateIntroShown: false,
      autoDisableNewMods: false,
      disableAllModsOnDownload: false,
      devMode: false,
      devShowModHash: false,
      theme: 'dark',
      sidebarPrideTabsEnabled: true,
      enhancedStatusBar: true,
      startupSplashEnabled: true,
      startupSplashSoundEnabled: true,
      startupSplashSoundPath: null,
      appSoundPaths: {},
      appSoundEnabled: {},
    };
    this.initialized = false;
    this.tabSwitchingAttached = false;
    this.drivesLoaded = false;
    this.lastModsPathWarningPath = null;
    this.pathFixModalOpen = false;
    this.readyPromise = this.initSettings();
    this.initializeUI();
  }

  async initSettings() {
    this.settings = await this.loadSettings();
    this.applyHardwareLibraryModePaths();
    this.applyTheme(this.settings.theme);
    this.applySidebarPrideTabsSetting(this.settings.sidebarPrideTabsEnabled);
    this.applyAppSoundSettings();
    this.initialized = true;
    await window.electronAPI.store.set(
      'switchDriveLetter',
      this.settings.switchDriveLetter,
    );
    await window.electronAPI.store.set('modsPath', this.settings.modsPath);
    await window.electronAPI.store.set(
      'pluginsPath',
      this.settings.pluginsPath,
    );
    this.setupEventListeners();
    this.renderIgnoredConflictPaths();
    await this.showPendingConfigRestoreToast();
    setTimeout(() => {
      this.validateConfiguredLibraryPaths();
    }, 1200);
  }

  initializeUI() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupEventListeners();
      });
    } else {
      this.setupEventListeners();
    }
  }

  normalizeEmulatorType(emulatorType) {
    const normalized =
      typeof emulatorType === 'string' ? emulatorType.toLowerCase() : '';
    return normalized === 'ryujinx' ? 'ryujinx' : 'yuzu';
  }

  normalizeSwitchTransferMethod(transferMethod) {
    const normalized =
      typeof transferMethod === 'string' ? transferMethod.toLowerCase() : '';
    return ['ftp', 'drive', 'mtp'].includes(normalized) ? normalized : 'none';
  }

  normalizeAppRunMode(appRunMode) {
    return appRunMode === 'hardware' ? 'hardware' : 'emulator';
  }

  normalizeHardwareLibraryMode(hardwareLibraryMode) {
    return hardwareLibraryMode === 'direct' ? 'direct' : 'local';
  }

  sanitizeIgnoredConflictPath(value: string) {
    return value
      .split(/[\\/]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .join('/');
  }

  async updateIgnoredConflictPathsStorage(
    options = { refreshConflicts: true },
  ) {
    if (!this.initialized) {
      return false;
    }

    try {
      await window.electronAPI.store.set(
        'ignoredConflictPaths',
        this.settings.ignoredConflictPaths,
      );
      this.renderIgnoredConflictPaths();

      if (options.refreshConflicts) {
        await this.refreshConflictDetection();
      }

      return true;
    } catch (error) {
      console.error('Failed to persist ignored conflict paths:', error);
      this.showToast(this.translate('toasts.failedToSaveSetting'), 'error');
      this.renderIgnoredConflictPaths();
      return false;
    }
  }

  async addIgnoredConflictPath(
    value: string,
    options = { refreshConflicts: true },
  ) {
    const sanitized = this.sanitizeIgnoredConflictPath(value.trim());
    if (!sanitized) {
      this.showToast(this.translate('settings.invalidPath'), 'error');
      return false;
    }

    if (this.settings.ignoredConflictPaths.includes(sanitized)) {
      this.showToast(this.translate('settings.ignoredConflictExists'), 'info');
      return false;
    }

    this.settings.ignoredConflictPaths.push(sanitized);
    const saved = await this.updateIgnoredConflictPathsStorage(options);
    if (saved) {
      this.showToast(
        this.translate('settings.ignoredConflictAdded'),
        'success',
      );
    }
    return saved;
  }

  async removeIgnoredConflictPath(value: string) {
    const nextList = this.settings.ignoredConflictPaths.filter(
      (entry) => entry !== value,
    );

    if (nextList.length === this.settings.ignoredConflictPaths.length) {
      return false;
    }

    this.settings.ignoredConflictPaths = nextList;
    const saved = await this.updateIgnoredConflictPathsStorage();
    if (saved) {
      this.showToast(
        this.translate('settings.ignoredConflictRemoved'),
        'success',
      );
    }
    return saved;
  }

  async clearIgnoredConflictPaths() {
    if (!this.settings.ignoredConflictPaths.length) {
      return false;
    }

    this.settings.ignoredConflictPaths = [];
    const saved = await this.updateIgnoredConflictPathsStorage();
    if (saved) {
      this.showToast(
        this.translate('settings.ignoredConflictsCleared'),
        'success',
      );
    }
    return saved;
  }

  async refreshConflictDetection() {
    if (
      !this.settings.conflictDetectionEnabled ||
      !window.modManager?.checkConflicts
    ) {
      return;
    }

    const whitelistPatterns = this.settings.conflictWhitelistPatterns || [];
    await window.modManager.checkConflicts(whitelistPatterns);
  }

  initializeIgnoredConflictsUI() {
    const addButton = document.querySelector<HTMLElement>(
      '#ignored-conflict-add-btn',
    );
    const input = document.querySelector<HTMLInputElement>(
      '#ignored-conflict-input',
    );
    const clearButton = document.querySelector<HTMLElement>(
      '#ignored-conflict-clear-btn',
    );

    if (addButton && !addButton.dataset.listenerAttached) {
      addButton.addEventListener('click', async () => {
        if (!input) {
          return;
        }

        const added = await this.addIgnoredConflictPath(input.value);
        if (added) {
          input.value = '';
        }
      });
      addButton.dataset.listenerAttached = 'true';
    }

    if (input && !input.dataset.listenerAttached) {
      input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const added = await this.addIgnoredConflictPath(input.value);
          if (added) {
            input.value = '';
          }
        }
      });
      input.dataset.listenerAttached = 'true';
    }

    if (clearButton && !clearButton.dataset.listenerAttached) {
      clearButton.addEventListener('click', async () => {
        await this.clearIgnoredConflictPaths();
      });
      clearButton.dataset.listenerAttached = 'true';
    }

    this.renderIgnoredConflictPaths();
  }

  renderIgnoredConflictPaths() {
    const listContainer = document.querySelector<HTMLElement>(
      '#ignored-conflict-list',
    );

    if (!listContainer) {
      return;
    }

    listContainer.innerHTML = '';

    if (!this.settings.ignoredConflictPaths.length) {
      const empty = document.createElement('div');
      empty.className = 'ignored-conflicts-empty';
      empty.textContent = this.translate('settings.ignoredConflictEmpty');
      listContainer.appendChild(empty);
      return;
    }

    this.settings.ignoredConflictPaths
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .forEach((value) => {
        const item = document.createElement('div');
        item.className = 'ignored-conflict-item';

        const pathText = document.createElement('span');
        pathText.className = 'ignored-conflict-path';
        pathText.textContent = value;

        const actions = document.createElement('div');
        actions.className = 'ignored-conflict-actions';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ignored-conflict-remove-btn';
        removeBtn.setAttribute('aria-label', this.translate('common.remove'));
        removeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
        removeBtn.addEventListener('click', () => {
          this.removeIgnoredConflictPath(value);
        });

        actions.appendChild(removeBtn);
        item.appendChild(pathText);
        item.appendChild(actions);
        listContainer.appendChild(item);
      });
  }

  initializeFeedbackUI() {
    const form = document.querySelector<HTMLFormElement>('#feedback-form');
    const typeInput = document.querySelector<HTMLSelectElement>('#feedback-type');
    const messageInput =
      document.querySelector<HTMLTextAreaElement>('#feedback-message');
    const contactInput =
      document.querySelector<HTMLInputElement>('#feedback-contact');
    const submitButton =
      document.querySelector<HTMLButtonElement>('#feedback-submit-btn');

    if (!form || form.dataset.listenerAttached) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const message = messageInput?.value.trim() || '';
      if (message.length < 10) {
        this.showToast(this.translate('toasts.feedbackMessageTooShort'), 'error');
        return;
      }

      const previousLabel = submitButton?.textContent || '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = this.translate('settings.feedbackSending');
      }

      try {
        const appInfo = await window.electronAPI?.getAppVersion?.();
        const result = await window.electronAPI?.submitFeedback?.({
          type: (typeInput?.value || 'feedback') as any,
          message,
          contact: contactInput?.value.trim() || null,
          appVersion: appInfo?.version || null,
          locale: window.i18n?.currentLocale || document.documentElement.lang,
          platform: navigator.platform,
        });

        if (result?.success) {
          form.reset();
          this.showToast(this.translate('toasts.feedbackSent'), 'success');
        } else {
          this.showToast(
            result?.error || this.translate('toasts.feedbackFailed'),
            'error',
          );
        }
      } catch (error) {
        console.error('Failed to submit feedback:', error);
        this.showToast(this.translate('toasts.feedbackFailed'), 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = `
            <i class="bi bi-send"></i>
            <span data-i18n="settings.feedbackSubmit">${this.escapeHtml(
              this.translate('settings.feedbackSubmit'),
            )}</span>
          `;
          if (!previousLabel) {
            submitButton.removeAttribute('aria-label');
          }
        }
      }
    });

    form.dataset.listenerAttached = 'true';
  }

  organizeSettingsLayout() {
    const moveSection = (sectionSelector: string, targetSelector: string) => {
      const anchor = document.querySelector<HTMLElement>(sectionSelector);
      const section = anchor?.closest<HTMLElement>('.settings-section');
      const target = document.querySelector<HTMLElement>(targetSelector);

      if (!section || !target || section.parentElement === target) {
        return;
      }

      target.appendChild(section);
    };

    [
      ['#theme-select', '#settings-interface-appearance'],
      ['#sidebar-pride-tabs-enabled', '#settings-interface-appearance'],
      ['#animation-preference', '#settings-interface-appearance'],
      ['#enhanced-status-bar-enabled', '#settings-interface-behavior'],
      ['#startup-splash-enabled', '#settings-audio-startup'],
      ['#app-sound-enabled-notification', '#settings-audio-events'],
      ['#check-updates-btn', '#settings-updates-app'],
      ['#auto-check-plugin-updates-enabled', '#settings-updates-plugins'],
      ['#hardware-library-mode-select', '#settings-switch-library'],
      ['#switch-transfer-method-select', '#settings-switch-connection'],
      ['#conflict-detection-enabled', '#settings-diagnostics-conflicts'],
      ['#clear-temp-files-btn', '#settings-diagnostics-maintenance'],
      ['#batch-testing-btn', '#settings-diagnostics-batch'],
    ].forEach(([sectionSelector, targetSelector]) => {
      moveSection(sectionSelector, targetSelector);
    });

    document
      .querySelectorAll<HTMLElement>('.settings-group-title')
      .forEach((groupTitle) => {
        let nextElement = groupTitle.nextElementSibling as HTMLElement | null;
        let hasSection = false;

        while (
          nextElement &&
          !nextElement.classList.contains('settings-group-title') &&
          !nextElement.classList.contains('settings-tab-content')
        ) {
          if (
            nextElement.classList.contains('settings-section') ||
            nextElement.querySelector('.settings-section')
          ) {
            hasSection = true;
            break;
          }

          nextElement = nextElement.nextElementSibling as HTMLElement | null;
        }

        if (!hasSection) {
          groupTitle.remove();
        }
      });
  }

  setupEventListeners() {
    this.organizeSettingsLayout();
    this.initializeFeedbackUI();

    if (!this.tabSwitchingAttached) {
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabButton = target.closest<HTMLElement>('.settings-tab-btn');

        if (tabButton) {
          const tabName = tabButton.dataset.settingsTab;
          this.switchSettingsTab(tabName);

          if (tabName === 'logs' && window.logsManager) {
            setTimeout(() => {
              window.logsManager.reinitialize();
            }, 200);
          }

          if (tabName === 'customization' && window.customizationManager) {
            setTimeout(() => {
              window.customizationManager.setupEventListeners();
            }, 200);
          }
        }
      });
      this.tabSwitchingAttached = true;
    }

    const animationSelector = document.querySelector<HTMLElement>(
      '#animation-preference',
    );
    if (animationSelector && !animationSelector.dataset.listenerAttached) {
      animationSelector
        .querySelectorAll<HTMLElement>('.animation-option')
        .forEach((option) => {
          option.addEventListener('click', () => {
            const value = option.dataset.value;
            this.setAnimationPreference(value);

            animationSelector
              .querySelectorAll<HTMLElement>('.animation-option')
              .forEach((opt) => {
                opt.classList.remove('active');
              });
            option.classList.add('active');
          });
        });
      animationSelector.dataset.listenerAttached = 'true';
      this.loadAnimationPreference();
      this.loadAnimationPreference();
    }

    const startupSplashToggle = document.querySelector<HTMLInputElement>(
      '#startup-splash-enabled',
    );
    if (startupSplashToggle && !startupSplashToggle.dataset.listenerAttached) {
      startupSplashToggle.addEventListener('change', () => {
        this.settings.startupSplashEnabled = startupSplashToggle.checked;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashToggle.dataset.listenerAttached = 'true';
    }

    const startupSplashSoundToggle = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-enabled',
    );
    if (
      startupSplashSoundToggle &&
      !startupSplashSoundToggle.dataset.listenerAttached
    ) {
      startupSplashSoundToggle.addEventListener('change', () => {
        this.settings.startupSplashSoundEnabled =
          startupSplashSoundToggle.checked;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashSoundToggle.dataset.listenerAttached = 'true';
    }

    const startupSplashSoundFile = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-file',
    );
    const browseStartupSplashSound = document.querySelector<HTMLElement>(
      '#browse-startup-splash-sound',
    );
    if (
      startupSplashSoundFile &&
      browseStartupSplashSound &&
      !browseStartupSplashSound.dataset.listenerAttached
    ) {
      browseStartupSplashSound.addEventListener('click', () => {
        startupSplashSoundFile.value = '';
        startupSplashSoundFile.click();
      });
      browseStartupSplashSound.dataset.listenerAttached = 'true';
    }

    if (
      startupSplashSoundFile &&
      !startupSplashSoundFile.dataset.listenerAttached
    ) {
      startupSplashSoundFile.addEventListener('change', () => {
        const file = startupSplashSoundFile.files?.[0];
        if (!file) {
          return;
        }

        const filePath = window.electronAPI?.getPathForFile?.(file);
        if (!filePath) {
          window.toastManager?.error?.(
            'Unable to read the selected audio path',
          );
          return;
        }

        this.settings.startupSplashSoundPath = filePath;
        this.settings.startupSplashSoundEnabled = true;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashSoundFile.dataset.listenerAttached = 'true';
    }

    const resetStartupSplashSound = document.querySelector<HTMLElement>(
      '#reset-startup-splash-sound',
    );
    if (
      resetStartupSplashSound &&
      !resetStartupSplashSound.dataset.listenerAttached
    ) {
      resetStartupSplashSound.addEventListener('click', () => {
        this.settings.startupSplashSoundPath = null;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      resetStartupSplashSound.dataset.listenerAttached = 'true';
    }

    document
      .querySelectorAll<HTMLElement>('.app-sound-browse')
      .forEach((button) => {
        if (button.dataset.listenerAttached) {
          return;
        }

        button.addEventListener('click', () => {
          const soundName = button.dataset.soundName;
          if (!soundName) {
            return;
          }

          const fileInput = document.querySelector<HTMLInputElement>(
            `#app-sound-file-${soundName}`,
          );
          if (!fileInput) {
            return;
          }

          fileInput.value = '';
          fileInput.click();
        });
        button.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLInputElement>('input[id^="app-sound-file-"]')
      .forEach((input) => {
        if (input.dataset.listenerAttached) {
          return;
        }

        input.addEventListener('change', () => {
          const soundName = input.dataset.soundName;
          const file = input.files?.[0];
          if (!soundName || !file) {
            return;
          }

          const filePath = window.electronAPI?.getPathForFile?.(file);
          if (!filePath) {
            window.toastManager?.error?.(
              'Unable to read the selected audio path',
            );
            return;
          }

          this.settings.appSoundPaths = {
            ...(this.settings.appSoundPaths || {}),
            [soundName]: filePath,
          };
          window.appSoundManager?.setCustomSound?.(soundName as any, filePath);
          this.saveSettings();
          this.updateAppSoundsUI();
        });
        input.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLElement>('.app-sound-reset')
      .forEach((button) => {
        if (button.dataset.listenerAttached) {
          return;
        }

        button.addEventListener('click', () => {
          const soundName = button.dataset.soundName;
          if (!soundName) {
            return;
          }

          const nextSoundPaths = { ...(this.settings.appSoundPaths || {}) };
          delete nextSoundPaths[soundName];
          this.settings.appSoundPaths = nextSoundPaths;
          window.appSoundManager?.setCustomSound?.(soundName as any, null);
          this.saveSettings();
          this.updateAppSoundsUI();
        });
        button.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLInputElement>('.app-sound-enabled')
      .forEach((input) => {
        if (input.dataset.listenerAttached) {
          return;
        }

        input.addEventListener('change', () => {
          const soundName = input.dataset.soundName;
          if (!soundName) {
            return;
          }

          this.settings.appSoundEnabled = {
            ...(this.settings.appSoundEnabled || {}),
            [soundName]: input.checked,
          };
          window.appSoundManager?.setSoundEnabled?.(
            soundName as any,
            input.checked,
          );
          this.saveSettings();
        });
        input.dataset.listenerAttached = 'true';
      });

    const enhancedStatusBarToggle = document.querySelector<HTMLInputElement>(
      '#enhanced-status-bar-enabled',
    );
    if (
      enhancedStatusBarToggle &&
      !enhancedStatusBarToggle.dataset.listenerAttached
    ) {
      enhancedStatusBarToggle.addEventListener('change', () => {
        this.settings.enhancedStatusBar = enhancedStatusBarToggle.checked;
        this.saveSettings();
        if (window.statusBarManager) {
          // Refresh logic if needed
        }
      });
      enhancedStatusBarToggle.dataset.listenerAttached = 'true';
    }

    const browseMods = document.querySelector<HTMLElement>(
      '#browse-mods-folder',
    );
    if (browseMods && !browseMods.dataset.listenerAttached) {
      browseMods.addEventListener('click', () => this.browseModsFolder());
      browseMods.dataset.listenerAttached = 'true';
      console.log('Browse mods button listener attached');
    }

    const modsPathInput =
      document.querySelector<HTMLInputElement>('#mods-folder-path');
    if (modsPathInput && !modsPathInput.dataset.manualListenerAttached) {
      modsPathInput.addEventListener('change', () =>
        this.updateModsFolderFromInput(modsPathInput.value),
      );
      modsPathInput.dataset.manualListenerAttached = 'true';
    }

    const browsePlugins = document.querySelector<HTMLElement>(
      '#browse-plugins-folder',
    );
    if (browsePlugins && !browsePlugins.dataset.listenerAttached) {
      browsePlugins.addEventListener('click', () => this.browsePluginsFolder());
      browsePlugins.dataset.listenerAttached = 'true';
      console.log('Browse plugins button listener attached');
    }

    const pluginsPathInput = document.querySelector<HTMLInputElement>(
      '#plugins-folder-path',
    );
    if (pluginsPathInput && !pluginsPathInput.dataset.manualListenerAttached) {
      pluginsPathInput.addEventListener('change', () =>
        this.updatePluginsFolderFromInput(pluginsPathInput.value),
      );
      pluginsPathInput.dataset.manualListenerAttached = 'true';
    }

    const exportModsListBtn = document.querySelector<HTMLElement>(
      '#export-mods-list-btn',
    );
    if (exportModsListBtn && !exportModsListBtn.dataset.listenerAttached) {
      exportModsListBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.exportModsList();
        }
      });
      exportModsListBtn.dataset.listenerAttached = 'true';
      console.log('Export mods list button listener attached');
    }

    const bulkEnableModsBtn = document.querySelector<HTMLElement>(
      '#bulk-enable-mods-btn',
    );
    if (bulkEnableModsBtn && !bulkEnableModsBtn.dataset.listenerAttached) {
      bulkEnableModsBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.setAllModsEnabled(true);
        }
      });
      bulkEnableModsBtn.dataset.listenerAttached = 'true';
      console.log('Bulk enable mods button listener attached');
    }

    const bulkDisableModsBtn = document.querySelector<HTMLElement>(
      '#bulk-disable-mods-btn',
    );
    if (bulkDisableModsBtn && !bulkDisableModsBtn.dataset.listenerAttached) {
      bulkDisableModsBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.setAllModsEnabled(false);
        }
      });
      bulkDisableModsBtn.dataset.listenerAttached = 'true';
      console.log('Bulk disable mods button listener attached');
    }

    const batchTestingBtn =
      document.querySelector<HTMLElement>('#batch-testing-btn');
    if (batchTestingBtn && !batchTestingBtn.dataset.listenerAttached) {
      batchTestingBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.openStartModal();
        }
      });
      batchTestingBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing button listener attached');
    }

    const batchTestingResumeBtn = document.querySelector<HTMLElement>(
      '#batch-testing-resume-btn',
    );
    if (
      batchTestingResumeBtn &&
      !batchTestingResumeBtn.dataset.listenerAttached
    ) {
      batchTestingResumeBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.resumeSession();
        }
      });
      batchTestingResumeBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing resume button listener attached');
    }

    const batchTestingCancelBtn = document.querySelector<HTMLElement>(
      '#batch-testing-cancel-btn',
    );
    if (
      batchTestingCancelBtn &&
      !batchTestingCancelBtn.dataset.listenerAttached
    ) {
      batchTestingCancelBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.cancelSession();
        }
      });
      batchTestingCancelBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing cancel button listener attached');
    }

    if ((window as any).batchTestingManager?.refreshControlState) {
      (window as any).batchTestingManager.refreshControlState();
    }

    const browseEmulator = document.querySelector<HTMLElement>(
      '#browse-emulator-path',
    );
    if (browseEmulator && !browseEmulator.dataset.listenerAttached) {
      browseEmulator.addEventListener('click', () => this.browseEmulatorPath());
      browseEmulator.dataset.listenerAttached = 'true';
      console.log('Browse emulator button listener attached');
    }

    const browseGame = document.querySelector<HTMLElement>('#browse-game-path');
    if (browseGame && !browseGame.dataset.listenerAttached) {
      browseGame.addEventListener('click', () => this.browseGamePath());
      browseGame.dataset.listenerAttached = 'true';
      console.log('Browse game button listener attached');
    }

    const restartTutorialBtn = document.querySelector<HTMLElement>(
      '#restart-tutorial-btn',
    );
    if (restartTutorialBtn && !restartTutorialBtn.dataset.listenerAttached) {
      restartTutorialBtn.addEventListener('click', async () => {
        if (window.tutorial) {
          window.tutorial.show();
        }
      });
      restartTutorialBtn.dataset.listenerAttached = 'true';
      console.log('Restart tutorial button listener attached');
    }

    const restartTutorialModsBtn = document.querySelector<HTMLElement>(
      '#restart-tutorial-mods-btn',
    );
    if (
      restartTutorialModsBtn &&
      !restartTutorialModsBtn.dataset.listenerAttached
    ) {
      restartTutorialModsBtn.addEventListener('click', async () => {
        const modsTabBtn = document.querySelector<HTMLElement>(
          '.sidebar-btn[data-tab="tools"]',
        );
        if (modsTabBtn) {
          modsTabBtn.click();
        }
        if (window.tutorial) {
          window.tutorial.show();
        }
      });
      restartTutorialModsBtn.dataset.listenerAttached = 'true';
      console.log('Restart tutorial + mods redirect button listener attached');
    }

    const clearTempFilesBtn = document.querySelector<HTMLElement>(
      '#clear-temp-files-btn',
    );
    if (clearTempFilesBtn && !clearTempFilesBtn.dataset.listenerAttached) {
      clearTempFilesBtn.addEventListener('click', async () => {
        await this.clearTempFiles();
      });
      clearTempFilesBtn.dataset.listenerAttached = 'true';
      console.log('Clear temp files button listener attached');
    }

    const exportConfigBackupBtn = document.querySelector<HTMLButtonElement>(
      '#export-config-backup-btn',
    );
    if (
      exportConfigBackupBtn &&
      !exportConfigBackupBtn.dataset.listenerAttached
    ) {
      exportConfigBackupBtn.addEventListener('click', async () => {
        await this.exportConfigBackup(exportConfigBackupBtn);
      });
      exportConfigBackupBtn.dataset.listenerAttached = 'true';
    }

    const restoreConfigBackupBtn = document.querySelector<HTMLButtonElement>(
      '#restore-config-backup-btn',
    );
    if (
      restoreConfigBackupBtn &&
      !restoreConfigBackupBtn.dataset.listenerAttached
    ) {
      restoreConfigBackupBtn.addEventListener('click', async () => {
        await this.restoreConfigBackup(restoreConfigBackupBtn);
      });
      restoreConfigBackupBtn.dataset.listenerAttached = 'true';
    }

    const installConfirmToggle = document.querySelector<HTMLInputElement>(
      '#install-confirm-enabled',
    );
    if (
      installConfirmToggle &&
      !installConfirmToggle.dataset.listenerAttached
    ) {
      installConfirmToggle.addEventListener('change', async () => {
        console.log('Install confirm toggle changed!');
        const enabled = installConfirmToggle.checked;
        console.log('New value:', enabled);

        try {
          await window.electronAPI.store.set('installConfirmEnabled', enabled);
          console.log('Setting saved successfully');

          if (window.toastManager) {
            window.toastManager.success('toasts.settingSaved');
          } else {
            console.warn('Toast manager not available');
          }
        } catch (error) {
          console.error('Failed to save install confirm setting:', error);
          if (window.toastManager) {
            window.toastManager.error('toasts.failedToSaveSetting');
          }
        }
      });
      installConfirmToggle.dataset.listenerAttached = 'true';
      console.log('Install confirm toggle listener attached');

      this.loadInstallConfirmSetting();
    } else {
      console.log(
        'Install confirm toggle:',
        installConfirmToggle ? 'already has listener' : 'not found',
      );
    }

    const switchIp = document.querySelector<HTMLInputElement>('#switch-ip');
    if (switchIp && !switchIp.dataset.listenerAttached) {
      switchIp.addEventListener('change', () => {
        this.settings.switchIp = switchIp.value;
        this.saveSettings();
      });
      switchIp.dataset.listenerAttached = 'true';
    }

    const switchPort = document.querySelector<HTMLInputElement>('#switch-port');
    if (switchPort && !switchPort.dataset.listenerAttached) {
      switchPort.addEventListener('change', () => {
        this.settings.switchPort = switchPort.value || '5000';
        this.saveSettings();
      });
      switchPort.dataset.listenerAttached = 'true';
    }

    const switchFtpUser =
      document.querySelector<HTMLInputElement>('#switch-ftp-user');
    if (switchFtpUser && !switchFtpUser.dataset.listenerAttached) {
      switchFtpUser.addEventListener('change', () => {
        this.settings.switchFtpUser = switchFtpUser.value.trim() || null;
        this.saveSettings();
      });
      switchFtpUser.dataset.listenerAttached = 'true';
    }

    const switchFtpPassword = document.querySelector<HTMLInputElement>(
      '#switch-ftp-password',
    );
    if (switchFtpPassword && !switchFtpPassword.dataset.listenerAttached) {
      switchFtpPassword.addEventListener('change', () => {
        this.settings.switchFtpPassword = switchFtpPassword.value || null;
        this.saveSettings();
      });
      switchFtpPassword.dataset.listenerAttached = 'true';
    }

    const switchFtpPath =
      document.querySelector<HTMLInputElement>('#switch-ftp-path');
    if (switchFtpPath && !switchFtpPath.dataset.listenerAttached) {
      switchFtpPath.addEventListener('change', () => {
        this.settings.switchFtpModsPath = switchFtpPath.value.trim() || null;
        this.saveSettings();
      });
      switchFtpPath.dataset.listenerAttached = 'true';
    }

    const switchFtpPluginsPath = document.querySelector<HTMLInputElement>(
      '#switch-ftp-plugins-path',
    );
    if (
      switchFtpPluginsPath &&
      !switchFtpPluginsPath.dataset.listenerAttached
    ) {
      switchFtpPluginsPath.addEventListener('change', () => {
        this.settings.switchFtpPluginsPath =
          switchFtpPluginsPath.value.trim() || null;
        this.saveSettings();
      });
      switchFtpPluginsPath.dataset.listenerAttached = 'true';
    }

    const switchTransferMethodSelect = document.querySelector<HTMLElement>(
      '#switch-transfer-method-select',
    );
    if (
      switchTransferMethodSelect &&
      !switchTransferMethodSelect.dataset.listenerAttached
    ) {
      const trigger = switchTransferMethodSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = switchTransferMethodSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        switchTransferMethodSelect.querySelector<HTMLElement>(
          '.selected-value',
        );

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          switchTransferMethodSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!switchTransferMethodSelect.contains(target)) {
          switchTransferMethodSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = this.normalizeSwitchTransferMethod(
            option.dataset.value,
          );
          const text = option.querySelector<HTMLElement>('span')!.textContent;
          const i18nKey =
            option.querySelector<HTMLElement>('span')!.dataset.i18n;

          if (selectedValue) {
            selectedValue.textContent = text;
            if (i18nKey) {
              selectedValue.dataset.i18n = i18nKey;
            }
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          switchTransferMethodSelect.classList.remove('open');

          this.settings.switchTransferMethod = value;
          this.saveSettings();
          this.updateSwitchTransferMethodUI();
        });
      });

      switchTransferMethodSelect.dataset.listenerAttached = 'true';
    }

    const switchDriveLetterSelect = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select',
    );
    if (
      switchDriveLetterSelect &&
      !switchDriveLetterSelect.dataset.listenerAttached
    ) {
      const trigger = switchDriveLetterSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const optionsContainer = document.querySelector<HTMLElement>(
        '#switch-drive-letter-options',
      );
      const selectedValue =
        switchDriveLetterSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', async (e) => {
          e.stopPropagation();
          switchDriveLetterSelect.classList.toggle('open');

          if (
            switchDriveLetterSelect.classList.contains('open') &&
            optionsContainer
          ) {
            if (!this.drivesLoaded) {
              await this.loadAvailableDrives();
              this.drivesLoaded = true;
            }
          }
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!switchDriveLetterSelect.contains(target)) {
          switchDriveLetterSelect.classList.remove('open');
        }
      });

      switchDriveLetterSelect.dataset.listenerAttached = 'true';
    }

    const conflictDetectionEnabled = document.querySelector<HTMLInputElement>(
      '#conflict-detection-enabled',
    );
    if (
      conflictDetectionEnabled &&
      !conflictDetectionEnabled.dataset.listenerAttached
    ) {
      conflictDetectionEnabled.addEventListener('change', () => {
        this.settings.conflictDetectionEnabled =
          conflictDetectionEnabled.checked;
        this.saveSettings();
      });
      conflictDetectionEnabled.dataset.listenerAttached = 'true';
    }

    const nroLimitCheckEnabled = document.querySelector<HTMLInputElement>(
      '#nro-limit-check-enabled',
    );
    if (
      nroLimitCheckEnabled &&
      !nroLimitCheckEnabled.dataset.listenerAttached
    ) {
      nroLimitCheckEnabled.addEventListener('change', () => {
        this.settings.nroLimitCheckEnabled = nroLimitCheckEnabled.checked;
        this.saveSettings();
        if (nroLimitCheckEnabled.checked) {
          window.modManager?.checkNroLimit?.();
        }
      });
      nroLimitCheckEnabled.dataset.listenerAttached = 'true';
    }

    const libraryPathValidationEnabled =
      document.querySelector<HTMLInputElement>(
        '#library-path-validation-enabled',
      );
    if (
      libraryPathValidationEnabled &&
      !libraryPathValidationEnabled.dataset.listenerAttached
    ) {
      libraryPathValidationEnabled.addEventListener('change', () => {
        this.settings.libraryPathValidationEnabled =
          libraryPathValidationEnabled.checked;
        this.saveSettings();
      });
      libraryPathValidationEnabled.dataset.listenerAttached = 'true';
    }

    const switchDriveGuideBtn = document.querySelector<HTMLButtonElement>(
      '#switch-drive-guide-btn',
    );
    if (switchDriveGuideBtn && !switchDriveGuideBtn.dataset.listenerAttached) {
      switchDriveGuideBtn.addEventListener('click', () => {
        this.showSwitchDriveGuideChoiceModal();
      });
      switchDriveGuideBtn.dataset.listenerAttached = 'true';
    }

    const autoCheckPluginUpdates = document.querySelector<HTMLInputElement>(
      '#auto-check-plugin-updates-enabled',
    );
    if (
      autoCheckPluginUpdates &&
      !autoCheckPluginUpdates.dataset.listenerAttached
    ) {
      autoCheckPluginUpdates.addEventListener('change', () => {
        this.settings.autoCheckPluginUpdates = autoCheckPluginUpdates.checked;
        this.saveSettings();
      });
      autoCheckPluginUpdates.dataset.listenerAttached = 'true';
    }

    const autoDisableMods = document.querySelector<HTMLInputElement>(
      '#auto-disable-mods-enabled',
    );
    if (autoDisableMods && !autoDisableMods.dataset.listenerAttached) {
      autoDisableMods.addEventListener('change', () => {
        this.settings.autoDisableNewMods = autoDisableMods.checked;
        this.saveSettings();
      });
      autoDisableMods.dataset.listenerAttached = 'true';
    }

    const disableAllOnDownload = document.querySelector<HTMLInputElement>(
      '#disable-all-mods-on-download-enabled',
    );
    if (
      disableAllOnDownload &&
      !disableAllOnDownload.dataset.listenerAttached
    ) {
      disableAllOnDownload.addEventListener('change', () => {
        this.settings.disableAllModsOnDownload = disableAllOnDownload.checked;
        this.saveSettings();
      });
      disableAllOnDownload.dataset.listenerAttached = 'true';
    }

    const checkUpdatesBtn =
      document.querySelector<HTMLElement>('#check-updates-btn');
    if (checkUpdatesBtn && !checkUpdatesBtn.dataset.listenerAttached) {
      checkUpdatesBtn.addEventListener('click', async () => {
        if (window.updateManager) {
          await window.updateManager.checkForUpdatesManually();
        }
      });
      checkUpdatesBtn.dataset.listenerAttached = 'true';
      console.log('Check updates button listener attached');
    }

    const autoCheckAppUpdates = document.querySelector<HTMLInputElement>(
      '#auto-check-app-updates-enabled',
    );
    if (autoCheckAppUpdates && !autoCheckAppUpdates.dataset.listenerAttached) {
      autoCheckAppUpdates.addEventListener('change', async () => {
        await window.electronAPI?.setAutoCheckEnabled?.(
          autoCheckAppUpdates.checked,
        );
      });
      autoCheckAppUpdates.dataset.listenerAttached = 'true';
    }

    this.updateAppVersionUI();
    this.updateAutoCheckAppUpdatesUI();

    const updateChannelSelect = document.querySelector<HTMLElement>(
      '#update-channel-select',
    );
    if (updateChannelSelect && !updateChannelSelect.dataset.listenerAttached) {
      const trigger = updateChannelSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = updateChannelSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        updateChannelSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          updateChannelSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!updateChannelSelect.contains(target)) {
          updateChannelSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', async () => {
          const value = option.dataset.value!;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          updateChannelSelect.classList.remove('open');

          if (window.electronAPI && window.electronAPI.setUpdateChannel) {
            await window.electronAPI.setUpdateChannel(value);
            await window.electronAPI.store.set('updateChannel', value);
            console.log('Update channel set to:', value);

            if (window.toastManager) {
              window.toastManager.success('toasts.settingSaved');
            }
          }
        });
      });

      updateChannelSelect.dataset.listenerAttached = 'true';
      this.updateChannelUI();
    }

    const languageTypeSelect = document.querySelector<HTMLElement>(
      '#language-type-select',
    );
    if (languageTypeSelect && !languageTypeSelect.dataset.listenerAttached) {
      const trigger = languageTypeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = languageTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        languageTypeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          languageTypeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!languageTypeSelect.contains(target)) {
          languageTypeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', async () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          languageTypeSelect.classList.remove('open');

          if (window.i18n) {
            await window.i18n.changeLocale(value);
          }
        });
      });

      languageTypeSelect.dataset.listenerAttached = 'true';
      this.updateLanguageTypeUI();

      window.addEventListener('localeChanged', () => {
        this.updateLanguageTypeUI();
      });
    }

    const themeSelect = document.querySelector<HTMLElement>('#theme-select');
    if (themeSelect && !themeSelect.dataset.listenerAttached) {
      const trigger = themeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = themeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        themeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          themeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!themeSelect.contains(target)) {
          themeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          themeSelect.classList.remove('open');

          this.setTheme(value);
        });
      });

      themeSelect.dataset.listenerAttached = 'true';
      this.updateThemeUI();
    }

    const appRunModeSelect = document.querySelector<HTMLElement>(
      '#app-run-mode-select',
    );
    if (appRunModeSelect && !appRunModeSelect.dataset.listenerAttached) {
      const trigger = appRunModeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = appRunModeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        appRunModeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          appRunModeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!appRunModeSelect.contains(target)) {
          appRunModeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = this.normalizeAppRunMode(option.dataset.value);
          const text = option.querySelector<HTMLElement>('span')!.textContent;
          const i18nKey =
            option.querySelector<HTMLElement>('span')!.dataset.i18n;

          if (selectedValue) {
            selectedValue.textContent = text;
            if (i18nKey) {
              selectedValue.dataset.i18n = i18nKey;
            }
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          appRunModeSelect.classList.remove('open');

          this.settings.appRunMode = value;
          this.applyHardwareLibraryModePaths();
          this.updateHardwareLibraryModeVisibility();
          this.updateRunModeTabsVisibility();
          this.saveSettings();
        });
      });

      appRunModeSelect.dataset.listenerAttached = 'true';
      this.updateAppRunModeUI();
    }

    const hardwareLibraryModeSelect = document.querySelector<HTMLElement>(
      '#hardware-library-mode-select',
    );
    if (
      hardwareLibraryModeSelect &&
      !hardwareLibraryModeSelect.dataset.listenerAttached
    ) {
      const trigger = hardwareLibraryModeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = hardwareLibraryModeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        hardwareLibraryModeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          hardwareLibraryModeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!hardwareLibraryModeSelect.contains(target)) {
          hardwareLibraryModeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', async () => {
          const value = this.normalizeHardwareLibraryMode(option.dataset.value);
          const previousMode = this.normalizeHardwareLibraryMode(
            this.settings.hardwareLibraryMode,
          );
          const text = option.querySelector<HTMLElement>('span')!.textContent;
          const i18nKey =
            option.querySelector<HTMLElement>('span')!.dataset.i18n;

          if (selectedValue) {
            selectedValue.textContent = text;
            if (i18nKey) {
              selectedValue.dataset.i18n = i18nKey;
            }
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          hardwareLibraryModeSelect.classList.remove('open');

          this.settings.hardwareLibraryMode = value;
          this.applyHardwareLibraryModePaths();
          await this.saveSettings();
          await this.refreshCurrentLibraryLists();

          if (previousMode === 'direct' && value === 'local') {
            this.showSwitchSyncReconnectModal();
          }
        });
      });

      hardwareLibraryModeSelect.dataset.listenerAttached = 'true';
      this.updateHardwareLibraryModeUI();
    }

    const sidebarPrideTabsToggle = document.querySelector<HTMLInputElement>(
      '#sidebar-pride-tabs-enabled',
    );
    if (
      sidebarPrideTabsToggle &&
      !sidebarPrideTabsToggle.dataset.listenerAttached
    ) {
      sidebarPrideTabsToggle.checked =
        this.settings.sidebarPrideTabsEnabled !== false;
      sidebarPrideTabsToggle.addEventListener('change', async () => {
        const enabled = sidebarPrideTabsToggle.checked;
        this.settings.sidebarPrideTabsEnabled = enabled;
        this.applySidebarPrideTabsSetting(enabled);
        await window.electronAPI.store.set('sidebarPrideTabsEnabled', enabled);
      });
      sidebarPrideTabsToggle.dataset.listenerAttached = 'true';
    }

    const emulatorTypeSelect = document.querySelector<HTMLElement>(
      '#emulator-type-select',
    );
    if (emulatorTypeSelect && !emulatorTypeSelect.dataset.listenerAttached) {
      const trigger = emulatorTypeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = emulatorTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        emulatorTypeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          emulatorTypeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (!emulatorTypeSelect.contains(target)) {
          emulatorTypeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          emulatorTypeSelect.classList.remove('open');

          this.settings.emulatorType = value;
          this.saveSettings();
          this.updateFullscreenVisibility();
        });
      });

      emulatorTypeSelect.dataset.listenerAttached = 'true';
    }

    const emulatorFullscreenToggle = document.querySelector<HTMLInputElement>(
      '#emulator-fullscreen-enabled',
    );
    if (
      emulatorFullscreenToggle &&
      !emulatorFullscreenToggle.dataset.listenerAttached
    ) {
      emulatorFullscreenToggle.addEventListener('change', () => {
        this.settings.emulatorFullscreen = emulatorFullscreenToggle.checked;
        this.saveSettings();
      });
      emulatorFullscreenToggle.dataset.listenerAttached = 'true';
    }

    this.updateModsFolderUI();
    this.updatePluginsFolderUI();
    this.updateLanguageTypeUI();
    this.updateAppRunModeUI();
    this.updateHardwareLibraryModeVisibility();
    this.updateRunModeTabsVisibility();
    this.updateHardwareLibraryModeUI();
    this.updateEmulatorTypeUI();
    this.updateEmulatorPathUI();
    this.updateGamePathUI();
    this.updateEmulatorFullscreenUI();
    this.updateFullscreenVisibility();
    this.updateSwitchSettingsUI();
    this.updateSwitchTransferMethodUI();
    this.updateConflictDetectionUI();
    this.updateNroLimitCheckUI();
    this.updateLibraryPathValidationUI();
    this.updateAutoCheckPluginUpdatesUI();
    this.updateAutoDisableModsUI();
    this.updateDisableAllModsOnDownloadUI();
    this.updateEnhancedStatusBarUI();
    this.updateStartupSplashUI();
    this.updateStartupSplashSoundUI();
    this.updateAppSoundsUI();
    this.updateDeveloperModeUI();
    this.initializeIgnoredConflictsUI();

    // Analytics toggle
    const analyticsToggle =
      document.querySelector<HTMLInputElement>('#analytics-enabled');
    if (analyticsToggle && !analyticsToggle.dataset.listenerAttached) {
      // Load current value
      if (window.electronAPI && window.electronAPI.getAnalyticsEnabled) {
        window.electronAPI.getAnalyticsEnabled().then((enabled: boolean) => {
          analyticsToggle.checked = enabled;
        });
      }

      analyticsToggle.addEventListener('change', async () => {
        if (window.electronAPI && window.electronAPI.setAnalyticsEnabled) {
          await window.electronAPI.setAnalyticsEnabled(analyticsToggle.checked);
          this.showToast(this.translate('toasts.settingSaved'), 'success');
        }
      });
      analyticsToggle.dataset.listenerAttached = 'true';
    }

    const devModeToggle = document.querySelector<HTMLInputElement>(
      '#developer-mode-enabled',
    );
    if (devModeToggle) {
      devModeToggle.addEventListener('change', (e) => {
        this.settings.devMode = devModeToggle.checked;
        this.saveSettings();
        this.updateDeveloperModeUI();
      });
    }

    const devShowModHashToggle = document.querySelector<HTMLInputElement>(
      '#developer-show-mod-hash',
    );
    if (devShowModHashToggle) {
      devShowModHashToggle.addEventListener('change', (e) => {
        this.settings.devShowModHash = devShowModHashToggle.checked;
        this.saveSettings();
        if (window.modManager) {
          window.modManager.renderModList();
        }
      });
    }

    const fakeVersionInput = document.querySelector<HTMLInputElement>(
      '#fake-version-input',
    );
    const saveDevSettingsBtn = document.querySelector<HTMLElement>(
      '#save-dev-settings-btn',
    );
    const resetDevSettingsBtn = document.querySelector<HTMLElement>(
      '#reset-dev-settings-btn',
    );

    if (fakeVersionInput && saveDevSettingsBtn) {
      // Load current fake version
      window.electronAPI.store
        .get('developer.fakeVersion')
        .then((fakeVersion: string | null) => {
          if (fakeVersion) {
            fakeVersionInput.value = fakeVersion;
          }
        });

      saveDevSettingsBtn.addEventListener('click', () => {
        const fakeVersion = fakeVersionInput.value.trim();
        window.electronAPI.store.set('developer.fakeVersion', fakeVersion);
        this.showToast(this.translate('devSettingsSaved'), 'success');
      });

      if (resetDevSettingsBtn) {
        resetDevSettingsBtn.addEventListener('click', () => {
          fakeVersionInput.value = '';
          window.electronAPI.store.set('developer.fakeVersion', '');
          this.showToast(this.translate('settingSaved'), 'success');
        });
      }

      const simulateUpdateBtn = document.querySelector<HTMLElement>(
        '#simulate-update-btn',
      );
      if (simulateUpdateBtn) {
        simulateUpdateBtn.addEventListener('click', async () => {
          if (window.electronAPI && window.electronAPI.simulateUpdate) {
            await window.electronAPI.simulateUpdate();
            this.showToast('Update simulation started', 'success');
          }
        });
      }

      const testHardwareOverlayBtn = document.querySelector<HTMLElement>(
        '#test-hardware-overlay-btn',
      );
      if (
        testHardwareOverlayBtn &&
        !testHardwareOverlayBtn.dataset.listenerAttached
      ) {
        testHardwareOverlayBtn.addEventListener('click', () => {
          window.hardwareConnectionManager?.showTestOverlay?.();
        });
        testHardwareOverlayBtn.dataset.listenerAttached = 'true';
      }

      const testNroLimitModalBtn = document.querySelector<HTMLElement>(
        '#test-nro-limit-modal-btn',
      );
      if (
        testNroLimitModalBtn &&
        !testNroLimitModalBtn.dataset.listenerAttached
      ) {
        testNroLimitModalBtn.addEventListener('click', () => {
          window.modManager?.showNroLimitWarningModal?.({
            success: true,
            limit: 64,
            totalNroFiles: 70,
            exceedsLimit: true,
            activeModsCount: 8,
            files: [
              {
                modName: 'Example Skyline Plugin Pack',
                modPath: '/example/mods/Example Skyline Plugin Pack',
                relativePath: 'ultimate/plugins/example_one.nro',
              },
              {
                modName: 'Example Training Tools',
                modPath: '/example/mods/Example Training Tools',
                relativePath: 'ultimate/plugins/example_two.nro',
              },
            ],
          });
        });
        testNroLimitModalBtn.dataset.listenerAttached = 'true';
      }

      const openConfigBtn =
        document.querySelector<HTMLElement>('#open-config-btn');
      if (openConfigBtn) {
        openConfigBtn.addEventListener('click', async () => {
          if (window.electronAPI && window.electronAPI.openConfigFile) {
            await window.electronAPI.openConfigFile();
          }
        });
      }

      const forceUpdateToggle = document.querySelector<HTMLInputElement>(
        '#force-update-enabled',
      );
      if (
        forceUpdateToggle &&
        window.electronAPI &&
        window.electronAPI.getForceUpdate
      ) {
        // Load initial state
        window.electronAPI.getForceUpdate().then((isEnabled) => {
          forceUpdateToggle.checked = isEnabled;
        });

        // Add listener
        forceUpdateToggle.addEventListener('change', async (e) => {
          if (window.electronAPI) {
            await window.electronAPI.setForceUpdate(forceUpdateToggle.checked);
            this.showToast('Force update setting saved', 'success');
          }
        });
      }
    }

    // PostHog test buttons
    const posthogTestEventBtn = document.querySelector<HTMLElement>(
      '#posthog-test-event-btn',
    );
    const posthogTestErrorBtn = document.querySelector<HTMLElement>(
      '#posthog-test-error-btn',
    );
    const posthogTestStatus = document.querySelector<HTMLElement>(
      '#posthog-test-status',
    );

    if (posthogTestEventBtn && !posthogTestEventBtn.dataset.listenerAttached) {
      posthogTestEventBtn.addEventListener('click', async () => {
        try {
          if (window.electronAPI && window.electronAPI.testPosthogEvent) {
            const result = await window.electronAPI.testPosthogEvent();
            if (result?.success) {
              this.showToast('Test event sent to PostHog', 'success');
              if (posthogTestStatus) {
                const span = posthogTestStatus.querySelector('span');
                if (span) span.textContent = 'Test event sent successfully!';
                posthogTestStatus.style.display = 'flex';
              }
            }
          }
        } catch (err) {
          this.showToast('Failed to send test event', 'error');
          console.error('PostHog test event failed:', err);
        }
      });
      posthogTestEventBtn.dataset.listenerAttached = 'true';
    }

    if (posthogTestErrorBtn && !posthogTestErrorBtn.dataset.listenerAttached) {
      posthogTestErrorBtn.addEventListener('click', async () => {
        try {
          if (window.electronAPI && window.electronAPI.testPosthogError) {
            const result = await window.electronAPI.testPosthogError();
            if (result?.success) {
              this.showToast('Test error sent to PostHog', 'success');
              if (posthogTestStatus) {
                const span = posthogTestStatus.querySelector('span');
                if (span) span.textContent = 'Test error sent successfully!';
                posthogTestStatus.style.display = 'flex';
              }
            }
          }
        } catch (err) {
          this.showToast('Failed to send test error', 'error');
          console.error('PostHog test error failed:', err);
        }
      });
      posthogTestErrorBtn.dataset.listenerAttached = 'true';
    }

    const logRetentionInput = document.querySelector<HTMLInputElement>(
      '#log-retention-days',
    );
    if (logRetentionInput && !logRetentionInput.dataset.listenerAttached) {
      window.electronAPI.store.get('logRetentionDays').then((value: number) => {
        logRetentionInput.value = String(value || 7);
      });

      logRetentionInput.addEventListener('change', async () => {
        const value = parseInt(logRetentionInput.value, 10);
        if (value >= 1 && value <= 365) {
          await window.electronAPI.store.set('logRetentionDays', value);
          this.showToast(this.translate('toasts.settingSaved'), 'success');
        }
      });
      logRetentionInput.dataset.listenerAttached = 'true';
    }

    // Reset Electron Store button
    const resetStoreBtn = document.querySelector<HTMLElement>(
      '#reset-electron-store-btn',
    );
    if (resetStoreBtn && !resetStoreBtn.dataset.listenerAttached) {
      resetStoreBtn.addEventListener('click', () => {
        this.showResetStoreConfirmModal();
      });
      resetStoreBtn.dataset.listenerAttached = 'true';
    }

  }

  updateDeveloperModeUI() {
    const devTabBtn = document.querySelector<HTMLElement>(
      '#settings-tab-developer',
    );
    const devModeToggle = document.querySelector<HTMLInputElement>(
      '#developer-mode-enabled',
    );

    if (devModeToggle) {
      devModeToggle.checked = this.settings.devMode;
    }

    const devShowModHashToggle = document.querySelector<HTMLInputElement>(
      '#developer-show-mod-hash',
    );
    if (devShowModHashToggle) {
      devShowModHashToggle.checked = this.settings.devShowModHash || false;
    }

    if (devTabBtn) {
      devTabBtn.style.display = this.settings.devMode ? 'block' : 'none';

      // If we are on the developer tab and disable dev mode, switch to general
      if (!this.settings.devMode && devTabBtn.classList.contains('active')) {
        const generalBtn = document.querySelector<HTMLButtonElement>(
          '[data-settings-tab="general"]',
        );
        if (generalBtn) generalBtn.click();
      }
    }
  }

  updateAutoDisableModsUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#auto-disable-mods-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.autoDisableNewMods || false;
    }
  }

  updateDisableAllModsOnDownloadUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#disable-all-mods-on-download-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.disableAllModsOnDownload || false;
    }
  }

  updateEnhancedStatusBarUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#enhanced-status-bar-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.enhancedStatusBar !== false;
    }
  }

  switchSettingsTab(tabName) {
    const newActive = document.querySelector<HTMLElement>(
      `#settings-${tabName}`,
    );
    if (!newActive) return;

    const contentArea = document.querySelector<HTMLElement>(
      '.settings-content-area',
    );
    const allContents = Array.from(
      document.querySelectorAll<HTMLElement>('.settings-tab-content'),
    );
    const allButtons = Array.from(
      document.querySelectorAll<HTMLElement>('.settings-tab-btn'),
    );
    const currentActive = document.querySelector<HTMLElement>(
      '.settings-tab-content.active',
    );
    const activeBtn = document.querySelector<HTMLElement>(
      `[data-settings-tab="${tabName}"]`,
    );

    const resetTransitionClasses = () => {
      allContents.forEach((content) => {
        content.classList.remove(
          'entering',
          'fade-out',
          'settings-tab-forward',
          'settings-tab-back',
        );
      });
    };

    const activateTab = () => {
      allContents.forEach((content) => {
        content.classList.remove('active');
      });

      allButtons.forEach((btn) => {
        btn.classList.remove('active');
      });

      if (activeBtn) {
        activeBtn.classList.add('active');
      }

      newActive.classList.add('active');

      if (contentArea) {
        contentArea.scrollTop = 0;
      }

      this.maybeWarnForCurrentModsPath();
    };

    if (this.switchTabTimeout) {
      clearTimeout(this.switchTabTimeout);
      this.switchTabTimeout = null;
      resetTransitionClasses();
    }

    const animationsDisabled =
      document.body.classList.contains('no-animations');

    if (currentActive && currentActive !== newActive && !animationsDisabled) {
      const currentTabName = currentActive.id.replace('settings-', '');
      const currentIndex = allButtons.findIndex(
        (btn) => btn.dataset.settingsTab === currentTabName,
      );
      const nextIndex = allButtons.findIndex(
        (btn) => btn.dataset.settingsTab === tabName,
      );
      const directionClass =
        nextIndex >= currentIndex
          ? 'settings-tab-forward'
          : 'settings-tab-back';

      allButtons.forEach((btn) => {
        btn.classList.remove('active');
      });

      if (activeBtn) {
        activeBtn.classList.add('active');
      }

      if (contentArea) {
        contentArea.scrollTop = 0;
      }

      allContents.forEach((content) => {
        content.classList.remove('active');
      });
      newActive.classList.add('active', 'entering', directionClass);

      this.switchTabTimeout = setTimeout(() => {
        resetTransitionClasses();
        newActive.classList.add('active');
        this.maybeWarnForCurrentModsPath();
        this.switchTabTimeout = null;
      }, 360);
    } else {
      resetTransitionClasses();
      activateTab();
    }
  }

  async browseModsFolder() {
    if (!window.electronAPI || !window.electronAPI.selectFolder) {
      console.error('Electron API not available');
      return;
    }

    console.log('[SettingsManager] Browse mods folder requested');
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      console.log('[SettingsManager] Mods folder selected:', {
        previousPath: this.settings.modsPath,
        nextPath: folder,
      });
      this.settings.modsPath = folder;
      this.saveSettings();
      this.updateModsFolderUI();
      await this.refreshModsListForPath(folder);
      this.checkModsPath(folder, { force: true });
    } else {
      console.log('[SettingsManager] Mods folder selection cancelled');
    }
  }

  async updateModsFolderFromInput(value) {
    const folder = value.trim();
    if (!folder || folder === this.settings.modsPath) {
      console.log('[SettingsManager] Mods folder manual change ignored:', {
        value,
        currentPath: this.settings.modsPath,
      });
      this.updateModsFolderUI();
      return;
    }

    console.log('[SettingsManager] Mods folder changed manually:', {
      previousPath: this.settings.modsPath,
      nextPath: folder,
    });
    this.settings.modsPath = folder;
    this.saveSettings();
    this.updateModsFolderUI();
    await this.refreshModsListForPath(folder);
    this.checkModsPath(folder, { force: true });
  }

  async refreshModsListForPath(modsPath) {
    if (!modsPath || !window.modManager?.loadModsFromFolder) {
      console.warn('[SettingsManager] Cannot refresh mods list:', {
        modsPath,
        hasModManager: !!window.modManager,
      });
      return;
    }

    try {
      console.log('[SettingsManager] Refreshing mods list for path:', modsPath);
      await window.modManager.loadModsFromFolder(modsPath);
      console.log('[SettingsManager] Mods list refreshed:', modsPath);
    } catch (error) {
      console.error('Failed to refresh mods after path change:', error);
    }
  }

  maybeWarnForCurrentModsPath() {
    const libraryTab = document.querySelector<HTMLElement>('#settings-library');
    if (!libraryTab?.classList.contains('active')) {
      return;
    }

    if (this.settings.modsPath) {
      this.checkModsPath(this.settings.modsPath);
    }
  }

  hasExpectedModsPathStructure(path) {
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
    return (
      normalizedPath.includes('ultimate/mods') ||
      normalizedPath.includes('ultimate\\mods')
    );
  }

  shouldEnforceUltimateModsPath() {
    return !(
      this.getAppRunMode() === 'hardware' &&
      this.normalizeHardwareLibraryMode(this.settings.hardwareLibraryMode) ===
        'local'
    );
  }

  checkModsPath(path, options: { force?: boolean } = {}) {
    if (
      !path ||
      this.settings.libraryPathValidationEnabled === false ||
      !this.shouldEnforceUltimateModsPath() ||
      this.hasExpectedModsPathStructure(path)
    ) {
      return;
    }

    if (!options.force && this.lastModsPathWarningPath === path) {
      return;
    }

    if (document.querySelector('.mods-path-warning-modal')) {
      return;
    }

    this.lastModsPathWarningPath = path;
    this.showLibraryPathFixModal([
      {
        key: 'modsPath',
        label: this.translate('settings.modsFolder'),
        currentPath: path,
        reason: this.translate('settings.pathIssueWrongModsFolder'),
        required: true,
      },
    ]);
  }

  async validateConfiguredLibraryPaths() {
    if (
      this.pathFixModalOpen ||
      this.settings.libraryPathValidationEnabled === false ||
      this.isDirectSwitchLibraryMode() ||
      !window.electronAPI?.checkPathAccessible
    ) {
      return;
    }

    const issues: Array<{
      key: 'modsPath' | 'pluginsPath';
      label: string;
      currentPath: string;
      reason: string;
      required: boolean;
    }> = [];

    const checkPath = async (
      key: 'modsPath' | 'pluginsPath',
      label: string,
      pathValue: string | null,
      required: boolean,
    ) => {
      if (!pathValue) {
        return;
      }

      const result = await window.electronAPI.checkPathAccessible(pathValue);
      if (!result.success || !result.accessible) {
        issues.push({
          key,
          label,
          currentPath: pathValue,
          reason: this.translate('settings.pathIssueMissing'),
          required,
        });
        return;
      }

      if (
        key === 'modsPath' &&
        this.shouldEnforceUltimateModsPath() &&
        !this.hasExpectedModsPathStructure(pathValue)
      ) {
        issues.push({
          key,
          label,
          currentPath: pathValue,
          reason: this.translate('settings.pathIssueWrongModsFolder'),
          required,
        });
      }
    };

    try {
      await checkPath(
        'modsPath',
        this.translate('settings.modsFolder'),
        this.settings.modsPath,
        true,
      );
      await checkPath(
        'pluginsPath',
        this.translate('settings.pluginsFolder'),
        this.settings.pluginsPath,
        true,
      );
    } catch (error) {
      console.error('Failed to validate configured library paths:', error);
      return;
    }

    if (issues.length > 0) {
      this.showLibraryPathFixModal(issues);
    }
  }

  showLibraryPathFixModal(
    issues: Array<{
      key: 'modsPath' | 'pluginsPath';
      label: string;
      currentPath: string;
      reason: string;
      required: boolean;
    }>,
  ) {
    if (this.pathFixModalOpen || issues.length === 0) {
      return;
    }

    if (!window.modalManager?.showCustomModal) {
      this.showToast(this.translate('settings.pathWarning'), 'error');
      return;
    }

    this.pathFixModalOpen = true;
    const selectedPaths = new Map<string, string>();

    const body = document.createElement('div');
    body.className = 'library-path-fix-modal';
    body.innerHTML = `
      <p class="library-path-fix-intro">${this.escapeHtml(this.translate('settings.libraryPathFixIntro'))}</p>
      ${issues
        .map(
          (issue) => `
          <div class="library-path-fix-row" data-path-key="${issue.key}">
            <div class="library-path-fix-header">
              <strong>${this.escapeHtml(issue.label)}</strong>
              <span>${this.escapeHtml(issue.reason)}</span>
            </div>
            <code>${this.escapeHtml(issue.currentPath)}</code>
            <div class="library-path-fix-picker">
              <input class="settings-input" type="text" readonly value="" placeholder="${this.escapeHtml(this.translate('settings.chooseReplacementPath'))}">
              <button type="button" class="settings-btn" data-path-browse="${issue.key}">
                <i class="bi bi-folder2-open"></i>
                <span>${this.escapeHtml(this.translate('settings.browse'))}</span>
              </button>
            </div>
            <p class="settings-hint">${this.escapeHtml(
              issue.key === 'modsPath'
                ? this.translate('settings.modsPathFixHint')
                : this.translate('settings.pluginsPathFixHint'),
            )}</p>
          </div>
        `,
        )
        .join('')}
    `;

    const modal = window.modalManager.showCustomModal({
      id: 'library-path-fix-modal',
      title: this.translate('settings.libraryPathFixTitle'),
      body,
      clickOverlayToClose: false,
      escapeToClose: false,
      buttons: [
        {
          text: this.translate('settings.saveCorrectedPaths'),
          type: 'primary',
          closeOnClick: false,
          onClick: async (_event, modalElement) => {
            const saved = await this.saveCorrectedLibraryPaths(
              issues,
              selectedPaths,
            );
            if (!saved) {
              return;
            }

            window.modalManager.closeModal(modalElement, {
              onModalClosed: () => {
                modalElement.remove();
                this.pathFixModalOpen = false;
              },
            });
          },
        },
        {
          text: this.translate('common.cancel') || 'Cancel',
          type: 'secondary',
          onClick: () => {
            this.pathFixModalOpen = false;
          },
        },
      ],
    });

    modal
      .querySelectorAll<HTMLElement>('[data-path-browse]')
      .forEach((button) => {
        button.addEventListener('click', async () => {
          const key = button.dataset.pathBrowse;
          if (!key || !window.electronAPI?.selectFolder) {
            return;
          }

          const folder = await window.electronAPI.selectFolder();
          if (!folder) {
            return;
          }

          selectedPaths.set(key, folder);
          const row = modal.querySelector<HTMLElement>(
            `.library-path-fix-row[data-path-key="${key}"]`,
          );
          const input = row?.querySelector<HTMLInputElement>('input');
          if (input) {
            input.value = folder;
          }
        });
      });
  }

  async saveCorrectedLibraryPaths(
    issues: Array<{
      key: 'modsPath' | 'pluginsPath';
      label: string;
      currentPath: string;
      reason: string;
      required: boolean;
    }>,
    selectedPaths: Map<string, string>,
  ) {
    for (const issue of issues) {
      const nextPath = selectedPaths.get(issue.key);

      if (!nextPath) {
        if (issue.required) {
          this.showToast(
            this.translate('settings.selectReplacementPathRequired'),
            'error',
          );
          return false;
        }
        continue;
      }

      if (
        issue.key === 'modsPath' &&
        this.shouldEnforceUltimateModsPath() &&
        !this.hasExpectedModsPathStructure(nextPath)
      ) {
        this.showToast(
          this.translate('settings.pathIssueWrongModsFolder'),
          'error',
        );
        return false;
      }

      if (window.electronAPI?.folderExists) {
        const existsResult = await window.electronAPI.folderExists(nextPath);
        if (!existsResult.success || !existsResult.exists) {
          this.showToast(this.translate('settings.pathIssueMissing'), 'error');
          return false;
        }
      }

      if (issue.key === 'modsPath') {
        this.settings.modsPath = nextPath;
        if (!this.isSwitchLibraryPath(nextPath)) {
          this.settings.localModsPath = nextPath;
        }
      } else {
        this.settings.pluginsPath = nextPath;
        if (!this.isSwitchLibraryPath(nextPath)) {
          this.settings.localPluginsPath = nextPath;
        }
      }
    }

    await this.saveSettings();
    this.updateModsFolderUI();
    this.updatePluginsFolderUI();
    await this.refreshCurrentLibraryLists();
    this.showToast(this.translate('toasts.libraryPathsUpdated'), 'success');
    return true;
  }

  async browsePluginsFolder() {
    if (!window.electronAPI || !window.electronAPI.selectFolder) {
      console.error('Electron API not available');
      return;
    }

    console.log('[SettingsManager] Browse plugins folder requested');
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      console.log('[SettingsManager] Plugins folder selected:', {
        previousPath: this.settings.pluginsPath,
        nextPath: folder,
      });
      this.settings.pluginsPath = folder;
      this.saveSettings();
      this.updatePluginsFolderUI();
    } else {
      console.log('[SettingsManager] Plugins folder selection cancelled');
    }
  }

  async updatePluginsFolderFromInput(value) {
    const folder = value.trim();
    if (!folder || folder === this.settings.pluginsPath) {
      console.log('[SettingsManager] Plugins folder manual change ignored:', {
        value,
        currentPath: this.settings.pluginsPath,
      });
      this.updatePluginsFolderUI();
      return;
    }

    console.log('[SettingsManager] Plugins folder changed manually:', {
      previousPath: this.settings.pluginsPath,
      nextPath: folder,
    });
    this.settings.pluginsPath = folder;
    this.saveSettings();
    this.updatePluginsFolderUI();

    try {
      console.log(
        '[SettingsManager] Refreshing plugins list for path:',
        folder,
      );
      await window.pluginManager?.loadPluginsFromFolder?.(folder);
      console.log('[SettingsManager] Plugins list refreshed:', folder);
    } catch (error) {
      console.error('Failed to refresh plugins after path change:', error);
    }
  }

  showSwitchSyncReconnectModal() {
    if (!window.modalManager?.showCustomModal) {
      window.toastManager?.warning?.(
        'toasts.reconnectSwitchBeforeSyncToPc',
        8000,
      );
      return;
    }

    const body = document.createElement('div');
    body.className = 'switch-sync-reconnect-modal';

    const message = document.createElement('p');
    message.textContent = this.translate('settings.switchSyncReconnectMessage');

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = this.translate('settings.switchSyncReconnectHint');

    body.append(message, hint);

    window.modalManager.showCustomModal({
      id: 'switch-sync-reconnect-modal',
      title: this.translate('settings.switchSyncReconnectTitle'),
      body,
      size: 'normal',
      buttons: [
        {
          text: this.translate('settings.switchDriveGuideButton'),
          type: 'primary',
          onClick: (_event, modal) => {
            window.modalManager.closeModal(modal, {
              onModalClosed: () => {
                modal.remove();
                this.showSwitchDriveGuideChoiceModal();
              },
            });
            return false;
          },
        },
        {
          text: this.translate('common.close') || 'Close',
          type: 'secondary',
        },
      ],
    });
  }

  async browseEmulatorPath() {
    if (!window.electronAPI || !window.electronAPI.selectEmulatorFile) {
      console.error('Electron API not available');
      return;
    }

    const file = await window.electronAPI.selectEmulatorFile();
    if (file) {
      this.settings.emulatorPath = file;
      this.saveSettings();
      this.updateEmulatorPathUI();
    }
  }

  async browseGamePath() {
    if (!window.electronAPI || !window.electronAPI.selectGameFile) {
      console.error('Electron API not available');
      return;
    }

    const file = await window.electronAPI.selectGameFile();
    if (file) {
      this.settings.gamePath = file;
      this.saveSettings();
      this.updateGamePathUI();
    }
  }

  updateModsFolderUI() {
    const input = document.querySelector<HTMLInputElement>('#mods-folder-path');
    if (input && this.settings.modsPath) {
      input.value = this.settings.modsPath;
    }
    this.maybeWarnForCurrentModsPath();
  }

  updatePluginsFolderUI() {
    const input = document.querySelector<HTMLInputElement>(
      '#plugins-folder-path',
    );
    if (input && this.settings.pluginsPath) {
      input.value = this.settings.pluginsPath;
    }
  }

  updateLanguageTypeUI() {
    const languageTypeSelect = document.querySelector<HTMLElement>(
      '#language-type-select',
    );
    if (languageTypeSelect && window.i18n) {
      const selectedValue =
        languageTypeSelect.querySelector<HTMLElement>('.selected-value');
      const options = languageTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentLocale = window.i18n.getCurrentLocale() || 'en';

      options.forEach((option) => {
        if (option.dataset.value === currentLocale) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  updateEmulatorTypeUI() {
    const emulatorTypeSelect = document.querySelector<HTMLElement>(
      '#emulator-type-select',
    );
    if (emulatorTypeSelect) {
      const selectedValue =
        emulatorTypeSelect.querySelector<HTMLElement>('.selected-value');
      const options = emulatorTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentType = this.normalizeEmulatorType(
        this.settings.emulatorType,
      );
      this.settings.emulatorType = currentType;

      options.forEach((option) => {
        if (option.dataset.value === currentType) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
            const i18nKey =
              option.querySelector<HTMLElement>('span')!.dataset.i18n;
            if (i18nKey) {
              selectedValue.dataset.i18n = i18nKey;
            }
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  updateEmulatorPathUI() {
    const input = document.querySelector<HTMLInputElement>('#emulator-path');
    if (input && this.settings.emulatorPath) {
      input.value = this.settings.emulatorPath;
    }
  }

  updateGamePathUI() {
    const input = document.querySelector<HTMLInputElement>('#game-path');
    if (input && this.settings.gamePath) {
      input.value = this.settings.gamePath;
    }
  }

  updateEmulatorFullscreenUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#emulator-fullscreen-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.emulatorFullscreen || false;
    }
  }

  updateFullscreenVisibility() {
    const fullscreenToggle = document.querySelector<HTMLElement>(
      '#emulator-fullscreen-enabled',
    );
    if (!fullscreenToggle) return;

    const fullscreenSection = fullscreenToggle.closest(
      '.settings-section',
    ) as HTMLElement;
    if (fullscreenSection) {
      if (
        this.normalizeEmulatorType(this.settings.emulatorType) === 'ryujinx'
      ) {
        fullscreenSection.style.display = 'none';
      } else {
        fullscreenSection.style.display = 'block';
      }
    }
  }

  updateSwitchSettingsUI() {
    const switchIpInput =
      document.querySelector<HTMLInputElement>('#switch-ip');
    if (switchIpInput && this.settings.switchIp) {
      switchIpInput.value = this.settings.switchIp;
    }

    const switchPortInput =
      document.querySelector<HTMLInputElement>('#switch-port');
    if (switchPortInput && this.settings.switchPort) {
      switchPortInput.value = this.settings.switchPort;
    }

    const switchFtpUserInput =
      document.querySelector<HTMLInputElement>('#switch-ftp-user');
    if (switchFtpUserInput) {
      switchFtpUserInput.value = this.settings.switchFtpUser || '';
    }

    const switchFtpPasswordInput = document.querySelector<HTMLInputElement>(
      '#switch-ftp-password',
    );
    if (switchFtpPasswordInput) {
      switchFtpPasswordInput.value = this.settings.switchFtpPassword || '';
    }

    const switchFtpPathInput =
      document.querySelector<HTMLInputElement>('#switch-ftp-path');
    if (switchFtpPathInput) {
      switchFtpPathInput.value =
        this.settings.switchFtpModsPath || this.settings.switchFtpPath || '';
    }

    const switchFtpPluginsPathInput = document.querySelector<HTMLInputElement>(
      '#switch-ftp-plugins-path',
    );
    if (switchFtpPluginsPathInput) {
      switchFtpPluginsPathInput.value =
        this.settings.switchFtpPluginsPath || '';
    }
  }

  updateSwitchTransferMethodUI() {
    const transferMethod = this.settings.switchTransferMethod || 'none';
    const transferMethodSelect = document.querySelector<HTMLElement>(
      '#switch-transfer-method-select',
    );
    const ftpSettings = document.querySelector<HTMLElement>(
      '#switch-ftp-settings',
    );
    const driveSettings = document.querySelector<HTMLElement>(
      '#switch-drive-settings',
    );

    if (transferMethodSelect) {
      const selectedValue =
        transferMethodSelect.querySelector<HTMLElement>('.selected-value');
      const options = transferMethodSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );

      let foundOption = false;
      options.forEach((option) => {
        if (option.dataset.value === transferMethod) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
          foundOption = true;
        } else {
          option.classList.remove('active');
        }
      });

      if (!foundOption && selectedValue && transferMethod === 'none') {
        selectedValue.textContent = 'Select method...';
      }
    }

    if (ftpSettings) {
      ftpSettings.style.display = transferMethod === 'ftp' ? 'block' : 'none';
    }
    if (driveSettings) {
      driveSettings.style.display =
        transferMethod === 'drive' ? 'block' : 'none';
    }

    if (transferMethod === 'drive') {
      this.updateSwitchDriveLetterUI();
    }
  }

  showSwitchDriveGuideChoiceModal() {
    if (!window.modalManager?.showCustomModal) {
      this.showToast(
        this.translate('settings.switchDriveGuideUnavailable'),
        'error',
      );
      return;
    }

    const body = document.createElement('div');
    body.className = 'switch-drive-guide-choice';
    body.innerHTML = `
      <button type="button" class="switch-drive-guide-option" id="switch-drive-guide-hekate">
        <i class="bi bi-usb-symbol"></i>
        <span>
          <strong>${this.translate('settings.switchDriveGuideHekate')}</strong>
          <small>${this.translate('settings.switchDriveGuideHekateDesc')}</small>
        </span>
      </button>
      <button type="button" class="switch-drive-guide-option switch-drive-guide-option-disabled" id="switch-drive-guide-homebrew">
        <i class="bi bi-hourglass-split"></i>
        <span>
          <strong>${this.translate('settings.switchDriveGuideHomebrew')}</strong>
          <small>${this.translate('settings.switchDriveGuideHomebrewDesc')}</small>
        </span>
      </button>
    `;

    const modal = window.modalManager.showCustomModal({
      id: 'switch-drive-guide-choice-modal',
      title: this.translate('settings.switchDriveGuideTitle'),
      body,
      size: 'normal',
      buttons: [
        {
          text: this.translate('common.cancel') || 'Cancel',
          type: 'secondary',
        },
      ],
    });

    modal
      .querySelector<HTMLElement>('#switch-drive-guide-hekate')
      ?.addEventListener('click', () => {
        window.modalManager.closeModal(modal, {
          onModalClosed: () => {
            modal.remove();
            this.showSwitchDriveHekateGuideModal();
          },
        });
      });

    modal
      .querySelector<HTMLElement>('#switch-drive-guide-homebrew')
      ?.addEventListener('click', () => {
        this.showToast(
          this.translate('settings.switchDriveGuideHomebrewPending'),
          'info',
        );
      });
  }

  showSwitchDriveHekateGuideModal() {
    if (!window.modalManager?.showCustomModal) {
      this.showToast(
        this.translate('settings.switchDriveGuideUnavailable'),
        'error',
      );
      return;
    }

    const body = document.createElement('div');
    body.className = 'switch-drive-hekate-guide';
    body.innerHTML = `
      <div id="switch-drive-guide-lottie" class="switch-drive-guide-lottie"></div>
      <p class="switch-drive-guide-status" id="switch-drive-guide-status">
        ${this.translate('settings.switchDriveGuidePlaying')}
      </p>
    `;

    const modal = window.modalManager.showCustomModal({
      id: 'switch-drive-hekate-guide-modal',
      title: this.translate('settings.switchDriveGuideHekateTitle'),
      body,
      size: 'large',
      clickOverlayToClose: false,
      buttons: [
        {
          id: 'switch-drive-guide-next',
          text: this.translate('settings.switchDriveGuideNext'),
          type: 'primary',
          closeOnClick: false,
          onClick: async (_e, modalElement) => {
            await this.completeSwitchDriveGuide(modalElement);
          },
        },
        {
          text: this.translate('common.cancel') || 'Cancel',
          type: 'secondary',
        },
      ],
      onClose: () => {
        const anim = (modal as any).__switchDriveGuideAnimation;
        if (anim?.destroy) {
          anim.destroy();
        }
      },
    });

    const nextBtn = modal.querySelector<HTMLButtonElement>(
      '#switch-drive-guide-next',
    );
    const status = modal.querySelector<HTMLElement>(
      '#switch-drive-guide-status',
    );
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.classList.add('disabled');
    }

    const lottieContainer = modal.querySelector<HTMLElement>(
      '#switch-drive-guide-lottie',
    );
    if (lottieContainer && window.lottie) {
      const anim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '../images/guided_recomended.json',
      });
      (modal as any).__switchDriveGuideAnimation = anim;

      const unlockNext = () => {
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.classList.remove('disabled');
        }
        if (status) {
          status.textContent = this.translate('settings.switchDriveGuideReady');
        }
        anim.removeEventListener?.('loopComplete', unlockNext);
      };

      anim.addEventListener?.('loopComplete', unlockNext);
    } else {
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.remove('disabled');
      }
      if (status) {
        status.textContent = this.translate('settings.switchDriveGuideReady');
      }
    }
  }

  async completeSwitchDriveGuide(modal: HTMLElement) {
    const nextBtn = modal.querySelector<HTMLButtonElement>(
      '#switch-drive-guide-next',
    );
    const status = modal.querySelector<HTMLElement>(
      '#switch-drive-guide-status',
    );

    if (nextBtn?.disabled) {
      return;
    }

    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.classList.add('disabled');
      nextBtn.textContent = this.translate(
        'settings.switchDriveGuideDetecting',
      );
    }
    if (status) {
      status.textContent = this.translate('settings.switchDriveGuideDetecting');
    }

    this.settings.switchTransferMethod = 'drive';
    this.updateSwitchTransferMethodUI();
    await this.saveSettings();
    window.modalManager.closeModal(modal, {
      onModalClosed: () => {
        modal.remove();
        this.showSwitchUsbDeviceModal();
      },
    });
  }

  async getAvailableSwitchDrives() {
    if (!window.electronAPI?.getAvailableDrives) {
      throw new Error('Drive detection is not available.');
    }

    const result = await window.electronAPI.getAvailableDrives();
    if (!result?.success || !Array.isArray(result.drives)) {
      throw new Error('Drive detection failed.');
    }

    return result.drives;
  }

  getSwitchDriveDisplayText(drive) {
    if (drive.path && drive.path.includes(':\\')) {
      return `${drive.letter}: (${drive.label || 'Unknown'})`;
    }

    if (drive.path && drive.path.startsWith('/')) {
      return `${drive.path} (${drive.label || 'Unknown'})`;
    }

    return `${drive.letter} (${drive.label || 'Unknown'})`;
  }

  getSwitchDriveIdentifier(drive) {
    if (drive.path && drive.path.startsWith('/')) {
      return drive.path;
    }

    return drive.letter;
  }

  async showSwitchUsbDeviceModal() {
    if (!window.modalManager?.showCustomModal) {
      this.showToast(
        this.translate('settings.switchDriveGuideUnavailable'),
        'error',
      );
      return;
    }

    const body = document.createElement('div');
    body.className = 'switch-usb-device-picker';
    body.innerHTML = `
      <p class="switch-usb-device-picker-hint">
        ${this.translate('settings.switchUsbDevicePickerHint')}
      </p>
      <div class="switch-usb-device-list" id="switch-usb-device-list">
        <div class="switch-usb-device-state">
          <i class="bi bi-arrow-clockwise"></i>
          <span>${this.translate('settings.switchUsbDeviceSearching')}</span>
        </div>
      </div>
    `;

    const modal = window.modalManager.showCustomModal({
      id: 'switch-usb-device-picker-modal',
      title: this.translate('settings.switchUsbDevicePickerTitle'),
      body,
      size: 'normal',
      clickOverlayToClose: false,
      buttons: [
        {
          id: 'switch-usb-device-refresh',
          text: this.translate('settings.switchUsbDeviceRefresh'),
          type: 'secondary',
          closeOnClick: false,
          onClick: async () => {
            await this.renderSwitchUsbDeviceOptions(modal);
          },
        },
        {
          text: this.translate('common.cancel') || 'Cancel',
          type: 'secondary',
        },
      ],
    });

    await this.renderSwitchUsbDeviceOptions(modal);
  }

  async renderSwitchUsbDeviceOptions(modal: HTMLElement) {
    const list = modal.querySelector<HTMLElement>('#switch-usb-device-list');
    if (!list) return;

    list.innerHTML = `
      <div class="switch-usb-device-state">
        <i class="bi bi-arrow-clockwise"></i>
        <span>${this.translate('settings.switchUsbDeviceSearching')}</span>
      </div>
    `;

    try {
      this.drivesLoaded = false;
      await this.loadAvailableDrives(true);
      const drives = await this.getAvailableSwitchDrives();

      if (drives.length === 0) {
        list.innerHTML = `
          <div class="switch-usb-device-state switch-usb-device-state-warning">
            <i class="bi bi-exclamation-triangle"></i>
            <span>${this.translate('settings.switchUsbDeviceNone')}</span>
          </div>
        `;
        return;
      }

      list.innerHTML = '';

      drives.forEach((drive) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'switch-usb-device-option';
        const displayText = this.getSwitchDriveDisplayText(drive);
        const identifier = this.getSwitchDriveIdentifier(drive);
        const isSelected = this.settings.switchDriveLetter === identifier;
        if (isSelected) {
          option.classList.add('active');
        }

        option.innerHTML = `
          <i class="bi bi-usb-drive"></i>
          <span>
            <strong>${displayText}</strong>
            <small>${drive.type || this.translate('settings.switchUsbDeviceTypeUnknown')}</small>
          </span>
          <i class="bi bi-check-lg switch-usb-device-check"></i>
        `;

        option.addEventListener('click', async () => {
          this.settings.switchDriveLetter = identifier;
          this.settings.switchTransferMethod = 'drive';
          this.applyHardwareLibraryModePaths();
          this.updateSwitchTransferMethodUI();
          this.updateSwitchDriveLetterUI();
          await this.saveSettings();
          this.showToast(
            this.translate('settings.switchDriveGuideDriveSelected'),
            'success',
          );
          window.modalManager.closeModal(modal, {
            onModalClosed: () => modal.remove(),
          });
        });

        list.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to render USB device picker:', error);
      list.innerHTML = `
        <div class="switch-usb-device-state switch-usb-device-state-warning">
          <i class="bi bi-exclamation-triangle"></i>
          <span>${this.translate('settings.switchUsbDeviceError')}</span>
        </div>
      `;
    }
  }

  async loadAvailableDrives(forceReload = false) {
    if (!window.electronAPI || !window.electronAPI.getAvailableDrives) {
      console.error('Electron API not available');
      return;
    }

    const optionsContainer = document.querySelector<HTMLElement>(
      '#switch-drive-letter-options',
    );
    const selectedValue = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select .selected-value',
    );

    if (!optionsContainer) return;

    if (forceReload || !this.drivesLoaded) {
      optionsContainer.innerHTML =
        '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span><i class="bi bi-arrow-clockwise" style="animation: spin 1s linear infinite;"></i> Searching for drives...</span></div>';
      if (selectedValue && forceReload) {
        const currentText = selectedValue.textContent;
        if (!currentText.includes('Searching')) {
          selectedValue.textContent = 'Searching for drives...';
        }
      }
    }

    try {
      const result = await window.electronAPI.getAvailableDrives();
      if (result.success && result.drives) {
        optionsContainer.innerHTML = '';

        if (result.drives.length === 0) {
          optionsContainer.innerHTML =
            '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>No drives found</span></div>';
          if (selectedValue && forceReload) {
            selectedValue.textContent = 'No drives found';
          }
          this.drivesLoaded = true;
          return;
        }

        result.drives.forEach((drive) => {
          const option = document.createElement('div');
          option.className = 'custom-select-option';
          option.dataset.value = drive.letter;
          if (drive.path) {
            option.dataset.path = drive.path;
          }

          let displayText;
          if (drive.path && drive.path.includes(':\\')) {
            displayText = `${drive.letter}: (${drive.label || 'Unknown'})`;
          } else if (drive.path && drive.path.startsWith('/')) {
            displayText = `${drive.path} (${drive.label || 'Unknown'})`;
          } else {
            displayText = `${drive.letter} (${drive.label || 'Unknown'})`;
          }

          option.innerHTML = `<span>${displayText}</span>`;

          option.addEventListener('click', () => {
            const selectedValue = document.querySelector<HTMLElement>(
              '#switch-drive-letter-select .selected-value',
            );
            if (selectedValue) {
              selectedValue.textContent = displayText;
            }

            optionsContainer
              .querySelectorAll<HTMLElement>('.custom-select-option')
              .forEach((opt) => {
                opt.classList.remove('active');
              });
            option.classList.add('active');

            document
              .querySelector<HTMLElement>('#switch-drive-letter-select')!
              .classList.remove('open');

            if (drive.path && drive.path.startsWith('/')) {
              this.settings.switchDriveLetter = drive.path;
            } else {
              this.settings.switchDriveLetter = drive.letter;
            }
            this.applyHardwareLibraryModePaths();
            this.saveSettings();
          });

          optionsContainer.appendChild(option);
        });

        const refreshBtn = document.createElement('div');
        refreshBtn.className = 'custom-select-option';
        refreshBtn.style.cssText =
          'border-top: 1px solid var(--border-color); margin-top: 4px; padding-top: 8px; cursor: pointer;';
        refreshBtn.innerHTML =
          '<span><i class="bi bi-arrow-clockwise"></i> Refresh drives</span>';
        refreshBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.drivesLoaded = false;
          await this.loadAvailableDrives(true);
          this.drivesLoaded = true;
        });
        optionsContainer.appendChild(refreshBtn);

        this.updateSwitchDriveLetterUI();
        this.drivesLoaded = true;
      } else {
        optionsContainer.innerHTML =
          '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>Failed to load drives</span></div>';
        if (selectedValue && forceReload) {
          selectedValue.textContent = 'Failed to load drives';
        }
        this.drivesLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load drives:', error);
      if (optionsContainer) {
        optionsContainer.innerHTML =
          '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>Error loading drives</span></div>';
      }
      if (selectedValue && forceReload) {
        selectedValue.textContent = 'Error loading drives';
      }
      this.drivesLoaded = true;
    }
  }

  updateSwitchDriveLetterUI() {
    const driveIdentifier = this.settings.switchDriveLetter;
    if (!driveIdentifier) return;

    const driveLetterSelect = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select',
    );
    if (driveLetterSelect) {
      const selectedValue =
        driveLetterSelect.querySelector<HTMLElement>('.selected-value');
      const optionsContainer = document.querySelector<HTMLElement>(
        '#switch-drive-letter-options',
      );

      if (optionsContainer) {
        const options = optionsContainer.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );

        options.forEach((option) => {
          const optionValue = option.dataset.value;
          const optionPath = option.dataset.path;
          let matches = false;

          if (
            driveIdentifier.includes(':\\') ||
            driveIdentifier.startsWith('/')
          ) {
            matches = optionPath === driveIdentifier;
          } else {
            matches = optionValue === driveIdentifier;
          }

          if (matches) {
            option.classList.add('active');
            if (selectedValue) {
              selectedValue.textContent =
                option.querySelector<HTMLElement>('span')!.textContent;
            }
          } else {
            option.classList.remove('active');
          }
        });
      } else if (selectedValue) {
        if (
          driveIdentifier.includes(':\\') ||
          driveIdentifier.startsWith('/')
        ) {
          selectedValue.textContent = driveIdentifier;
        } else {
          selectedValue.textContent = `${driveIdentifier}:`;
        }
      }
    }
  }

  updateConflictDetectionUI() {
    const conflictDetectionCheckbox = document.querySelector<HTMLInputElement>(
      '#conflict-detection-enabled',
    );
    if (conflictDetectionCheckbox) {
      conflictDetectionCheckbox.checked =
        this.settings.conflictDetectionEnabled !== false;
    }
  }

  updateNroLimitCheckUI() {
    const nroLimitCheckCheckbox = document.querySelector<HTMLInputElement>(
      '#nro-limit-check-enabled',
    );
    if (nroLimitCheckCheckbox) {
      nroLimitCheckCheckbox.checked =
        this.settings.nroLimitCheckEnabled !== false;
    }
  }

  updateLibraryPathValidationUI() {
    const libraryPathValidationCheckbox =
      document.querySelector<HTMLInputElement>(
        '#library-path-validation-enabled',
      );
    if (libraryPathValidationCheckbox) {
      libraryPathValidationCheckbox.checked =
        this.settings.libraryPathValidationEnabled !== false;
    }
  }

  updateAutoCheckPluginUpdatesUI() {
    const autoCheckPluginUpdatesCheckbox =
      document.querySelector<HTMLInputElement>(
        '#auto-check-plugin-updates-enabled',
      );
    if (autoCheckPluginUpdatesCheckbox) {
      autoCheckPluginUpdatesCheckbox.checked =
        this.settings.autoCheckPluginUpdates || false;
    }
  }

  async updateAutoCheckAppUpdatesUI() {
    const autoCheckAppUpdatesCheckbox =
      document.querySelector<HTMLInputElement>(
        '#auto-check-app-updates-enabled',
      );
    if (
      autoCheckAppUpdatesCheckbox &&
      window.electronAPI &&
      window.electronAPI.getAutoCheckEnabled
    ) {
      try {
        autoCheckAppUpdatesCheckbox.checked =
          await window.electronAPI.getAutoCheckEnabled();
      } catch (error) {
        console.error('Failed to get app update auto-check setting:', error);
        autoCheckAppUpdatesCheckbox.checked = true;
      }
    }
  }

  updateStartupSplashUI() {
    const startupSplashCheckbox = document.querySelector<HTMLInputElement>(
      '#startup-splash-enabled',
    );
    if (startupSplashCheckbox) {
      startupSplashCheckbox.checked =
        this.settings.startupSplashEnabled !== false;
    }
  }

  updateStartupSplashSoundUI() {
    const startupSplashSoundCheckbox = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-enabled',
    );
    if (startupSplashSoundCheckbox) {
      const splashEnabled = this.settings.startupSplashEnabled !== false;
      startupSplashSoundCheckbox.checked =
        splashEnabled && this.settings.startupSplashSoundEnabled !== false;
      startupSplashSoundCheckbox.disabled = !splashEnabled;
      startupSplashSoundCheckbox
        .closest('.settings-switch')
        ?.classList.toggle('disabled', !splashEnabled);
    }

    const splashSoundLabel = document.querySelector<HTMLElement>(
      '#startup-splash-sound-label',
    );
    if (splashSoundLabel) {
      splashSoundLabel.style.opacity =
        this.settings.startupSplashEnabled !== false ? '1' : '0.55';
    }

    const splashSoundPathInput = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-path',
    );
    if (splashSoundPathInput) {
      const defaultSoundLabel =
        window.i18n?.t?.('settings.startupSplashSoundPathPlaceholder') ||
        'Default FightPlanner sound';
      splashSoundPathInput.value =
        this.settings.startupSplashSoundPath || defaultSoundLabel;
      splashSoundPathInput.disabled =
        this.settings.startupSplashEnabled === false;
    }

    const browseStartupSplashSound = document.querySelector<HTMLButtonElement>(
      '#browse-startup-splash-sound',
    );
    if (browseStartupSplashSound) {
      browseStartupSplashSound.disabled =
        this.settings.startupSplashEnabled === false;
    }

    const resetStartupSplashSound = document.querySelector<HTMLButtonElement>(
      '#reset-startup-splash-sound',
    );
    if (resetStartupSplashSound) {
      resetStartupSplashSound.disabled =
        this.settings.startupSplashEnabled === false ||
        !this.settings.startupSplashSoundPath;
    }
  }

  updateAppSoundsUI() {
    const defaultSoundLabel =
      window.i18n?.t?.('settings.defaultSoundPath') || 'Default sound';
    const appSoundPaths = this.settings.appSoundPaths || {};
    const appSoundEnabled = this.settings.appSoundEnabled || {};

    this.getAppSoundNames().forEach((soundName) => {
      const enabledInput = document.querySelector<HTMLInputElement>(
        `#app-sound-enabled-${soundName}`,
      );
      if (enabledInput) {
        enabledInput.checked = appSoundEnabled[soundName] !== false;
      }

      const pathInput = document.querySelector<HTMLInputElement>(
        `#app-sound-path-${soundName}`,
      );
      if (pathInput) {
        pathInput.value = appSoundPaths[soundName] || defaultSoundLabel;
      }

      const resetButton = document.querySelector<HTMLButtonElement>(
        `.app-sound-reset[data-sound-name="${soundName}"]`,
      );
      if (resetButton) {
        resetButton.disabled = !appSoundPaths[soundName];
      }
    });
  }

  applyAppSoundSettings() {
    if (!window.appSoundManager) {
      return;
    }

    const appSoundPaths = this.settings.appSoundPaths || {};
    const appSoundEnabled = this.settings.appSoundEnabled || {};
    this.getAppSoundNames().forEach((soundName) => {
      window.appSoundManager.setCustomSound(
        soundName as any,
        appSoundPaths[soundName] || null,
      );
      window.appSoundManager.setSoundEnabled(
        soundName as any,
        appSoundEnabled[soundName] !== false,
      );
    });
  }

  getAppSoundNames() {
    return [
      'notification',
      'error',
      'complete',
      'downloading',
      'loading',
      'switchTab',
    ];
  }

  async updateAppVersionUI() {
    const appVersionEl = document.querySelector<HTMLElement>('#app-version');
    if (
      appVersionEl &&
      window.electronAPI &&
      window.electronAPI.getAppVersion
    ) {
      try {
        appVersionEl.textContent = (
          await window.electronAPI.getAppVersion()
        ).version;
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    }
  }

  async updateChannelUI() {
    const updateChannelSelect = document.querySelector<HTMLElement>(
      '#update-channel-select',
    );
    if (
      updateChannelSelect &&
      window.electronAPI
    ) {
      try {
        const channel = 'public-beta';
        const selectedValue =
          updateChannelSelect.querySelector<HTMLElement>('.selected-value');
        const options = updateChannelSelect.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );

        options.forEach((option) => {
          if (option.dataset.value === channel) {
            option.classList.add('active');
            if (selectedValue) {
              selectedValue.textContent =
                option.querySelector<HTMLElement>('span')!.textContent;
            }
          } else {
            option.classList.remove('active');
          }
        });
      } catch (error) {
        console.error('Failed to get update channel:', error);
      }
    }
  }

  updateThemeUI() {
    const themeSelect = document.querySelector<HTMLElement>('#theme-select');
    if (themeSelect) {
      const selectedValue =
        themeSelect.querySelector<HTMLElement>('.selected-value');
      const options = themeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentTheme = this.settings.theme || 'dark';

      options.forEach((option) => {
        if (option.dataset.value === currentTheme) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  updateAppRunModeUI() {
    const appRunModeSelect = document.querySelector<HTMLElement>(
      '#app-run-mode-select',
    );
    if (!appRunModeSelect) {
      return;
    }

    const selectedValue =
      appRunModeSelect.querySelector<HTMLElement>('.selected-value');
    const options = appRunModeSelect.querySelectorAll<HTMLElement>(
      '.custom-select-option',
    );
    const currentMode = this.normalizeAppRunMode(this.settings.appRunMode);
    this.settings.appRunMode = currentMode;

    options.forEach((option) => {
      const isActive = option.dataset.value === currentMode;
      option.classList.toggle('active', isActive);

      if (isActive && selectedValue) {
        const label = option.querySelector<HTMLElement>('span');
        selectedValue.textContent = label?.textContent || currentMode;
        if (label?.dataset.i18n) {
          selectedValue.dataset.i18n = label.dataset.i18n;
        }
      }
    });
  }

  updateRunModeTabsVisibility() {
    const currentMode = this.getAppRunMode();
    const emulatorButton = document.querySelector<HTMLElement>(
      '[data-settings-tab="emulator"]',
    );
    const switchButton = document.querySelector<HTMLElement>(
      '[data-settings-tab="switch"]',
    );
    const emulatorContent =
      document.querySelector<HTMLElement>('#settings-emulator');
    const switchContent =
      document.querySelector<HTMLElement>('#settings-switch');

    const showEmulator = currentMode === 'emulator';
    const showSwitch = currentMode === 'hardware';

    if (emulatorButton) {
      emulatorButton.style.display = showEmulator ? '' : 'none';
    }
    if (switchButton) {
      switchButton.style.display = showSwitch ? '' : 'none';
    }
    if (emulatorContent && !showEmulator) {
      emulatorContent.classList.remove('active');
    }
    if (switchContent && !showSwitch) {
      switchContent.classList.remove('active');
    }

    const activeContent = document.querySelector<HTMLElement>(
      '.settings-tab-content.active',
    );
    if (!activeContent) {
      this.switchSettingsTab('general');
    }
  }

  updateHardwareLibraryModeUI() {
    const hardwareLibraryModeSelect = document.querySelector<HTMLElement>(
      '#hardware-library-mode-select',
    );
    if (!hardwareLibraryModeSelect) {
      return;
    }

    const selectedValue =
      hardwareLibraryModeSelect.querySelector<HTMLElement>('.selected-value');
    const options = hardwareLibraryModeSelect.querySelectorAll<HTMLElement>(
      '.custom-select-option',
    );
    const currentMode = this.normalizeHardwareLibraryMode(
      this.settings.hardwareLibraryMode,
    );
    this.settings.hardwareLibraryMode = currentMode;

    options.forEach((option) => {
      const isActive = option.dataset.value === currentMode;
      option.classList.toggle('active', isActive);

      if (isActive && selectedValue) {
        const label = option.querySelector<HTMLElement>('span');
        selectedValue.textContent = label?.textContent || currentMode;
        if (label?.dataset.i18n) {
          selectedValue.dataset.i18n = label.dataset.i18n;
        }
      }
    });
  }

  updateHardwareLibraryModeVisibility() {
    const section = document.querySelector<HTMLElement>(
      '#hardware-library-mode-section',
    );
    if (!section) {
      return;
    }

    section.style.display = this.getAppRunMode() === 'hardware' ? '' : 'none';
  }

  getSwitchDriveRoot() {
    const driveIdentifier = this.settings.switchDriveLetter;
    if (!driveIdentifier || typeof driveIdentifier !== 'string') {
      return null;
    }

    if (driveIdentifier.includes(':\\') || driveIdentifier.startsWith('/')) {
      return driveIdentifier.replace(/[\\/]+$/, '');
    }

    if (/^[A-Z]$/i.test(driveIdentifier.trim())) {
      return `${driveIdentifier.replace(':', '')}:\\`;
    }

    return driveIdentifier.replace(/[\\/]+$/, '');
  }

  async resolveStoredSwitchDrivePath(driveIdentifier) {
    if (!driveIdentifier || typeof driveIdentifier !== 'string') {
      return driveIdentifier || null;
    }

    if (
      driveIdentifier.startsWith('/') ||
      driveIdentifier.includes(':\\') ||
      !window.electronAPI?.checkPathAccessible
    ) {
      return driveIdentifier;
    }

    try {
      const result =
        await window.electronAPI.checkPathAccessible(driveIdentifier);
      if (
        result?.success &&
        result.accessible === true &&
        typeof result.resolvedPath === 'string' &&
        result.resolvedPath
      ) {
        return result.resolvedPath;
      }
    } catch (error) {
      console.warn('[SettingsManager] Failed to resolve switch drive:', error);
    }

    return driveIdentifier.replace(/[\\/]+$/, '');
  }

  joinSwitchPath(...segments: string[]) {
    const root = this.getSwitchDriveRoot();
    if (!root) {
      return null;
    }

    const normalizedSegments = segments.map((segment) =>
      segment.replace(/^[/\\]+|[/\\]+$/g, ''),
    );

    if (root.endsWith('\\')) {
      return `${root}${normalizedSegments.join('\\')}`;
    }

    return `${root}/${normalizedSegments.join('/')}`;
  }

  getSwitchModsLibraryPath() {
    return this.joinSwitchPath('ultimate', 'mods');
  }

  getSwitchPluginsLibraryPath() {
    return this.joinSwitchPath(
      'ultimate',
      'contents',
      '01006A800016E000',
      'romfs',
      'skyline',
      'plugins',
    );
  }

  isSwitchLibraryPath(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }

    const normalized = value.replace(/\\/g, '/').toLowerCase();
    return (
      normalized.endsWith('/ultimate/mods') ||
      normalized.endsWith(
        '/ultimate/contents/01006a800016e000/romfs/skyline/plugins',
      )
    );
  }

  getSwitchDriveRootFromLibraryPath(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const modsRoot = value.replace(/[\\/]ultimate[\\/]mods[\\/]?$/i, '');
    if (modsRoot !== value) {
      return modsRoot || null;
    }

    const pluginsRoot = value.replace(
      /[\\/]ultimate[\\/]contents[\\/]01006A800016E000[\\/]romfs[\\/]skyline[\\/]plugins[\\/]?$/i,
      '',
    );
    if (pluginsRoot !== value) {
      return pluginsRoot || null;
    }

    return null;
  }

  syncSwitchDriveFromLibraryPaths() {
    const root =
      this.getSwitchDriveRootFromLibraryPath(this.settings.modsPath) ||
      this.getSwitchDriveRootFromLibraryPath(this.settings.pluginsPath);

    if (
      root &&
      (root.startsWith('/') || root.includes(':\\')) &&
      root !== this.settings.switchDriveLetter
    ) {
      this.settings.switchDriveLetter = root;
    }
  }

  isDirectSwitchLibraryMode() {
    return (
      this.getAppRunMode() === 'hardware' &&
      this.normalizeHardwareLibraryMode(this.settings.hardwareLibraryMode) ===
        'direct'
    );
  }

  applyHardwareLibraryModePaths() {
    if (this.isDirectSwitchLibraryMode()) {
      this.syncSwitchDriveFromLibraryPaths();

      const switchModsPath = this.getSwitchModsLibraryPath();
      const switchPluginsPath = this.getSwitchPluginsLibraryPath();

      if (switchModsPath) {
        if (
          this.settings.modsPath &&
          !this.isSwitchLibraryPath(this.settings.modsPath)
        ) {
          this.settings.localModsPath = this.settings.modsPath;
        }
        this.settings.modsPath = switchModsPath;
      } else if (
        this.settings.modsPath &&
        !this.isSwitchLibraryPath(this.settings.modsPath)
      ) {
        this.settings.localModsPath = this.settings.modsPath;
        this.settings.modsPath = null;
      }

      if (switchPluginsPath) {
        if (
          this.settings.pluginsPath &&
          !this.isSwitchLibraryPath(this.settings.pluginsPath)
        ) {
          this.settings.localPluginsPath = this.settings.pluginsPath;
        }
        this.settings.pluginsPath = switchPluginsPath;
      } else if (
        this.settings.pluginsPath &&
        !this.isSwitchLibraryPath(this.settings.pluginsPath)
      ) {
        this.settings.localPluginsPath = this.settings.pluginsPath;
        this.settings.pluginsPath = null;
      }
    } else {
      if (
        this.settings.localModsPath &&
        this.isSwitchLibraryPath(this.settings.modsPath)
      ) {
        this.settings.modsPath = this.settings.localModsPath;
      }

      if (
        this.settings.localPluginsPath &&
        this.isSwitchLibraryPath(this.settings.pluginsPath)
      ) {
        this.settings.pluginsPath = this.settings.localPluginsPath;
      }
    }

    this.updateModsFolderUI();
    this.updatePluginsFolderUI();
  }

  async refreshCurrentLibraryLists() {
    if (this.settings.modsPath) {
      await this.refreshModsListForPath(this.settings.modsPath);
    }

    if (
      this.settings.pluginsPath &&
      window.pluginManager?.loadPluginsFromFolder
    ) {
      await window.pluginManager.loadPluginsFromFolder(
        this.settings.pluginsPath,
      );
    }
  }

  async setTheme(theme) {
    this.settings.theme = theme;
    this.applyTheme(theme);
    await window.electronAPI.store.set('theme', theme);
  }

  applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  applySidebarPrideTabsSetting(enabled: boolean) {
    const isEnabled = enabled !== false;
    document.documentElement.classList.toggle(
      'sidebar-pride-tabs-disabled',
      !isEnabled,
    );
    localStorage.setItem(
      'sidebar_pride_tabs_enabled',
      isEnabled ? 'true' : 'false',
    );
    window.fightPlannerManager?.applySidebarPrideTabsEnabled?.(isEnabled);
  }

  async loadSettings() {
    try {
      const modsPath = await window.electronAPI.store.get('modsPath');
      const pluginsPath = await window.electronAPI.store.get('pluginsPath');
      const localModsPath = await window.electronAPI.store.get('localModsPath');
      const localPluginsPath =
        await window.electronAPI.store.get('localPluginsPath');
      const appRunMode = await window.electronAPI.store.get('appRunMode');
      const hardwareLibraryMode = await window.electronAPI.store.get(
        'hardwareLibraryMode',
      );
      const emulatorType = await window.electronAPI.store.get('emulatorType');
      const emulatorPath = await window.electronAPI.store.get('emulatorPath');
      const gamePath = await window.electronAPI.store.get('gamePath');
      const emulatorFullscreen =
        await window.electronAPI.store.get('emulatorFullscreen');
      const switchIp = await window.electronAPI.store.get('switchIp');
      const switchPort = await window.electronAPI.store.get('switchPort');
      const switchFtpUser = await window.electronAPI.store.get('switchFtpUser');
      const switchFtpPassword =
        await window.electronAPI.store.get('switchFtpPassword');
      const switchFtpPath = await window.electronAPI.store.get('switchFtpPath');
      const switchFtpModsPath =
        await window.electronAPI.store.get('switchFtpModsPath');
      const switchFtpPluginsPath = await window.electronAPI.store.get(
        'switchFtpPluginsPath',
      );
      const switchTransferMethod = await window.electronAPI.store.get(
        'switchTransferMethod',
      );
      const switchDriveLetter = await this.resolveStoredSwitchDrivePath(
        await window.electronAPI.store.get('switchDriveLetter'),
      );
      const conflictDetectionEnabled = await window.electronAPI.store.get(
        'conflictDetectionEnabled',
      );
      const nroLimitCheckEnabled = await window.electronAPI.store.get(
        'nroLimitCheckEnabled',
      );
      const libraryPathValidationEnabled = await window.electronAPI.store.get(
        'libraryPathValidationEnabled',
      );
      const ignoredConflictPaths = await window.electronAPI.store.get(
        'ignoredConflictPaths',
      );
      const autoCheckPluginUpdates = await window.electronAPI.store.get(
        'autoCheckPluginUpdates',
      );
      const pluginUpdateIntroShown = await window.electronAPI.store.get(
        'pluginUpdateIntroShown',
      );
      const theme = await window.electronAPI.store.get('theme');
      const sidebarPrideTabsEnabled = await window.electronAPI.store.get(
        'sidebarPrideTabsEnabled',
      );
      const autoDisableNewMods =
        await window.electronAPI.store.get('autoDisableNewMods');
      const disableAllModsOnDownload = await window.electronAPI.store.get(
        'disableAllModsOnDownload',
      );
      const startupSplashEnabled = await window.electronAPI.store.get(
        'startupSplashEnabled',
      );
      const startupSplashSoundEnabled = await window.electronAPI.store.get(
        'startupSplashSoundEnabled',
      );
      const startupSplashSoundPath = await window.electronAPI.store.get(
        'startupSplashSoundPath',
      );
      const appSoundPaths = await window.electronAPI.store.get('appSoundPaths');
      const appSoundEnabled =
        await window.electronAPI.store.get('appSoundEnabled');
      const normalizedSwitchTransferMethod =
        this.normalizeSwitchTransferMethod(switchTransferMethod);
      return {
        modsPath: modsPath || null,
        pluginsPath: pluginsPath || null,
        localModsPath: localModsPath || null,
        localPluginsPath: localPluginsPath || null,
        appRunMode: appRunMode
          ? this.normalizeAppRunMode(appRunMode)
          : normalizedSwitchTransferMethod !== 'none'
            ? 'hardware'
            : 'emulator',
        hardwareLibraryMode:
          this.normalizeHardwareLibraryMode(hardwareLibraryMode),
        emulatorType: this.normalizeEmulatorType(emulatorType),
        emulatorPath: emulatorPath || null,
        gamePath: gamePath || null,
        emulatorFullscreen: emulatorFullscreen || false,
        switchIp: switchIp || null,
        switchPort: switchPort || '5000',
        switchFtpUser: switchFtpUser || null,
        switchFtpPassword: switchFtpPassword || null,
        switchFtpPath: switchFtpPath || null,
        switchFtpModsPath: switchFtpModsPath || switchFtpPath || null,
        switchFtpPluginsPath: switchFtpPluginsPath || null,
        switchTransferMethod: normalizedSwitchTransferMethod,
        switchDriveLetter: switchDriveLetter || null,
        conflictDetectionEnabled: conflictDetectionEnabled !== false,
        nroLimitCheckEnabled: nroLimitCheckEnabled !== false,
        libraryPathValidationEnabled: libraryPathValidationEnabled !== false,
        ignoredConflictPaths: Array.isArray(ignoredConflictPaths)
          ? ignoredConflictPaths
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value.length > 0)
          : [],
        autoCheckPluginUpdates: autoCheckPluginUpdates || false,
        pluginUpdateIntroShown: pluginUpdateIntroShown || false,
        theme: theme || 'dark',
        sidebarPrideTabsEnabled: sidebarPrideTabsEnabled !== false,
        autoDisableNewMods: autoDisableNewMods || false,
        disableAllModsOnDownload: disableAllModsOnDownload || false,
        startupSplashEnabled: startupSplashEnabled !== false,
        startupSplashSoundEnabled: startupSplashSoundEnabled !== false,
        startupSplashSoundPath:
          typeof startupSplashSoundPath === 'string' &&
          startupSplashSoundPath.trim()
            ? startupSplashSoundPath
            : null,
        appSoundPaths:
          appSoundPaths && typeof appSoundPaths === 'object'
            ? appSoundPaths
            : {},
        appSoundEnabled:
          appSoundEnabled && typeof appSoundEnabled === 'object'
            ? appSoundEnabled
            : {},
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return {
        modsPath: null,
        pluginsPath: null,
        localModsPath: null,
        localPluginsPath: null,
        appRunMode: 'emulator',
        hardwareLibraryMode: 'local',
        emulatorType: 'yuzu',
        emulatorPath: null,
        gamePath: null,
        emulatorFullscreen: false,
        switchIp: null,
        switchPort: '5000',
        switchFtpUser: null,
        switchFtpPassword: null,
        switchFtpPath: null,
        switchFtpModsPath: null,
        switchFtpPluginsPath: null,
        switchTransferMethod: 'none',
        switchDriveLetter: null,
        conflictDetectionEnabled: true,
        nroLimitCheckEnabled: true,
        libraryPathValidationEnabled: true,
        ignoredConflictPaths: [],
        autoCheckPluginUpdates: false,
        pluginUpdateIntroShown: false,
        theme: 'dark',
        sidebarPrideTabsEnabled: true,
        autoDisableNewMods: false,
        disableAllModsOnDownload: false,
        startupSplashEnabled: true,
        startupSplashSoundEnabled: true,
        startupSplashSoundPath: null,
        appSoundPaths: {},
        appSoundEnabled: {},
      };
    }
  }

  async saveSettings() {
    if (!this.initialized) {
      console.warn('Skipping settings save before stored settings are loaded');
      return;
    }

    try {
      this.applyHardwareLibraryModePaths();
      await window.electronAPI.store.set('modsPath', this.settings.modsPath);
      await window.electronAPI.store.set(
        'pluginsPath',
        this.settings.pluginsPath,
      );
      await window.electronAPI.store.set(
        'localModsPath',
        this.settings.localModsPath,
      );
      await window.electronAPI.store.set(
        'localPluginsPath',
        this.settings.localPluginsPath,
      );
      await window.electronAPI.store.set(
        'appRunMode',
        this.settings.appRunMode,
      );
      await window.electronAPI.store.set(
        'hardwareLibraryMode',
        this.settings.hardwareLibraryMode,
      );
      await window.electronAPI.store.set(
        'emulatorType',
        this.settings.emulatorType,
      );
      await window.electronAPI.store.set(
        'emulatorPath',
        this.settings.emulatorPath,
      );
      await window.electronAPI.store.set('gamePath', this.settings.gamePath);
      await window.electronAPI.store.set(
        'emulatorFullscreen',
        this.settings.emulatorFullscreen,
      );
      await window.electronAPI.store.set('switchIp', this.settings.switchIp);
      await window.electronAPI.store.set(
        'switchPort',
        this.settings.switchPort,
      );
      await window.electronAPI.store.set(
        'switchFtpUser',
        this.settings.switchFtpUser,
      );
      await window.electronAPI.store.set(
        'switchFtpPassword',
        this.settings.switchFtpPassword,
      );
      await window.electronAPI.store.set(
        'switchFtpPath',
        this.settings.switchFtpModsPath || this.settings.switchFtpPath,
      );
      await window.electronAPI.store.set(
        'switchFtpModsPath',
        this.settings.switchFtpModsPath,
      );
      await window.electronAPI.store.set(
        'switchFtpPluginsPath',
        this.settings.switchFtpPluginsPath,
      );
      await window.electronAPI.store.set(
        'switchTransferMethod',
        this.settings.switchTransferMethod,
      );
      await window.electronAPI.store.set(
        'switchDriveLetter',
        this.settings.switchDriveLetter,
      );
      await window.electronAPI.store.set(
        'conflictDetectionEnabled',
        this.settings.conflictDetectionEnabled,
      );
      await window.electronAPI.store.set(
        'nroLimitCheckEnabled',
        this.settings.nroLimitCheckEnabled,
      );
      await window.electronAPI.store.set(
        'libraryPathValidationEnabled',
        this.settings.libraryPathValidationEnabled !== false,
      );
      await window.electronAPI.store.set(
        'autoCheckPluginUpdates',
        this.settings.autoCheckPluginUpdates,
      );
      await window.electronAPI.store.set(
        'pluginUpdateIntroShown',
        this.settings.pluginUpdateIntroShown,
      );
      await window.electronAPI.store.set('theme', this.settings.theme);
      await window.electronAPI.store.set(
        'sidebarPrideTabsEnabled',
        this.settings.sidebarPrideTabsEnabled !== false,
      );
      await window.electronAPI.store.set(
        'autoDisableNewMods',
        this.settings.autoDisableNewMods,
      );
      await window.electronAPI.store.set(
        'disableAllModsOnDownload',
        this.settings.disableAllModsOnDownload,
      );
      await window.electronAPI.store.set(
        'startupSplashEnabled',
        this.settings.startupSplashEnabled,
      );
      await window.electronAPI.store.set(
        'startupSplashSoundEnabled',
        this.settings.startupSplashSoundEnabled,
      );
      await window.electronAPI.store.set(
        'startupSplashSoundPath',
        this.settings.startupSplashSoundPath,
      );
      await window.electronAPI.store.set(
        'appSoundPaths',
        this.settings.appSoundPaths || {},
      );
      await window.electronAPI.store.set(
        'appSoundEnabled',
        this.settings.appSoundEnabled || {},
      );
      window.hardwareConnectionManager?.refresh?.();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'autoCheckPluginUpdates') {
      this.updateAutoCheckPluginUpdatesUI();
    }
    await this.saveSettings();
  }

  getModsPath() {
    return this.settings.modsPath || null;
  }

  getPluginsPath() {
    return this.settings.pluginsPath || null;
  }

  getAppRunMode() {
    return this.normalizeAppRunMode(this.settings.appRunMode);
  }

  getHardwareLibraryMode() {
    return this.normalizeHardwareLibraryMode(this.settings.hardwareLibraryMode);
  }

  hasModsPath() {
    return !!this.settings.modsPath;
  }

  hasPluginsPath() {
    return !!this.settings.pluginsPath;
  }

  getEmulatorPath() {
    return this.settings.emulatorPath || null;
  }

  getGamePath() {
    return this.settings.gamePath || null;
  }

  hasEmulatorConfig() {
    return !!(this.settings.emulatorPath && this.settings.gamePath);
  }

  getEmulatorType() {
    return this.normalizeEmulatorType(this.settings.emulatorType);
  }

  getEmulatorFullscreen() {
    return this.settings.emulatorFullscreen || false;
  }

  getSwitchIp() {
    return this.settings.switchIp || null;
  }

  getSwitchPort() {
    return this.settings.switchPort || '5000';
  }

  getSwitchFtpUser() {
    return this.settings.switchFtpUser || null;
  }

  getSwitchFtpPassword() {
    return this.settings.switchFtpPassword || null;
  }

  getSwitchFtpPath() {
    return (
      this.settings.switchFtpModsPath || this.settings.switchFtpPath || null
    );
  }

  getSwitchFtpModsPath() {
    return (
      this.settings.switchFtpModsPath || this.settings.switchFtpPath || null
    );
  }

  getSwitchFtpPluginsPath() {
    return this.settings.switchFtpPluginsPath || null;
  }

  hasSwitchConfig() {
    const method = this.settings.switchTransferMethod || 'none';
    if (method === 'none') {
      return false;
    }
    if (method === 'drive') {
      return !!this.settings.switchDriveLetter;
    }
    if (method === 'mtp') {
      return true;
    }
    return !!(this.settings.switchIp && this.settings.switchPort);
  }

  getSwitchTransferMethod() {
    return this.settings.switchTransferMethod || 'none';
  }

  getSwitchDriveLetter() {
    return this.settings.switchDriveLetter || null;
  }

  async setAnimationPreference(preference) {
    try {
      const currentPreference =
        ((await window.electronAPI.store.get('animationPreference')) as
          | string
          | null) || 'full';

      if (currentPreference === preference) {
        this.applyAnimationPreference(preference);
        return;
      }

      await window.electronAPI.store.set('animationPreference', preference);
      this.applyAnimationPreference(preference);
      this.showAnimationPreferenceRestartToast();
    } catch (error) {
      console.error('Failed to save animation preference:', error);
    }
  }

  async loadAnimationPreference() {
    try {
      const preference =
        ((await window.electronAPI.store.get('animationPreference')) as
          | string
          | null) || 'full';

      const animationSelector = document.querySelector<HTMLElement>(
        '#animation-preference',
      );

      if (animationSelector) {
        animationSelector
          .querySelectorAll<HTMLElement>('.animation-option')
          .forEach((option) => {
            if (option.dataset.value === preference) {
              option.classList.add('active');
            } else {
              option.classList.remove('active');
            }
          });
      }

      this.applyAnimationPreference(preference);
    } catch (error) {
      console.error('Failed to load animation preference:', error);
      this.applyAnimationPreference('full');
    }
  }

  applyAnimationPreference(preference: string) {
    document.body.classList.remove('reduced-animations', 'no-animations');

    if (preference === 'reduced') {
      document.body.classList.add('reduced-animations');
    } else if (preference === 'none') {
      document.body.classList.add('no-animations');
      document.body.classList.add('reduced-animations');
    }
  }

  showAnimationPreferenceRestartToast() {
    if (!window.toastManager) {
      return;
    }

    const restartLabel = window.i18n?.t?.('common.restart') || 'Restart';

    window.toastManager.info(
      'toasts.animationPreferenceRestartRequired',
      8000,
      {},
      {
        actionButton: {
          text: restartLabel,
          onClick: async () => {
            try {
              await window.electronAPI?.relaunchApp?.();
            } catch (error) {
              console.error(
                'Failed to relaunch app after animation preference change:',
                error,
              );
              window.toastManager?.error('toasts.failedToRestartApp');
            }
          },
        },
      },
    );
  }

  async loadInstallConfirmSetting() {
    try {
      const installConfirmEnabled = await window.electronAPI.store.get(
        'installConfirmEnabled',
      );
      const installConfirmToggle = document.querySelector<HTMLInputElement>(
        '#install-confirm-enabled',
      );
      if (installConfirmToggle) {
        installConfirmToggle.checked = installConfirmEnabled !== false;
      }
      console.log('Loaded install confirm setting:', installConfirmEnabled);
    } catch (error) {
      console.error('Failed to load install confirm setting:', error);
    }
  }

  async clearTempFiles() {
    if (!window.electronAPI || !window.electronAPI.clearTempFiles) {
      if (window.toastManager) {
        window.toastManager.error('toasts.clearTempFilesNotAvailable');
      }
      return;
    }

    const btn = document.querySelector<HTMLButtonElement>(
      '#clear-temp-files-btn',
    );
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }

    try {
      if (window.toastManager) {
        window.toastManager.info('toasts.clearingTempFiles');
      }

      const result = await window.electronAPI.clearTempFiles();

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.tempFilesCleared');
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToClearTempFiles', 3000, {
            error: result.error,
          });
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToClearTempFiles', 3000, {
          error: error.message,
        });
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }
  }

  async showPendingConfigRestoreToast() {
    try {
      const restoredAt = await window.electronAPI?.store?.get?.(
        'configRestore.completedAt',
      );
      if (!restoredAt) {
        return;
      }

      await window.electronAPI.store.delete('configRestore.completedAt');
      setTimeout(() => {
        this.showToast(
          this.translate('toasts.configBackupRestored'),
          'success',
        );
      }, 800);
    } catch (error) {
      console.error('Failed to show config restore confirmation:', error);
    }
  }

  async exportConfigBackup(button?: HTMLButtonElement) {
    if (!window.electronAPI?.exportConfigBackup) {
      this.showToast(this.translate('toasts.configBackupUnavailable'), 'error');
      return;
    }

    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
    }

    try {
      const result = await window.electronAPI.exportConfigBackup();
      if (result.success) {
        this.showToast(
          this.translate('toasts.configBackupExported'),
          'success',
        );
      } else if (!result.canceled) {
        this.showToast(
          this.translate('toasts.configBackupExportFailed'),
          'error',
        );
      }
    } catch (error) {
      console.error('Failed to export FightPlanner configuration:', error);
      this.showToast(
        this.translate('toasts.configBackupExportFailed'),
        'error',
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
      }
    }
  }

  async restoreConfigBackup(button?: HTMLButtonElement) {
    if (!window.electronAPI?.restoreConfigBackup) {
      this.showToast(this.translate('toasts.configBackupUnavailable'), 'error');
      return;
    }

    const confirmed = confirm(
      this.translate('settings.restoreConfigBackupConfirmMessage'),
    );
    if (!confirmed) {
      return;
    }

    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
    }

    try {
      const result = await window.electronAPI.restoreConfigBackup();
      if (result.success) {
        this.showRestartRequiredOverlay();
      } else if (!result.canceled) {
        this.showToast(
          this.translate('toasts.configBackupRestoreFailed'),
          'error',
        );
      }
    } catch (error) {
      console.error('Failed to restore FightPlanner configuration:', error);
      this.showToast(
        this.translate('toasts.configBackupRestoreFailed'),
        'error',
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
      }
    }
  }

  showRestartRequiredOverlay() {
    document.body.classList.add('app-restart-required');

    let overlay = document.querySelector<HTMLElement>(
      '#config-restore-restart-overlay',
    );
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'config-restore-restart-overlay';
      overlay.className = 'config-restore-restart-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="config-restore-restart-panel">
          <i class="bi bi-arrow-repeat"></i>
          <h2>${this.escapeHtml(this.translate('settings.restartRequiredTitle'))}</h2>
          <p>${this.escapeHtml(this.translate('settings.restartRequiredAfterRestore'))}</p>
          <button type="button" id="config-restore-restart-btn" class="settings-btn-action">
            <i class="bi bi-power"></i>
            <span>${this.escapeHtml(this.translate('settings.restartFightPlanner'))}</span>
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const restartButton = overlay.querySelector<HTMLButtonElement>(
      '#config-restore-restart-btn',
    );
    restartButton?.focus();
    restartButton?.addEventListener('click', async () => {
      try {
        await window.electronAPI?.relaunchApp?.();
      } catch (error) {
        console.error('Failed to restart after config restore:', error);
        window.toastManager?.error('toasts.failedToRestartApp');
      }
    });
  }

  escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  translate(key, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }
    return key;
  }

  showToast(message, type = 'info') {
    if (window.toastManager) {
      if (type === 'success') {
        window.toastManager.success(message);
      } else if (type === 'error') {
        window.toastManager.error(message);
      } else {
        window.toastManager.info(message);
      }
    } else {
      console.log(`[Toast] ${type}: ${message}`);
    }
  }

  showResetStoreConfirmModal() {
    const t = (key: string) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    const confirmed = confirm(t('settings.resetStoreConfirmMessage'));

    if (confirmed) {
      window.electronAPI.store
        .clear()
        .then(() => {
          this.showToast(
            this.translate('toasts.electronStoreReset'),
            'success',
          );
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        })
        .catch((error: Error) => {
          console.error('Failed to reset electron store:', error);
          this.showToast(this.translate('toasts.failedToResetStore'), 'error');
        });
    }
  }
}

if (typeof window !== 'undefined') {
  window.settingsManager = new SettingsManager();
  console.log('Settings Manager initialized');

  if (window.electronAPI && window.electronAPI.store) {
    window.electronAPI.store
      .get('animationPreference')
      .then((preference: string | null) => {
        if (window.settingsManager && preference) {
          window.settingsManager.applyAnimationPreference(preference);
        }
      });

    window.electronAPI.store.get('theme').then((theme) => {
      if (window.settingsManager && theme) {
        window.settingsManager.applyTheme(theme);
      }
    });
  }
}

export { type SettingsManager };
