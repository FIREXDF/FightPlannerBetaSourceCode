class FightPlannerManager {
  initialized: boolean;
  oldTestersExpanded: boolean;
  localeChangedHandler: (() => void) | null;
  logoStorageKey: string;
  sidebarPrideTabsStorageKey: string;
  defaultLogoVariantId: string;
  logoVariants: Array<{
    id: string;
    label: string;
    src: string;
    sidebarIconBackground: string;
  }>;

  constructor() {
    this.initialized = false;
    this.oldTestersExpanded = false;
    this.localeChangedHandler = null;
    this.logoStorageKey = 'fightplanner_logo_variant';
    this.sidebarPrideTabsStorageKey = 'sidebar_pride_tabs_enabled';
    this.defaultLogoVariantId = 'pride';
    this.logoVariants = [
      {
        id: 'default',
        label: 'Default',
        src: '../images/logo.png',
        sidebarIconBackground: 'linear-gradient(#ffffff, #ffffff)',
      },
      {
        id: 'pride',
        label: 'Pride',
        src: '../images/pride-logo/pride.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #e40303 0 16.66%, #ff8c00 16.66% 33.33%, #ffed00 33.33% 50%, #008026 50% 66.66%, #24408e 66.66% 83.33%, #732982 83.33% 100%)',
      },
      {
        id: 'trans',
        label: 'Trans',
        src: '../images/pride-logo/trans.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #5bcefa 0 20%, #f5a9b8 20% 40%, #ffffff 40% 60%, #f5a9b8 60% 80%, #5bcefa 80% 100%)',
      },
      {
        id: 'bi',
        label: 'Bi',
        src: '../images/pride-logo/bi.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #d60270 0 40%, #9b4f96 40% 60%, #0038a8 60% 100%)',
      },
      {
        id: 'gay',
        label: 'Gay',
        src: '../images/pride-logo/gay.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #078d70 0 14.28%, #26ceaa 14.28% 28.57%, #98e8c1 28.57% 42.85%, #ffffff 42.85% 57.14%, #7bade2 57.14% 71.42%, #5049cc 71.42% 85.71%, #3d1a78 85.71% 100%)',
      },
      {
        id: 'lesbian',
        label: 'Lesbian',
        src: '../images/pride-logo/lesbian.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #d52d00 0 20%, #ef7627 20% 40%, #ffffff 40% 60%, #b55690 60% 80%, #a30262 80% 100%)',
      },
      {
        id: 'omnisexual',
        label: 'Omnisexual',
        src: '../images/pride-logo/omnisexual.png',
        sidebarIconBackground:
          'linear-gradient(180deg, #fe9ace 0 20%, #ff53bf 20% 40%, #200044 40% 60%, #6760fe 60% 80%, #8ea6ff 80% 100%)',
      },
    ];
    this.applySidebarPrideTabsEnabled(this.areSidebarPrideTabsEnabled());
    console.log('FightPlanner Manager created');
  }

  async initialize() {
    if (this.initialized) {
      await this.reinitialize();
      return;
    }

    console.log('Initializing FightPlanner tab...');
    this.applySavedLogoVariant();
    await this.loadVersionInfo();
    this.setupOldTestersToggle();
    this.setupLogoVariantPicker();
    this.initialized = true;
  }

  async loadVersionInfo() {
    try {
      console.log('Loading version info...');

      if (!window.electronAPI || !window.electronAPI.getAppVersion) {
        console.error('Electron API not available');
        return;
      }

      const versionInfo = await window.electronAPI.getAppVersion();
      console.log('Version info received:', versionInfo);

      const headerVersion = document.querySelector<HTMLElement>(
        '#app-version-display',
      );
      if (headerVersion && versionInfo.version) {
        headerVersion.textContent = versionInfo.version;
        console.log('Header version updated:', versionInfo.version);
      } else {
        console.warn('Header version element not found or no version');
      }

      const appVersionFull =
        document.querySelector<HTMLElement>('#app-version-full');
      if (appVersionFull && versionInfo.version) {
        appVersionFull.textContent = `v${versionInfo.version}`;
      }

      const electronVersion =
        document.querySelector<HTMLElement>('#electron-version');
      if (electronVersion && versionInfo.electronVersion) {
        electronVersion.textContent = `v${versionInfo.electronVersion}`;
      }

      const nodeVersion = document.querySelector<HTMLElement>('#node-version');
      if (nodeVersion && versionInfo.nodeVersion) {
        nodeVersion.textContent = `v${versionInfo.nodeVersion}`;
      }
    } catch (error) {
      console.error('Failed to load version info:', error);
    }
  }

  setupOldTestersToggle() {
    const existingToggleButton =
      document.querySelector<HTMLButtonElement>('#toggle-old-testers');
    const oldTestersSection =
      document.querySelector<HTMLElement>('#old-testers-section');

    if (!existingToggleButton || !oldTestersSection) {
      return;
    }

    if (this.localeChangedHandler) {
      window.removeEventListener('localeChanged', this.localeChangedHandler);
      this.localeChangedHandler = null;
    }

    const toggleButton = existingToggleButton.cloneNode(true) as HTMLButtonElement;
    existingToggleButton.replaceWith(toggleButton);

    toggleButton.addEventListener('click', () => {
      this.oldTestersExpanded = !this.oldTestersExpanded;
      this.refreshOldTestersToggleState();
    });

    this.localeChangedHandler = () => this.refreshOldTestersToggleState();
    window.addEventListener('localeChanged', this.localeChangedHandler);

    this.refreshOldTestersToggleState();
  }

  getSavedLogoVariant() {
    const savedVariantId =
      localStorage.getItem(this.logoStorageKey) || this.defaultLogoVariantId;
    return (
      this.logoVariants.find((variant) => variant.id === savedVariantId) ||
      this.logoVariants.find(
        (variant) => variant.id === this.defaultLogoVariantId,
      ) ||
      this.logoVariants[0]
    );
  }

  applySavedLogoVariant() {
    this.applyLogoVariant(this.getSavedLogoVariant().id);
  }

  areSidebarPrideTabsEnabled() {
    return localStorage.getItem(this.sidebarPrideTabsStorageKey) !== 'false';
  }

  applySidebarPrideTabsEnabled(enabled: boolean, persist = false) {
    document.documentElement.classList.toggle(
      'sidebar-pride-tabs-disabled',
      !enabled,
    );

    if (persist) {
      localStorage.setItem(
        this.sidebarPrideTabsStorageKey,
        enabled ? 'true' : 'false',
      );
    }
  }

  applySidebarActiveLogo(backgroundImage: string) {
    document.documentElement.style.setProperty(
      '--sidebar-active-logo',
      backgroundImage,
    );
  }

  applyLogoVariant(variantId: string, persist = true) {
    const variant =
      this.logoVariants.find((entry) => entry.id === variantId) ||
      this.logoVariants[0];

    if (persist) {
      localStorage.setItem(this.logoStorageKey, variant.id);
    }

    document
      .querySelectorAll<HTMLImageElement>('.titlebar .logo, .credits-logo')
      .forEach((logo) => {
        logo.src = variant.src;
        logo.dataset.logoVariant = variant.id;
      });

    this.applySidebarActiveLogo(variant.sidebarIconBackground);
  }

  setupLogoVariantPicker() {
    const existingLogo = document.querySelector<HTMLImageElement>('.credits-logo');
    if (!existingLogo) return;

    const logo = existingLogo.cloneNode(true) as HTMLImageElement;
    existingLogo.replaceWith(logo);
    this.applySavedLogoVariant();

    logo.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.openLogoVariantMenu(event.clientX, event.clientY);
    });
  }

  openLogoVariantMenu(clientX: number, clientY: number) {
    this.closeLogoVariantMenu();

    const menu = document.createElement('div');
    menu.className = 'credits-logo-menu';
    const activeVariant = this.getSavedLogoVariant();
    menu.innerHTML = this.logoVariants
      .map(
        (variant) => `
<button class="credits-logo-menu-item ${variant.id === activeVariant.id ? 'is-active' : ''}" type="button" data-logo-variant="${variant.id}">
<img src="${variant.src}" alt="">
<span>${variant.label}</span>
</button>`,
      )
      .join('');

    document.body.appendChild(menu);
    requestAnimationFrame(() => {
      menu.classList.add('is-open');
    });

    setTimeout(() => {
      document.addEventListener(
        'click',
        () => this.closeLogoVariantMenu(),
        { once: true },
      );
    }, 0);

    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(clientX, window.innerWidth - menuRect.width - 10);
    const top = Math.min(clientY, window.innerHeight - menuRect.height - 10);
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-logo-variant]',
      );
      if (!item?.dataset.logoVariant) return;
      this.applyLogoVariant(item.dataset.logoVariant);
      this.closeLogoVariantMenu();
    });
  }

  closeLogoVariantMenu() {
    const menu = document.querySelector<HTMLElement>('.credits-logo-menu');
    if (!menu) return;

    menu.classList.remove('is-open');
    menu.classList.add('is-closing');

    window.setTimeout(() => {
      menu.remove();
    }, document.body.classList.contains('no-animations') ? 0 : 140);
  }

  refreshOldTestersToggleState() {
    const toggleButton =
      document.querySelector<HTMLButtonElement>('#toggle-old-testers');
    const oldTestersSection =
      document.querySelector<HTMLElement>('#old-testers-section');

    if (!toggleButton || !oldTestersSection) {
      return;
    }

    const showLabel = window.i18n?.t(
      'fightplanner.showOldTesters',
    ) || 'See old testers';
    const hideLabel = window.i18n?.t(
      'fightplanner.hideOldTesters',
    ) || 'Hide old testers';

    toggleButton.textContent = this.oldTestersExpanded ? hideLabel : showLabel;
    toggleButton.setAttribute('aria-expanded', String(this.oldTestersExpanded));
    oldTestersSection.classList.toggle('is-collapsed', !this.oldTestersExpanded);
    oldTestersSection.setAttribute(
      'aria-hidden',
      String(!this.oldTestersExpanded),
    );
  }

  async reinitialize() {
    console.log('Reinitializing FightPlanner tab...');
    this.applySavedLogoVariant();
    await this.loadVersionInfo();
    this.setupOldTestersToggle();
    this.setupLogoVariantPicker();
  }
}

if (typeof window !== 'undefined') {
  window.fightPlannerManager = new FightPlannerManager();
  window.fightPlannerManager.applySavedLogoVariant();
  console.log('FightPlanner Manager initialized globally');
}

export { type FightPlannerManager };
