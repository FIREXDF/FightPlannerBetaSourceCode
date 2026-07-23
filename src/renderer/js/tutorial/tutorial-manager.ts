type TutorialStep = {
  title: string;
  description: string;
  activeDescription?: string;
  target?: string;
  requiredTab?: string;
  requiredVisible?: string;
  requiredHidden?: string;
  requiredDownloadComplete?: boolean;
  requiredInstallClick?: boolean;
  placement?: 'center' | 'right' | 'left' | 'top' | 'bottom';
  kind?: 'intro' | 'language' | 'choice' | 'spotlight';
  choice?: 'install-method';
};


class TutorialManager {
  currentStep: number;
  tutorialShown: boolean;
  overlay: HTMLElement | null;
  highlightedElement: HTMLElement | null;
  pendingInAppAfterSetup: boolean;
  selectedLocale: string;
  installMethod: 'fightplanner' | 'gamebanana' | null;
  guideTimer: number | null;
  stepWasWaiting: boolean;
  stepWaitingReason: string | null;
  installDownloadStarted: boolean;
  installConfirmClicked: boolean;
  steps: TutorialStep[];

  constructor() {
    this.currentStep = 0;
    this.tutorialShown = false;
    this.overlay = null;
    this.highlightedElement = null;
    this.pendingInAppAfterSetup = false;
    this.selectedLocale = 'en';
    this.installMethod = null;
    this.guideTimer = null;
    this.stepWasWaiting = false;
    this.stepWaitingReason = null;
    this.installDownloadStarted = false;
    this.installConfirmClicked = false;
    this.steps = [
      {
        kind: 'intro',
        title: "Let's guide you to FightPlanner",
        description:
          'A quick tour will show what each main part of the app does.',
        placement: 'center',
      },
      {
        kind: 'language',
        title: 'Choose your language',
        description: 'Pick the language you want to use in FightPlanner.',
        placement: 'center',
      },
      {
        kind: 'spotlight',
        title: 'Sidebar',
        description:
          'Use this bar to move between mods, plugins, characters, stages, downloads, settings, and credits.',
        target: '.sidebar',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Mods tab',
        description:
          'Click this tab. It opens the main workspace for enabling, disabling, searching, renaming, slot changes, and uninstalling mods.',
        activeDescription:
          'This is the Mods workspace. Use it to enable, disable, search, rename, change slots, and uninstall mods.',
        requiredTab: 'tools',
        target: '.sidebar-btn[data-tab="tools"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Search and filters',
        description:
          'Use this top bar to search mods, refresh the list, run Smart Rename, switch profiles, sort, and filter by category.',
        requiredTab: 'tools',
        target: '#tab-tools .top-inputs',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Mod list',
        description:
          'Installed mods appear here. Select a mod to see its preview and details. Right-click a mod for actions like rename, slot change, folder open, or uninstall.',
        requiredTab: 'tools',
        target: '#mod-list',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Details and actions',
        description:
          'The right panel shows selected mod details. Bottom buttons add a mod, create an FPP pack, open the mods folder, or launch the emulator.',
        requiredTab: 'tools',
        target: '#right-panel',
        placement: 'left',
      },
      {
        kind: 'spotlight',
        title: 'Plugins tab',
        description:
          'Click this tab. Plugins are managed separately from normal mods, including Skyline plugin files and plugin updates.',
        activeDescription:
          'This is the Plugins tab. Use it for Skyline plugin files, plugin updates, and plugin-specific management.',
        requiredTab: 'plugins',
        target: '.sidebar-btn[data-tab="plugins"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Plugin tools',
        description:
          'Use these controls to search plugins, add a plugin file, refresh, open the plugin folder, check updates, or open the plugin marketplace.',
        requiredTab: 'plugins',
        target: '#tab-plugins .top-inputs',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Plugin list',
        description:
          'Your installed plugins appear here. This area is separate from mods so plugin updates and plugin actions stay clean.',
        requiredTab: 'plugins',
        target: '#plugin-list',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Characters tab',
        description:
          'Click this tab. It groups content by fighter so you can inspect character mods without digging through folders.',
        activeDescription:
          'This is the Characters tab. It groups installed content by fighter so character mods are easier to inspect.',
        requiredTab: 'characters',
        target: '.sidebar-btn[data-tab="characters"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Character controls',
        description:
          'Search fighters, refresh the character view, open moveset mods, or edit the character CSS layout from this toolbar.',
        requiredTab: 'characters',
        target: '.characters-top-bar',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Character grid',
        description:
          'Fighters are shown here. Select a character to inspect related mods and quickly understand what content is installed for that fighter.',
        requiredTab: 'characters',
        target: '#characters-stage',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: 'Stages tab',
        description:
          'Click this tab. It helps you inspect stage slots and stage-related content.',
        activeDescription:
          'This is the Stages tab. Use it to inspect stage slots and stage-related content.',
        requiredTab: 'stages',
        target: '.sidebar-btn[data-tab="stages"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Stage layout actions',
        description:
          'Use this header to choose a layout preset, show hidden stages when available, and apply the stage layout after changes.',
        requiredTab: 'stages',
        target: '.stages-header',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Stage grid',
        description:
          'This grid is the stage layout editor. Drag stage cells after the Random cells, then apply the layout to save the order.',
        requiredTab: 'stages',
        target: '.stages-grid-panel',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: 'Downloads tab',
        description:
          'Click this tab. GameBanana installs and transfers show up here so you can track progress and send mods to your Switch.',
        activeDescription:
          'This is the Downloads tab. GameBanana installs and transfer progress appear here.',
        requiredTab: 'downloads',
        target: '.sidebar-btn[data-tab="downloads"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Download header',
        description:
          'The header shows download count and gives you cleanup controls, like clearing completed downloads.',
        requiredTab: 'downloads',
        target: '.downloads-header',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Download sections',
        description:
          'Active downloads show current progress. Completed downloads show finished installs and transfer history.',
        requiredTab: 'downloads',
        target: '.downloads-content',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: 'Settings tab',
        description:
          'Click this tab. Configure language, run mode, emulator or Switch paths, interface options, logs, and developer tools here.',
        activeDescription:
          'This is the Settings tab. Configure language, run mode, paths, interface options, logs, and developer tools here.',
        requiredTab: 'settings',
        target: '.sidebar-btn[data-tab="settings"]',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Settings sections',
        description:
          'This sidebar splits settings into App, Interface, Audio, Updates, Library, Emulator, Switch, Logs, and Developer options.',
        requiredTab: 'settings',
        target: '.settings-sidebar',
        placement: 'right',
      },
      {
        kind: 'spotlight',
        title: 'Settings content',
        description:
          'Each section opens its own controls on the right. Use Settings when you need paths, visual options, diagnostics, logs, or developer tools.',
        requiredTab: 'settings',
        target: '.settings-content-area',
        placement: 'bottom',
      },
      {
        kind: 'spotlight',
        title: 'Status bar',
        description:
          'The bottom bar shows app state and quick status information while you work.',
        target: '#main-status-bar',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: 'Install confirmation',
        description:
          'This modal confirms the mod download. Click Download & Install to start the install.',
        requiredInstallClick: true,
        target: '#install-confirm-modal .modal-btn-primary',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: '1-click install links',
        description:
          'Open a GameBanana mod in your browser, then click a fightplanner: 1-click install link. FightPlanner will wait here until the install modal appears.',
        requiredVisible: '#install-confirm-modal',
        target: '#install-confirm-modal .modal-btn-primary',
        placement: 'top',
      },
      {
        kind: 'spotlight',
        title: 'Install status',
        description:
          'After confirming, watch this bar and the Downloads tab for download, extraction, install, and transfer status.',
        requiredHidden: '#install-confirm-modal',
        requiredDownloadComplete: true,
        target: '.bottom-bar.expanded .extended-content, #main-status-bar',
        placement: 'top',
      },
      {
        kind: 'intro',
        title: 'Tutorial complete',
        description:
          'You know the main tabs and the install flow now. Enjoy FightPlanner.',
        placement: 'center',
      },
    ];
    this.steps = this.steps.filter(
      (step) =>
        ![
          'Mods tab',
          'Plugins tab',
          'Characters tab',
          'Stages tab',
          'Downloads tab',
          'Settings tab',
        ].includes(step.title),
    );
  }

  async initialize() {
    console.log('Tutorial manager initialized');
    if (window.electronAPI?.onTutorialWindowClosed) {
      window.electronAPI.onTutorialWindowClosed(() => {
        if (!this.pendingInAppAfterSetup) return;
        this.pendingInAppAfterSetup = false;
        setTimeout(() => this.showInApp(), 600);
      });
    }
  }

  async openTutorialWindow() {
    try {
      if (window.electronAPI?.openTutorialWindow) {
        await window.electronAPI.openTutorialWindow();
        console.log('✓ Tutorial window opened');
      }
    } catch (error) {
      console.error('Failed to open tutorial window:', error);
    }
  }

  show() {
    this.pendingInAppAfterSetup = true;
    this.openTutorialWindow();
  }

  showInApp() {
    this.currentStep = 0;
    this.installMethod = null;
    this.installDownloadStarted = false;
    this.createOverlay();
    this.renderStep();
  }

  createOverlay() {
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-guide-overlay show';
    this.overlay.innerHTML = `
<div class="tutorial-guide-scrim"></div>
<section class="tutorial-guide-panel" id="tutorial-guide-panel" role="dialog" aria-live="polite">
  <button class="tutorial-guide-close" id="tutorial-close" aria-label="Close tutorial">
    <i class="bi bi-x-lg"></i>
  </button>
  <div class="tutorial-guide-count" id="tutorial-count"></div>
  <h2 id="tutorial-title"></h2>
  <p id="tutorial-description"></p>
  <div class="tutorial-guide-language" id="tutorial-language" style="display: none;">
    <button class="tutorial-language-choice" data-locale="en">English</button>
    <button class="tutorial-language-choice" data-locale="fr">Français</button>
  </div>
  <div class="tutorial-install-choice" id="tutorial-install-choice" style="display: none;">
    <button class="tutorial-choice-btn" data-install-method="gamebanana">
      <i class="bi bi-link-45deg"></i>
      <span data-choice-label="gamebanana">1-click from GameBanana</span>
    </button>
  </div>
  <div class="tutorial-guide-actions">
    <button class="tutorial-guide-secondary" id="tutorial-prev">Back</button>
    <button class="tutorial-guide-primary" id="tutorial-next">Next</button>
  </div>
</section>
`;

    document.body.appendChild(this.overlay);
    this.attachEventListeners();
    this.guideTimer = window.setInterval(() => {
      if (!this.overlay) return;
      this.updateNextState();
      this.positionGuide();
    }, 500);
  }

  attachEventListeners() {
    this.overlay
      ?.querySelector<HTMLElement>('#tutorial-close')
      ?.addEventListener('click', () => this.close());
    this.overlay
      ?.querySelector<HTMLElement>('#tutorial-prev')
      ?.addEventListener('click', () => this.previousStep());
    this.overlay
      ?.querySelector<HTMLElement>('#tutorial-next')
      ?.addEventListener('click', () => this.nextStep());

    this.overlay
      ?.querySelectorAll<HTMLElement>('.tutorial-language-choice')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const locale = button.dataset.locale;
          if (locale) {
            this.selectedLocale = locale;
            this.updateLanguageButtons();
          }
        });
      });

    this.overlay
      ?.querySelectorAll<HTMLElement>('.tutorial-choice-btn')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const method = button.dataset.installMethod;
          if (method === 'fightplanner' || method === 'gamebanana') {
            this.installMethod = method;
            this.updateChoiceButtons();
          }
        });
      });

    window.addEventListener('resize', () => this.positionGuide());
    document.addEventListener('click', (event) => {
      if (!this.overlay) return;
      if (
        (event?.target as HTMLElement | null)?.closest?.(
          '#install-confirm-modal .modal-btn-primary',
        )
      ) {
        this.installConfirmClicked = true;
      }
      setTimeout(() => {
        this.updateNextState();
        this.positionGuide();
      }, 80);
    });
  }

  async renderStep() {
    if (!this.overlay) return;

    const step = this.steps[this.currentStep];

    const title = this.overlay.querySelector<HTMLElement>('#tutorial-title');
    const description = this.overlay.querySelector<HTMLElement>(
      '#tutorial-description',
    );
    const count = this.overlay.querySelector<HTMLElement>('#tutorial-count');
    const language = this.overlay.querySelector<HTMLElement>(
      '#tutorial-language',
    );
    const installChoice = this.overlay.querySelector<HTMLElement>(
      '#tutorial-install-choice',
    );
    const prevBtn = this.overlay.querySelector<HTMLButtonElement>(
      '#tutorial-prev',
    );
    const nextBtn = this.overlay.querySelector<HTMLButtonElement>(
      '#tutorial-next',
    );

    if (title) title.textContent = this.guideText(step.title);
    if (description) description.textContent = this.guideText(step.description);
    if (count) {
      count.textContent = `${this.currentStep + 1} / ${this.steps.length}`;
    }
    if (language) {
      language.style.display = step.kind === 'language' ? 'flex' : 'none';
    }
    if (installChoice) {
      installChoice.style.display = step.kind === 'choice' ? 'grid' : 'none';
    }
    if (step.kind === 'language') {
      this.selectedLocale = window.i18n?.getCurrentLocale?.() || 'en';
      this.updateLanguageButtons();
    }
    if (step.kind === 'choice') {
      this.updateChoiceButtons();
    }
    if (prevBtn) {
      prevBtn.style.visibility = this.currentStep === 0 ? 'hidden' : 'visible';
    }
    if (nextBtn) {
      nextBtn.textContent = this.guideText(
        this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next',
      );
    }
    this.updateStaticLabels();

    this.updateNextState();
    this.stepWasWaiting = this.isCurrentStepWaiting();
    this.positionGuide();
  }

  updateNextState() {
    if (!this.overlay) return;
    const step = this.steps[this.currentStep];
    const nextBtn = this.overlay.querySelector<HTMLButtonElement>(
      '#tutorial-next',
    );
    if (!nextBtn) return;

    const requiredTabActive = this.isRequiredTabActive(step);
    const waitingForTab = step.requiredTab && !requiredTabActive;
    const waitingForVisible =
      step.requiredVisible && !this.queryFirstVisible(step.requiredVisible);
    const waitingForHidden =
      step.requiredHidden && this.queryFirstVisible(step.requiredHidden);
    const waitingForChoice = step.kind === 'choice' && !this.installMethod;
    const waitingForInstallClick =
      step.requiredInstallClick && !this.installConfirmClicked;
    const waitingForDownloadComplete =
      step.requiredDownloadComplete && !this.isInstallDownloadComplete();
    const waiting = Boolean(
      waitingForTab ||
        waitingForVisible ||
        waitingForHidden ||
        waitingForChoice ||
        waitingForInstallClick ||
        waitingForDownloadComplete,
    );
    const waitingReason = waitingForTab
      ? 'tab'
      : waitingForVisible
        ? 'visible'
        : waitingForHidden
          ? 'hidden'
          : waitingForChoice
            ? 'choice'
            : waitingForInstallClick
              ? 'install-click'
              : waitingForDownloadComplete
                ? 'download-complete'
                : null;
    const description = this.overlay.querySelector<HTMLElement>(
      '#tutorial-description',
    );

    if (description) {
      description.textContent = waitingForTab
        ? this.guideMessage('click_the_tab_to_continue', {
            tab: this.guideText(this.tabLabel(step.requiredTab)),
          })
        : requiredTabActive && step.activeDescription
          ? this.guideText(step.activeDescription)
          : this.guideText(step.description);
    }

    nextBtn.disabled = waiting;
    if (waitingForTab) {
      nextBtn.textContent = `${this.guideText('Click')} ${this.guideText(step.title.replace(' tab', ''))}`;
    } else if (waitingForVisible || waitingForHidden) {
      nextBtn.textContent = this.guideText('Waiting...');
    } else if (waitingForChoice) {
      nextBtn.textContent = this.guideText('Choose one');
    } else if (waitingForInstallClick) {
      nextBtn.textContent = this.guideText('Waiting...');
    } else if (waitingForDownloadComplete) {
      nextBtn.textContent = this.guideText('Waiting...');
    } else {
      nextBtn.textContent = this.guideText(
        this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next',
      );
    }

    if (
      this.stepWasWaiting &&
      !waiting &&
      step.kind !== 'choice' &&
      this.stepWaitingReason !== 'tab'
    ) {
      this.stepWasWaiting = false;
      this.stepWaitingReason = null;
      window.setTimeout(() => {
        if (this.overlay && this.steps[this.currentStep] === step) {
          void this.nextStep();
        }
      }, 300);
    } else {
      this.stepWasWaiting = waiting;
      this.stepWaitingReason = waitingReason;
    }
  }

  tabLabel(tab?: string) {
    const labels: Record<string, string> = {
      tools: 'Mods',
      plugins: 'Plugins',
      characters: 'Characters',
      stages: 'Stages',
      downloads: 'Downloads',
      settings: 'Settings',
    };
    return tab ? labels[tab] || tab : '';
  }

  isCurrentStepWaiting() {
    const step = this.steps[this.currentStep];
    return Boolean(
      (step.requiredTab && !this.isRequiredTabActive(step)) ||
        (step.requiredVisible && !this.queryFirstVisible(step.requiredVisible)) ||
        (step.requiredHidden && this.queryFirstVisible(step.requiredHidden)) ||
        (step.kind === 'choice' && !this.installMethod) ||
        (step.requiredInstallClick && !this.installConfirmClicked) ||
        (step.requiredDownloadComplete && !this.isInstallDownloadComplete()),
    );
  }

  isInstallDownloadComplete() {
    const active = this.hasActiveDownloadStatus();
    if (active) {
      this.installDownloadStarted = true;
      return false;
    }

    return this.installDownloadStarted;
  }

  hasActiveDownloadStatus() {
    const statusManager = window.statusBarManager as any;
    if (statusManager?.hasActiveDownloads) return true;

    const bottomBar = document.querySelector<HTMLElement>('#main-status-bar');
    if (
      bottomBar?.classList.contains('download-mode') ||
      bottomBar?.querySelector('.status-downloading') ||
      bottomBar?.querySelector('.ext-progress-fill')
    ) {
      return true;
    }

    return false;
  }

  guideLocale() {
    return window.i18n?.getCurrentLocale?.() || this.selectedLocale || 'en';
  }

  guideText(text: string) {
    const key = `tutorialGuide.${this.guideKey(text)}`;
    const translated = window.i18n?.t?.(key);
    return translated && translated !== key ? translated : text;
  }

  guideMessage(key: string, params: Record<string, string> = {}) {
    const fullKey = `tutorialGuide.${key}`;
    const translated = window.i18n?.t?.(fullKey, params);
    return translated && translated !== fullKey ? translated : fullKey;
  }

  guideKey(text: string) {
    return text
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 70);
  }

  updateStaticLabels() {
    const prevBtn = this.overlay?.querySelector<HTMLButtonElement>(
      '#tutorial-prev',
    );
    if (prevBtn) prevBtn.textContent = this.guideText('Back');

    const fightPlannerChoice = this.overlay?.querySelector<HTMLElement>(
      '[data-choice-label="fightplanner"]',
    );
    if (fightPlannerChoice) {
      fightPlannerChoice.textContent = this.guideText(
        'Install inside FightPlanner',
      );
    }

    const gameBananaChoice = this.overlay?.querySelector<HTMLElement>(
      '[data-choice-label="gamebanana"]',
    );
    if (gameBananaChoice) {
      gameBananaChoice.textContent = this.guideText('1-click from GameBanana');
    }
  }

  isRequiredTabActive(step: TutorialStep) {
    if (!step.requiredTab) return false;
    return Boolean(
      document
        .querySelector<HTMLElement>(`.sidebar-btn[data-tab="${step.requiredTab}"]`)
        ?.classList.contains('active'),
    );
  }

  queryFirstVisible(selectorList: string) {
    const selectors = selectorList
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean);

    for (const selector of selectors) {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      const visible = elements.find((element) => this.isVisible(element));
      if (visible) return visible;
    }

    return null;
  }

  isVisible(element: HTMLElement) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  shouldSkipStep(step: TutorialStep) {
    return false;
  }

  positionGuide() {
    if (!this.overlay) return;

    const step = this.steps[this.currentStep];
    const panel = this.overlay.querySelector<HTMLElement>(
      '#tutorial-guide-panel',
    );
    const scrim = this.overlay.querySelector<HTMLElement>(
      '.tutorial-guide-scrim',
    );

    if (!panel) return;

    const target =
      step.requiredTab && !this.isRequiredTabActive(step)
        ? this.queryFirstVisible(`.sidebar-btn[data-tab="${step.requiredTab}"]`)
        : step.target
          ? this.queryFirstVisible(step.target)
          : null;

    if (this.highlightedElement && this.highlightedElement !== target) {
      this.highlightedElement.classList.remove('tutorial-guide-target');
      this.highlightedElement = null;
    }

    if (!target || step.placement === 'center') {
      if (scrim) scrim.style.display = 'block';
      panel.style.left = '50%';
      panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const rect = target.getBoundingClientRect();
    if (scrim) scrim.style.display = 'none';
    target.classList.add('tutorial-guide-target');
    this.highlightedElement = target;

    panel.style.transform = 'none';

    const panelWidth = 360;
    const panelHeight = 220;
    let left = rect.right + 24;
    let top = rect.top;

    if (step.placement === 'left') {
      left = rect.left - panelWidth - 24;
    } else if (step.placement === 'top') {
      left = rect.left;
      top = rect.top - panelHeight - 24;
    } else if (step.placement === 'bottom') {
      left = rect.left;
      top = rect.bottom + 24;
    }

    left = Math.min(Math.max(left, 16), window.innerWidth - panelWidth - 16);
    top = Math.min(Math.max(top, 16), window.innerHeight - panelHeight - 16);

    if (target.closest('.sidebar')) {
      left = Math.max(left, 96);
      panel.style.maxWidth = `${Math.max(240, window.innerWidth - 112)}px`;
    } else {
      panel.style.removeProperty('max-width');
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  updateLanguageButtons() {
    this.overlay
      ?.querySelectorAll<HTMLElement>('.tutorial-language-choice')
      .forEach((button) => {
        button.classList.toggle(
          'active',
          button.dataset.locale === this.selectedLocale,
        );
      });
  }

  updateChoiceButtons() {
    this.overlay
      ?.querySelectorAll<HTMLElement>('.tutorial-choice-btn')
      .forEach((button) => {
        button.classList.toggle(
          'active',
          button.dataset.installMethod === this.installMethod,
        );
      });
  }

  async nextStep() {
    const step = this.steps[this.currentStep];
    if (step.kind === 'language' && window.i18n?.changeLocale) {
      await window.i18n.changeLocale(this.selectedLocale);
    }

    if (this.currentStep < this.steps.length - 1) {
      do {
        this.currentStep++;
      } while (
        this.currentStep < this.steps.length - 1 &&
        this.shouldSkipStep(this.steps[this.currentStep])
      );
      if (this.steps[this.currentStep].requiredInstallClick) {
        this.installConfirmClicked = false;
      }
      void this.renderStep();
    } else {
      void this.complete();
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      do {
        this.currentStep--;
      } while (
        this.currentStep > 0 &&
        this.shouldSkipStep(this.steps[this.currentStep])
      );
      void this.renderStep();
    }
  }

  async complete() {
    if (window.electronAPI?.store) {
      await window.electronAPI.store.set('tutorialShown', true);
    }
    this.tutorialShown = true;
    this.close();
  }

  close() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('tutorial-guide-target');
      this.highlightedElement = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.guideTimer !== null) {
      window.clearInterval(this.guideTimer);
      this.guideTimer = null;
    }
  }

  async reset() {
    if (window.electronAPI?.store) {
      await window.electronAPI.store.set('hasLaunchedBefore', false);
    }
    console.log('✓ Tutorial reset!');
    console.log('   The setup tutorial will open before the app next launch.');
  }

  async resetToTestFirstLaunch() {
    if (window.electronAPI?.store) {
      await window.electronAPI.store.set('hasLaunchedBefore', false);
      console.log('✓ First launch flag reset!');
    }
  }

  forceShow() {
    this.show();
    console.log('✓ Tutorial window opened. In-app guide will follow.');
  }
}

if (typeof window !== 'undefined') {
  window.tutorialManager = new TutorialManager();

  window.tutorial = {
    show: () => window.tutorialManager.show(),
    showInApp: () => window.tutorialManager.showInApp(),
    reset: () => window.tutorialManager.reset(),
    resetFirstLaunch: () => window.tutorialManager.resetToTestFirstLaunch(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.tutorialManager.initialize();
    });
  } else {
    window.tutorialManager.initialize();
  }
}

export { type TutorialManager };
