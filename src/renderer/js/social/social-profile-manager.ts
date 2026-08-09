class SocialProfileManager extends SocialFeedManager {
  [key: string]: any;
  parseFirestoreFieldValue(value: any): any {
    if (!value || typeof value !== 'object') return value;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('arrayValue' in value) {
      const values = value.arrayValue?.values;
      return Array.isArray(values)
        ? values.map((entry) => this.parseFirestoreFieldValue(entry))
        : [];
    }
    if ('mapValue' in value) {
      const fields = value.mapValue?.fields || {};
      return Object.fromEntries(
        Object.entries(fields).map(([key, entry]) => [
          key,
          this.parseFirestoreFieldValue(entry),
        ]),
      );
    }

    return Object.values(value)[0];
  }

  parseFirestoreFields<T extends Record<string, any>>(fields: any): T {
    return Object.fromEntries(
      Object.entries(fields || {}).map(([key, value]) => [
        key,
        this.parseFirestoreFieldValue(value),
      ]),
    ) as T;
  }

  normalizeUserFields(data: any): UserFields {
    const source = data?.fields ? this.parseFirestoreFields(data.fields) : data;
    return {
      ...source,
      photoURL: source?.photoURL || source?.photo_url,
      photoPublicId: source?.photoPublicId || source?.photo_public_id,
      bannerURL: source?.bannerURL || source?.banner_url,
      bannerPublicId: source?.bannerPublicId || source?.banner_public_id,
      privacySettings: source?.privacySettings || source?.privacy_settings,
      profileTheme: source?.profileTheme || source?.profile_theme,
    } as UserFields;
  }

  static readonly PROFILE_CUSTOMIZATION_BADGES = new Set([
    'supporter',
    'tester',
    'testers',
    'fp_creator',
    'fightplanner_creator',
    'community_organizer',
  ]);

  normalizeCustomizationBadgeKey(value: any) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  canCustomizeProfile(badges?: any) {
    let list = badges;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (error) {
        list = [];
      }
    }
    if (!Array.isArray(list)) return false;
    return list.some((badge) =>
      SocialProfileManager.PROFILE_CUSTOMIZATION_BADGES.has(
        this.normalizeCustomizationBadgeKey(badge),
      ),
    );
  }

  parseProfileTheme(raw: any): ProfileTheme | null {
    let theme = raw;
    if (typeof theme === 'string') {
      try {
        theme = JSON.parse(theme);
      } catch (error) {
        return null;
      }
    }
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
      return null;
    }
    const result: ProfileTheme = {};
    const colorKeys: (keyof ProfileTheme)[] = [
      'bannerColor1',
      'bannerColor2',
      'backgroundColor1',
      'backgroundColor2',
      'accentColor',
      'usernameColor',
    ];
    for (const key of colorKeys) {
      const value = theme[key];
      if (value && this.isSafeBadgeStyleValue(value)) {
        (result as any)[key] = String(value).trim();
      }
    }
    const bannerStyle = String(theme.bannerStyle || '')
      .trim()
      .toLowerCase();
    if (
      bannerStyle === 'diagonal' ||
      bannerStyle === 'radial' ||
      bannerStyle === 'solid' ||
      bannerStyle === 'split'
    ) {
      result.bannerStyle = bannerStyle;
    }
    const backgroundStyle = String(theme.backgroundStyle || '')
      .trim()
      .toLowerCase();
    if (
      backgroundStyle === 'gradient' ||
      backgroundStyle === 'spotlight' ||
      backgroundStyle === 'solid'
    ) {
      result.backgroundStyle = backgroundStyle;
    }
    const bannerAngle = Number(theme.bannerAngle);
    if (Number.isFinite(bannerAngle)) {
      result.bannerAngle = Math.max(0, Math.min(360, Math.round(bannerAngle)));
    }
    const avatarShape = String(theme.avatarShape || '')
      .trim()
      .toLowerCase();
    if (
      avatarShape === 'circle' ||
      avatarShape === 'rounded' ||
      avatarShape === 'square'
    ) {
      result.avatarShape = avatarShape;
    }
    const avatarRing = String(theme.avatarRing || '')
      .trim()
      .toLowerCase();
    if (
      avatarRing === 'subtle' ||
      avatarRing === 'bold' ||
      avatarRing === 'double'
    ) {
      result.avatarRing = avatarRing;
    }
    const effect = String(theme.usernameEffect || '')
      .trim()
      .toLowerCase();
    if (
      effect === 'gradient' ||
      effect === 'glow' ||
      effect === 'shadow'
    ) {
      result.usernameEffect = effect;
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  applyProfileTheme(scope: 'self' | 'user', theme: ProfileTheme | null) {
    const header = document.querySelector<HTMLElement>(
      scope === 'self'
        ? '#social-section-profile .social-profile-header'
        : '#social-section-user-profile .social-user-profile-header',
    );
    const usernameEl = document.querySelector<HTMLElement>(
      scope === 'self'
        ? '#social-profile-username'
        : '#social-user-profile-username',
    );
    const profileSurface =
      scope === 'self'
        ? document.querySelector<HTMLElement>(
            '#social-section-profile .social-profile-preview-stage',
          )
        : header;
    if (!header) return;

    const vars: Record<string, string | undefined> = {
      '--profile-banner-c1': theme?.bannerColor1,
      '--profile-banner-c2': theme?.bannerColor2,
      '--profile-background-c1': theme?.backgroundColor1,
      '--profile-background-c2': theme?.backgroundColor2,
      '--profile-accent': theme?.accentColor,
      '--profile-username-color': theme?.usernameColor,
      '--profile-banner-angle':
        theme?.bannerAngle !== undefined
          ? `${theme.bannerAngle}deg`
          : undefined,
    };
    const themedElements = profileSurface && profileSurface !== header
      ? [header, profileSurface]
      : [header];
    for (const element of themedElements) {
      for (const [name, value] of Object.entries(vars)) {
        if (value) {
          element.style.setProperty(name, value);
        } else {
          element.style.removeProperty(name);
        }
      }
    }
    header.classList.toggle('has-profile-theme', Boolean(theme));
    const setThemeClass = (
      element: HTMLElement,
      prefix: string,
      value: string | undefined,
    ) => {
      Array.from(element.classList)
        .filter((className) => className.startsWith(prefix))
        .forEach((className) => element.classList.remove(className));
      if (theme && value) element.classList.add(`${prefix}${value}`);
    };
    setThemeClass(
      header,
      'profile-banner-style-',
      theme?.bannerStyle || (theme ? 'diagonal' : undefined),
    );
    setThemeClass(
      header,
      'profile-avatar-shape-',
      theme?.avatarShape || (theme ? 'circle' : undefined),
    );
    setThemeClass(
      header,
      'profile-avatar-ring-',
      theme?.avatarRing || (theme ? 'subtle' : undefined),
    );
    if (profileSurface) {
      const hasBackground = Boolean(
        theme?.backgroundColor1 || theme?.backgroundColor2,
      );
      profileSurface.classList.toggle(
        'has-profile-background',
        hasBackground,
      );
      setThemeClass(
        profileSurface,
        'profile-background-style-',
        hasBackground
          ? theme?.backgroundStyle || 'gradient'
          : undefined,
      );
    }

    if (usernameEl) {
      usernameEl.classList.toggle(
        'profile-username-gradient',
        theme?.usernameEffect === 'gradient',
      );
      usernameEl.classList.toggle(
        'profile-username-glow',
        theme?.usernameEffect === 'glow',
      );
      usernameEl.classList.toggle(
        'profile-username-shadow',
        theme?.usernameEffect === 'shadow',
      );
      usernameEl.classList.toggle(
        'profile-username-colored',
        Boolean(theme?.usernameColor) && theme?.usernameEffect !== 'gradient',
      );
    }
  }

  readProfileThemeInputs(): ProfileTheme {
    const getValue = (id: string) =>
      document.querySelector<HTMLInputElement | HTMLSelectElement>(id)
        ?.value || '';
    const theme: ProfileTheme = {
      bannerColor1: getValue('#social-theme-banner-color-1') || undefined,
      bannerColor2: getValue('#social-theme-banner-color-2') || undefined,
      backgroundColor1:
        getValue('#social-theme-background-color-1') || undefined,
      backgroundColor2:
        getValue('#social-theme-background-color-2') || undefined,
      accentColor: getValue('#social-theme-accent-color') || undefined,
      usernameColor: getValue('#social-theme-username-color') || undefined,
      bannerStyle:
        (getValue('#social-theme-banner-style') as
          | ProfileTheme['bannerStyle']
          | '') || undefined,
      bannerAngle: Number(getValue('#social-theme-banner-angle')) || 0,
      backgroundStyle:
        (getValue('#social-theme-background-style') as
          | ProfileTheme['backgroundStyle']
          | '') || undefined,
      avatarShape:
        (getValue('#social-theme-avatar-shape') as
          | ProfileTheme['avatarShape']
          | '') || undefined,
      avatarRing:
        (getValue('#social-theme-avatar-ring') as
          | ProfileTheme['avatarRing']
          | '') || undefined,
    };
    const effect = getValue('#social-theme-username-effect');
    if (
      effect === 'gradient' ||
      effect === 'glow' ||
      effect === 'shadow'
    ) {
      theme.usernameEffect = effect;
    }
    return theme;
  }

  populateProfileThemeInputs(theme: ProfileTheme | null) {
    const setValue = (id: string, value: string) => {
      const input = document.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(id);
      if (input) input.value = value;
    };
    setValue('#social-theme-banner-color-1', theme?.bannerColor1 || '#7a5cff');
    setValue('#social-theme-banner-color-2', theme?.bannerColor2 || '#1c1c24');
    setValue(
      '#social-theme-background-color-1',
      theme?.backgroundColor1 || '#24213d',
    );
    setValue(
      '#social-theme-background-color-2',
      theme?.backgroundColor2 || '#111116',
    );
    setValue(
      '#social-theme-background-style',
      theme?.backgroundStyle || 'gradient',
    );
    setValue('#social-theme-accent-color', theme?.accentColor || '#7a5cff');
    setValue(
      '#social-theme-username-color',
      theme?.usernameColor || '#ffffff',
    );
    setValue(
      '#social-theme-banner-style',
      theme?.bannerStyle || 'diagonal',
    );
    setValue(
      '#social-theme-banner-angle',
      String(theme?.bannerAngle ?? 135),
    );
    setValue(
      '#social-theme-avatar-shape',
      theme?.avatarShape || 'circle',
    );
    setValue(
      '#social-theme-avatar-ring',
      theme?.avatarRing || 'subtle',
    );
    setValue('#social-theme-username-effect', theme?.usernameEffect || 'none');
    this.updateProfileThemeAngleOutput();
    this.updateActiveProfileThemePreset();
  }

  toggleProfileCustomizationSection(
    canCustomize: boolean,
    theme: ProfileTheme | null,
    badges?: any,
  ) {
    const section = document.querySelector<HTMLElement>(
      '#social-profile-customization',
    );
    if (!section) return;
    section.style.display = canCustomize ? '' : 'none';
    const supporterPromo = document.querySelector<HTMLElement>(
      '#social-supporter-profile-promo',
    );
    if (supporterPromo) {
      supporterPromo.hidden = canCustomize;
    }
    this.currentProfileTheme = theme;
    const openButton = document.querySelector<HTMLElement>(
      '#social-open-customizer',
    );
    if (openButton) {
      openButton.style.display = canCustomize ? 'inline-flex' : 'none';
    }
    let customizationBadges = badges;
    if (typeof customizationBadges === 'string') {
      try {
        customizationBadges = JSON.parse(customizationBadges);
      } catch (error) {
        customizationBadges = [];
      }
    }
    const isSupporter = Array.isArray(customizationBadges)
      ? customizationBadges.some(
          (badge) =>
            this.normalizeCustomizationBadgeKey(badge) === 'supporter',
        )
      : false;
    section.classList.toggle('is-supporter-studio', isSupporter);
    const supporterLabel = section.querySelector<HTMLElement>(
      '#social-supporter-studio-label',
    );
    if (supporterLabel) {
      supporterLabel.style.display = isSupporter ? 'inline-flex' : 'none';
    }
    if (canCustomize) {
      this.populateProfileThemeInputs(theme);
    } else {
      this.closeProfileCustomizer(false);
    }
  }

  static readonly PROFILE_THEME_PRESETS: Record<string, ProfileTheme> = {
    midnight: {
      bannerColor1: '#312e81',
      bannerColor2: '#0f172a',
      backgroundColor1: '#24214f',
      backgroundColor2: '#0b1020',
      accentColor: '#818cf8',
      usernameColor: '#e0e7ff',
      bannerStyle: 'radial',
      backgroundStyle: 'spotlight',
      bannerAngle: 155,
      avatarShape: 'circle',
      avatarRing: 'bold',
      usernameEffect: 'glow',
    },
    ember: {
      bannerColor1: '#7c2d12',
      bannerColor2: '#18181b',
      backgroundColor1: '#4b2117',
      backgroundColor2: '#151216',
      accentColor: '#fb923c',
      usernameColor: '#fff7ed',
      bannerStyle: 'diagonal',
      backgroundStyle: 'gradient',
      bannerAngle: 125,
      avatarShape: 'rounded',
      avatarRing: 'bold',
      usernameEffect: 'shadow',
    },
    ocean: {
      bannerColor1: '#075985',
      bannerColor2: '#0f172a',
      backgroundColor1: '#123d56',
      backgroundColor2: '#0a1523',
      accentColor: '#38bdf8',
      usernameColor: '#e0f2fe',
      bannerStyle: 'radial',
      backgroundStyle: 'spotlight',
      bannerAngle: 165,
      avatarShape: 'circle',
      avatarRing: 'double',
      usernameEffect: 'glow',
    },
    mono: {
      bannerColor1: '#3f3f46',
      bannerColor2: '#18181b',
      backgroundColor1: '#29292e',
      backgroundColor2: '#17171a',
      accentColor: '#d4d4d8',
      usernameColor: '#fafafa',
      bannerStyle: 'solid',
      backgroundStyle: 'solid',
      bannerAngle: 135,
      avatarShape: 'square',
      avatarRing: 'subtle',
      usernameEffect: 'none',
    },
  };

  applyProfileThemePreset(presetId: string) {
    const preset =
      SocialProfileManager.PROFILE_THEME_PRESETS[presetId];
    if (!preset) return;
    this.populateProfileThemeInputs(preset);
    this.previewProfileTheme();
    this.updateActiveProfileThemePreset(presetId);
  }

  updateProfileThemeAngleOutput() {
    const input = document.querySelector<HTMLInputElement>(
      '#social-theme-banner-angle',
    );
    const output = document.querySelector<HTMLOutputElement>(
      '#social-theme-banner-angle-value',
    );
    if (input && output) output.value = `${input.value}°`;
  }

  updateActiveProfileThemePreset(forcedPresetId = '') {
    const current = this.readProfileThemeInputs();
    const matchesPreset = (preset: ProfileTheme) =>
      preset.bannerColor1 === current.bannerColor1 &&
      preset.bannerColor2 === current.bannerColor2 &&
      preset.backgroundColor1 === current.backgroundColor1 &&
      preset.backgroundColor2 === current.backgroundColor2 &&
      preset.accentColor === current.accentColor &&
      preset.usernameColor === current.usernameColor &&
      preset.bannerStyle === current.bannerStyle &&
      preset.backgroundStyle === current.backgroundStyle &&
      preset.bannerAngle === current.bannerAngle &&
      preset.avatarShape === current.avatarShape &&
      preset.avatarRing === current.avatarRing &&
      (preset.usernameEffect || 'none') ===
        (current.usernameEffect || 'none');
    const activePreset =
      forcedPresetId ||
      Object.entries(SocialProfileManager.PROFILE_THEME_PRESETS).find(
        ([, preset]) => matchesPreset(preset),
      )?.[0] ||
      '';
    document
      .querySelectorAll<HTMLButtonElement>('.social-theme-preset')
      .forEach((button) => {
        const isActive = button.dataset.themePreset === activePreset;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
  }

  previewProfileTheme() {
    this.applyProfileTheme('self', this.readProfileThemeInputs());
  }

  openProfileCustomizer() {
    const profileSection = document.querySelector<HTMLElement>(
      '#social-section-profile',
    );
    const panel = document.querySelector<HTMLElement>(
      '#social-profile-customizer-panel',
    );
    const openButton = document.querySelector<HTMLButtonElement>(
      '#social-open-customizer',
    );
    const closeButton = document.querySelector<HTMLButtonElement>(
      '#social-close-customizer',
    );
    if (!profileSection || !panel || !openButton) return;

    this.populateProfileThemeInputs(this.currentProfileTheme || null);
    this.applyProfileTheme('self', this.currentProfileTheme || null);
    profileSection.classList.add('is-customizing-profile');
    panel.setAttribute('aria-hidden', 'false');
    openButton.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => closeButton?.focus());
  }

  closeProfileCustomizer(restoreFocus = true) {
    const profileSection = document.querySelector<HTMLElement>(
      '#social-section-profile',
    );
    const panel = document.querySelector<HTMLElement>(
      '#social-profile-customizer-panel',
    );
    const openButton = document.querySelector<HTMLButtonElement>(
      '#social-open-customizer',
    );
    if (!profileSection || !panel) return;

    profileSection.classList.remove('is-customizing-profile');
    panel.setAttribute('aria-hidden', 'true');
    openButton?.setAttribute('aria-expanded', 'false');
    this.applyProfileTheme('self', this.currentProfileTheme || null);
    this.populateProfileThemeInputs(this.currentProfileTheme || null);
    if (restoreFocus) window.requestAnimationFrame(() => openButton?.focus());
  }

  async saveProfileTheme(reset = false) {
    if (!this.authToken) return;
    const saveBtn = document.querySelector<HTMLButtonElement>(
      '#social-save-theme',
    );
    const resetBtn = document.querySelector<HTMLButtonElement>(
      '#social-reset-theme',
    );
    if (saveBtn) saveBtn.disabled = true;
    if (resetBtn) resetBtn.disabled = true;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/update-profile-theme`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: this.authToken,
            reset,
            theme: reset ? null : this.readProfileThemeInputs(),
          }),
        },
      );
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        const message =
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.message || 'Failed to save profile theme';
        throw new Error(message);
      }
      const savedTheme = this.parseProfileTheme(data?.theme);
      this.currentProfileTheme = savedTheme;
      this.applyProfileTheme('self', savedTheme);
      this.populateProfileThemeInputs(savedTheme);
      if (window.toastManager) {
        window.toastManager.success(
          reset
            ? this.getSocialTranslation(
                'social.profileThemeReset',
                'Profile theme reset.',
              )
            : this.getSocialTranslation(
                'social.profileThemeSaved',
                'Profile theme saved.',
              ),
        );
      }
    } catch (error) {
      console.error('[Social] Failed to save profile theme:', error);
      if (window.toastManager) {
        window.toastManager.error(
          error instanceof Error
            ? error.message
            : this.getSocialTranslation(
                'social.failedToSaveProfileTheme',
                'Failed to save profile theme.',
              ),
        );
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (resetBtn) resetBtn.disabled = false;
    }
  }

  async pollForSupporterActivation() {
    if (this.supporterActivationPollRunning) return;
    this.supporterActivationPollRunning = true;
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const response = await this.fetchWithAuth(
          `${this.API_URL}/supporter/status`,
        );
        if (!response.ok) continue;
        const status = await response.json();
        if (status?.active) {
          await this.loadUserProfile();
          window.toastManager?.success(
            this.getSocialTranslation(
              'social.supporterActivated',
              'Supporter benefits are now active on your profile.',
            ),
          );
          return;
        }
      }
    } catch (error) {
      console.warn('[Social] Supporter activation check failed:', error);
    } finally {
      this.supporterActivationPollRunning = false;
    }
  }

  async startSupporterCheckout() {
    await window.electronAPI?.openUrl?.('https://ko-fi.com/firexdf');
    void this.pollForSupporterActivation();
  }

  showSupporterBenefitsModal() {
    if (!window.modalManager?.showCustomModal) {
      this.showSupporterCheckoutModal();
      return;
    }

    const benefit = (key: string, fallback: string) =>
      this.escapeHtml(this.getSocialTranslation(key, fallback));

    window.modalManager.showCustomModal({
      id: 'social-supporter-benefits-modal',
      title: this.getSocialTranslation(
        'social.supporterBenefitsModalTitle',
        'Become a Supporter',
      ),
      body: `<div class="social-supporter-benefits-modal">
        <div class="social-supporter-benefits-intro">
          <span class="social-supporter-benefits-heart" aria-hidden="true">
            <i class="bi bi-heart-fill"></i>
          </span>
          <p>${benefit(
            'social.supporterBenefitsModalIntro',
            'Support FightPlanner and unlock extra benefits for your profile and projects.',
          )}</p>
        </div>
        <ul class="social-supporter-benefits-list">
          <li>
            <i class="bi bi-palette2" aria-hidden="true"></i>
            <span>${benefit(
              'social.supporterProfileBenefitColors',
              'Custom colors and backgrounds',
            )}</span>
          </li>
          <li>
            <i class="bi bi-person-circle" aria-hidden="true"></i>
            <span>${benefit(
              'social.supporterProfileBenefitAvatar',
              'Avatar shapes and rings',
            )}</span>
          </li>
          <li>
            <i class="bi bi-type" aria-hidden="true"></i>
            <span>${benefit(
              'social.supporterProfileBenefitUsername',
              'Username effects',
            )}</span>
          </li>
          <li>
            <i class="bi bi-key" aria-hidden="true"></i>
            <span>${benefit(
              'social.supporterBenefitApiKey',
              'A permissive API key for your integrations and projects',
            )}</span>
          </li>
        </ul>
      </div>`,
      buttons: [
        {
          text: this.getSocialTranslation(
            'social.becomeSupporter',
            'Become a Supporter',
          ),
          type: 'primary',
          onClick: () => {
            const delay = document.body.classList.contains('no-animations')
              ? 0
              : 320;
            window.setTimeout(() => this.showSupporterCheckoutModal(), delay);
          },
        },
        {
          text: this.getSocialTranslation('common.cancel', 'Cancel'),
          type: 'secondary',
        },
      ],
    });
  }

  showSupporterCheckoutModal() {
    const accountEmail = this.escapeHtml(this.userData?.email || '');
    if (!window.modalManager?.showCustomModal) {
      void this.startSupporterCheckout();
      return;
    }
    window.modalManager.showCustomModal({
      id: 'social-supporter-checkout-modal',
      title: this.getSocialTranslation(
        'social.supporterCheckoutModalTitle',
        'Activate Supporter automatically',
      ),
      body: `<div class="social-supporter-checkout-modal-copy">
        <p>${this.escapeHtml(
          this.getSocialTranslation(
            'social.supporterCheckoutModalBody',
            'Use the same email on Ko-fi as your FightPlanner account so the payment can be linked automatically.',
          ),
        )}</p>
        <div class="social-supporter-checkout-email">
          <i class="bi bi-envelope-check" aria-hidden="true"></i>
          <span>${this.escapeHtml(
            this.getSocialTranslation(
              'social.supporterCheckoutAccountEmail',
              'FightPlanner account:',
            ),
          )} <strong>${accountEmail}</strong></span>
        </div>
      </div>`,
      buttons: [
        {
          text: this.getSocialTranslation(
            'social.continueToKofi',
            'Continue to Ko-fi',
          ),
          type: 'primary',
          onClick: () => {
            void this.startSupporterCheckout();
          },
        },
        {
          text: this.getSocialTranslation('common.cancel', 'Cancel'),
          type: 'secondary',
        },
      ],
    });
  }

  setupProfileThemeControls() {
    if (this.profileThemeListenersBound) return;
    const section = document.querySelector<HTMLElement>(
      '#social-profile-customization',
    );
    if (!section) return;
    this.profileThemeListenersBound = true;
    const panelBody = document.querySelector<HTMLElement>(
      '#social-profile-customizer-body',
    );
    if (panelBody && section.parentElement !== panelBody) {
      panelBody.appendChild(section);
    }

    const previewInputs = [
      '#social-theme-banner-color-1',
      '#social-theme-banner-color-2',
      '#social-theme-background-color-1',
      '#social-theme-background-color-2',
      '#social-theme-accent-color',
      '#social-theme-username-color',
      '#social-theme-banner-style',
      '#social-theme-background-style',
      '#social-theme-banner-angle',
      '#social-theme-avatar-shape',
      '#social-theme-avatar-ring',
      '#social-theme-username-effect',
    ];
    previewInputs.forEach((selector) => {
      const input = document.querySelector<HTMLElement>(selector);
      const handlePreview = () => {
        this.updateProfileThemeAngleOutput();
        this.previewProfileTheme();
        this.updateActiveProfileThemePreset();
      };
      input?.addEventListener('input', handlePreview);
      input?.addEventListener('change', handlePreview);
    });
    document
      .querySelectorAll<HTMLButtonElement>('.social-theme-preset')
      .forEach((button) => {
        button.addEventListener('click', () => {
          this.applyProfileThemePreset(button.dataset.themePreset || '');
        });
      });

    document
      .querySelector<HTMLElement>('#social-save-theme')
      ?.addEventListener('click', () => this.saveProfileTheme(false));
    document
      .querySelector<HTMLElement>('#social-reset-theme')
      ?.addEventListener('click', () => this.saveProfileTheme(true));
    document
      .querySelector<HTMLElement>('#social-open-customizer')
      ?.addEventListener('click', () => this.openProfileCustomizer());
    document
      .querySelector<HTMLElement>('#social-close-customizer')
      ?.addEventListener('click', () => this.closeProfileCustomizer());
    document
      .querySelector<HTMLButtonElement>('#social-become-supporter-btn')
      ?.addEventListener('click', () => this.showSupporterCheckoutModal());
    window.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        document
          .querySelector('#social-section-profile')
          ?.classList.contains('is-customizing-profile')
      ) {
        this.closeProfileCustomizer();
      }
    });
    document
      .querySelectorAll<HTMLElement>('.social-nav-item')
      .forEach((item) => {
        item.addEventListener('click', () => this.closeProfileCustomizer(false));
      });
  }

  normalizeBadgeId(badge: string) {
    return String(badge || '')
      .trim()
      .toLowerCase();
  }

  getReadableBadgeLabel(badge: string) {
    return (
      this.normalizeBadgeId(badge)
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Badge'
    );
  }

  getBadgeClassName(badge: string) {
    return `badge-${this.normalizeBadgeId(badge).replace(/[^a-z0-9-]/g, '-')}`;
  }

  normalizeProfileBadgeDefinitions(
    data: any,
  ): Record<string, ProfileBadgeMeta> {
    const source = data?.fields ? this.parseFirestoreFields(data.fields) : data;
    const rawDefinitions =
      source?.definitions ||
      source?.badges ||
      source?.badgeDefinitions ||
      source?.data ||
      source ||
      [];
    const entries = Array.isArray(rawDefinitions)
      ? rawDefinitions.map((definition: ProfileBadgeDefinition) => [
          definition?.id,
          definition,
        ])
      : Object.entries(rawDefinitions);

    return Object.fromEntries(
      entries
        .map(([id, definition]: [string, any]) => {
          const badgeId = this.normalizeBadgeId(id);
          if (!badgeId || !definition || typeof definition !== 'object') {
            return null;
          }

          return [
            badgeId,
            {
              label:
                String(definition.label || '').trim() ||
                this.getReadableBadgeLabel(badgeId),
              icon:
                String(definition.icon || '').trim() || 'bi-patch-check-fill',
              className:
                String(definition.className || '').trim() ||
                this.getBadgeClassName(badgeId),
              imageUrl:
                String(
                  definition.imageUrl || definition.image_url || '',
                ).trim() || undefined,
              imageAlt:
                String(
                  definition.imageAlt || definition.image_alt || '',
                ).trim() || undefined,
              color: definition.color,
              background: definition.background,
              borderColor: definition.borderColor || definition.border_color,
            },
          ];
        })
        .filter(Boolean) as [string, ProfileBadgeMeta][],
    );
  }

  async loadProfileBadgeDefinitions(): Promise<
    Record<string, ProfileBadgeMeta>
  > {
    const cached = this.getCached('profileBadgeDefinitions');
    if (cached) return cached;

    const requestKey = 'profileBadgeDefinitions';
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    const request = this.fetchProfileBadgeDefinitions()
      .catch((error) => {
        console.warn('[Social] Failed to load badge definitions:', error);
        return {};
      })
      .then((definitions) => {
        this.setCache('profileBadgeDefinitions', definitions);
        return definitions;
      })
      .finally(() => {
        this.pendingRequests.delete(requestKey);
      });

    this.pendingRequests.set(requestKey, request);
    return request;
  }

  async fetchProfileBadgeDefinitions(): Promise<
    Record<string, ProfileBadgeMeta>
  > {
    const endpoints = [`${this.API_URL}/read/badges`];

    for (const endpoint of endpoints) {
      const response = await fetch(endpoint);
      if (!response.ok) continue;

      const data = await response.json();
      if (data?.error) continue;

      const definitions = this.normalizeProfileBadgeDefinitions(data);
      if (Object.keys(definitions).length > 0) return definitions;
    }

    return {};
  }

  getProfileBadgeMeta(
    badge: string,
    definitions: Record<string, ProfileBadgeMeta> = {},
  ): ProfileBadgeMeta {
    const normalized = String(badge || '')
      .trim()
      .toLowerCase();

    return (
      definitions[normalized] || {
        label: this.getReadableBadgeLabel(normalized),
        icon: 'bi-patch-check-fill',
        className: this.getBadgeClassName(normalized),
      }
    );
  }

  isSafeBadgeStyleValue(value: any) {
    const text = String(value || '').trim();
    return (
      /^#[0-9a-f]{3,8}$/i.test(text) ||
      /^rgba?\([\d\s,.%]+\)$/i.test(text) ||
      /^hsla?\([\d\s,.%]+\)$/i.test(text) ||
      /^var\(--[a-z0-9-]+\)$/i.test(text)
    );
  }

  renderBadgeStyle(meta: ProfileBadgeMeta) {
    const styles: string[] = [];
    if (this.isSafeBadgeStyleValue(meta.color)) {
      styles.push(`color: ${meta.color}`);
    }
    if (this.isSafeBadgeStyleValue(meta.background)) {
      styles.push(`background: ${meta.background}`);
    }
    if (this.isSafeBadgeStyleValue(meta.borderColor)) {
      styles.push(`border-color: ${meta.borderColor}`);
    }

    return styles.length
      ? ` style="${this.escapeHtml(styles.join('; '))}"`
      : '';
  }

  renderProfileBadges(
    badges: string[] = [],
    definitions: Record<string, ProfileBadgeMeta> = {},
  ) {
    const uniqueBadges = Array.from(
      new Set(
        badges.map((badge) => String(badge || '').trim()).filter(Boolean),
      ),
    );

    return uniqueBadges
      .map((badge) => {
        const meta = this.getProfileBadgeMeta(badge, definitions);
        if (meta.imageUrl) {
          return `<span class="social-profile-badge social-profile-badge-fullimage" title="${this.escapeHtml(meta.label)}">
${this.renderProfileBadgeVisual(meta)}
</span>`;
        }

        return `<span class="social-profile-badge ${this.escapeHtml(meta.className)}" title="${this.escapeHtml(meta.label)}"${this.renderBadgeStyle(meta)}>
${this.renderProfileBadgeVisual(meta)}
<span>${this.escapeHtml(meta.label)}</span>
</span>`;
      })
      .join('');
  }

  renderProfileBadgeVisual(meta: ProfileBadgeMeta) {
    if (meta.imageUrl) {
      return `<img class="social-profile-badge-image" src="${this.escapeHtml(meta.imageUrl)}" alt="${this.escapeHtml(meta.imageAlt || '')}" loading="lazy" />`;
    }

    return `<i class="bi ${this.escapeHtml(meta.icon)}"></i>`;
  }

  async applyProfileBadges(selector: string, badges?: string[]) {
    const badgesEl = document.querySelector<HTMLElement>(selector);
    if (!badgesEl) return;
    if (!Array.isArray(badges)) {
      badgesEl.innerHTML = '';
      return;
    }

    const definitions = await this.loadProfileBadgeDefinitions();
    badgesEl.innerHTML = this.renderProfileBadges(badges, definitions);
  }

  getUserBanReason(userFields: any) {
    const isBanned =
      userFields?.banned === true ||
      userFields?.isBanned === true ||
      userFields?.is_banned === true ||
      userFields?.disabled === true ||
      userFields?.isDisabled === true ||
      userFields?.is_disabled === true ||
      userFields?.status === 'banned' ||
      userFields?.status === 'disabled';
    const reason =
      String(
        userFields?.disableReason || userFields?.disable_reason || '',
      ).trim() || null;

    return isBanned || reason ? reason || 'This account is banned.' : null;
  }

  applyUserProfileBanNotice(userFields?: any) {
    const notice = document.querySelector<HTMLElement>(
      '#social-user-profile-ban-notice',
    );
    if (!notice) return;

    const reason = this.getUserBanReason(userFields);
    if (!reason) {
      notice.style.display = 'none';
      return;
    }

    const textEl = notice.querySelector<HTMLElement>('span');
    if (textEl) {
      textEl.textContent =
        reason === 'This account is banned.'
          ? reason
          : `This account is banned: ${reason}`;
    }
    notice.style.display = 'inline-flex';
  }

  setupProfileMediaButtons() {
    if (this.profileMediaListenersBound) return;

    const avatarButton = document.querySelector<HTMLElement>(
      '#social-profile-edit-avatar',
    );
    const bannerButton = document.querySelector<HTMLElement>(
      '#social-profile-edit-banner',
    );
    const avatarInput = document.querySelector<HTMLInputElement>(
      '#social-profile-avatar-input',
    );
    const bannerInput = document.querySelector<HTMLInputElement>(
      '#social-profile-banner-input',
    );

    if (!avatarButton || !bannerButton || !avatarInput || !bannerInput) return;
    this.profileMediaListenersBound = true;

    avatarButton.addEventListener('click', () => avatarInput.click());
    bannerButton.addEventListener('click', () => bannerInput.click());

    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files?.[0];
      avatarInput.value = '';
      if (file) this.openProfileMediaCropper(file, 'avatar');
    });

    bannerInput.addEventListener('change', () => {
      const file = bannerInput.files?.[0];
      bannerInput.value = '';
      if (file) this.openProfileMediaCropper(file, 'banner');
    });

    document
      .querySelector<HTMLElement>('#social-crop-close')
      ?.addEventListener('click', () => this.closeProfileMediaCropper());
    document
      .querySelector<HTMLElement>('#social-crop-cancel')
      ?.addEventListener('click', () => this.closeProfileMediaCropper());
    document
      .querySelector<HTMLElement>('#social-crop-confirm')
      ?.addEventListener('click', () => this.confirmProfileMediaCrop());

    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');
    zoomInput?.addEventListener('input', () => {
      if (!this.profileMediaCropState) return;
      this.profileMediaCropState.zoom = Number(zoomInput.value) || 1;
      this.drawProfileMediaCrop();
    });

    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    canvas?.addEventListener('pointerdown', (event) => {
      if (!this.profileMediaCropState) return;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      this.profileMediaCropState.dragging = true;
      this.profileMediaCropState.lastX = event.clientX;
      this.profileMediaCropState.lastY = event.clientY;
    });
    canvas?.addEventListener('pointermove', (event) => {
      const state = this.profileMediaCropState;
      if (!state?.dragging) return;
      state.offsetX += event.clientX - state.lastX;
      state.offsetY += event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      this.drawProfileMediaCrop();
    });
    canvas?.addEventListener('pointerup', (event) => {
      if (!this.profileMediaCropState) return;
      canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove('is-dragging');
      this.profileMediaCropState.dragging = false;
    });
  }

  openProfileMediaCropper(file: File, type: ProfileMediaType) {
    if (!file.type.startsWith('image/')) {
      if (window.toastManager) {
        window.toastManager.error(
          this.getSocialTranslation(
            'social.imageFilesOnly',
            'Please select an image file.',
          ),
        );
      }
      return;
    }

    this.closeProfileMediaCropper();

    const modal = document.querySelector<HTMLElement>(
      '#social-profile-media-crop-modal',
    );
    const title = document.querySelector<HTMLElement>('#social-crop-title');
    const frame = document.querySelector<HTMLElement>('#social-crop-frame');
    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');
    if (!modal || !frame || !zoomInput) return;

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      this.profileMediaCropState = {
        type,
        file,
        objectUrl,
        image,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        dragging: false,
        lastX: 0,
        lastY: 0,
      };
      frame.classList.toggle('is-avatar', type === 'avatar');
      frame.classList.toggle('is-banner', type === 'banner');
      if (title) {
        title.textContent =
          type === 'avatar'
            ? this.getSocialTranslation(
                'social.cropProfilePhoto',
                'Crop profile photo',
              )
            : this.getSocialTranslation('social.cropBanner', 'Crop banner');
      }
      zoomInput.value = '1';
      modal.style.display = 'flex';
      this.drawProfileMediaCrop();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (window.toastManager) {
        window.toastManager.error(
          this.getSocialTranslation(
            'social.failedToLoadImage',
            'Failed to load image.',
          ),
        );
      }
    };
    image.src = objectUrl;
  }

  closeProfileMediaCropper(clearState = true) {
    this.setProfileMediaUploadLoading(false);
    const modal = document.querySelector<HTMLElement>(
      '#social-profile-media-crop-modal',
    );
    if (modal) modal.style.display = 'none';
    if (clearState && this.profileMediaCropState) {
      URL.revokeObjectURL(this.profileMediaCropState.objectUrl);
      this.profileMediaCropState = null;
    }
  }

  setProfileMediaUploadLoading(isLoading: boolean) {
    const overlay = document.querySelector<HTMLElement>(
      '#social-crop-upload-loading',
    );
    const lottieContainer = document.querySelector<HTMLElement>(
      '#social-crop-upload-lottie',
    );
    const closeButton =
      document.querySelector<HTMLButtonElement>('#social-crop-close');
    const cancelButton = document.querySelector<HTMLButtonElement>(
      '#social-crop-cancel',
    );
    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');

    overlay?.classList.toggle('is-active', isLoading);
    if (overlay) overlay.style.display = isLoading ? 'flex' : 'none';
    if (closeButton) closeButton.disabled = isLoading;
    if (cancelButton) cancelButton.disabled = isLoading;
    if (zoomInput) zoomInput.disabled = isLoading;

    if (isLoading && lottieContainer && window.lottie) {
      if (this.profileMediaUploadAnim) return;
      lottieContainer.innerHTML = '';
      this.profileMediaUploadAnim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '../images/loading.json',
      });
      return;
    }

    if (!isLoading && this.profileMediaUploadAnim) {
      try {
        this.profileMediaUploadAnim.destroy();
      } catch (error) {
        console.warn('Error destroying upload animation:', error);
      }
      this.profileMediaUploadAnim = null;
      if (lottieContainer) lottieContainer.innerHTML = '';
    }
  }

  getProfileMediaOutputSize(type: ProfileMediaType) {
    return type === 'avatar'
      ? { width: 512, height: 512 }
      : { width: 1500, height: 500 };
  }

  drawProfileMediaCrop() {
    const state = this.profileMediaCropState;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    if (!state || !canvas) return;

    const { width, height } = this.getProfileMediaOutputSize(state.type);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coverScale = Math.max(
      width / state.image.naturalWidth,
      height / state.image.naturalHeight,
    );
    const scale = coverScale * state.zoom;
    const drawWidth = state.image.naturalWidth * scale;
    const drawHeight = state.image.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
    state.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.offsetX));
    state.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.offsetY));
    const x = (width - drawWidth) / 2 + state.offsetX;
    const y = (height - drawHeight) / 2 + state.offsetY;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(state.image, x, y, drawWidth, drawHeight);
  }

  async confirmProfileMediaCrop() {
    const state = this.profileMediaCropState;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    const confirmButton = document.querySelector<HTMLButtonElement>(
      '#social-crop-confirm',
    );
    if (!state || !canvas || !this.authToken || !this.userData) return;
    if (confirmButton?.disabled) return;

    if (confirmButton) confirmButton.disabled = true;
    this.setProfileMediaUploadLoading(true);

    try {
      this.drawProfileMediaCrop();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('Crop export failed');

      const fileName =
        state.type === 'avatar' ? 'profile-photo.jpg' : 'profile-banner.jpg';
      const formData = new FormData();
      formData.append('idToken', this.authToken);
      formData.append(
        'file',
        new File([blob], fileName, { type: 'image/jpeg' }),
      );
      formData.append('mediaType', state.type);

      const uploadResponse = await this.fetchWithAuth(
        `${this.API_URL}/upload-profile-photo`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const uploadResponseText = await uploadResponse.text();
      let uploadData: any = {};
      try {
        uploadData = uploadResponseText ? JSON.parse(uploadResponseText) : {};
      } catch (parseError) {
        uploadData = { message: uploadResponseText };
      }
      const uploadedUrl =
        uploadData.secureUrl || uploadData.secure_url || uploadData.url || '';
      const uploadedPublicId =
        uploadData.publicId || uploadData.public_id || '';

      if (!uploadResponse.ok || !uploadedUrl) {
        const uploadError =
          uploadData.message ||
          uploadData.error?.message ||
          uploadData.error ||
          uploadResponseText ||
          `Upload failed (${uploadResponse.status})`;
        console.error('[Social] Profile media upload failed:', {
          status: uploadResponse.status,
          response: uploadData,
        });
        throw new Error(uploadError);
      }

      const fieldUrl = state.type === 'avatar' ? 'photoURL' : 'bannerURL';
      const fieldPublicId =
        state.type === 'avatar' ? 'photoPublicId' : 'bannerPublicId';

      const writeResponse = await this.fetchWithAuth(
        `${this.API_URL}/write/users/${this.userData.localId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [fieldUrl]: uploadedUrl,
            [fieldPublicId]: uploadedPublicId,
            _idToken: this.authToken,
          }),
        },
      );
      if (!writeResponse.ok) {
        const writeErrorText = await writeResponse.text();
        throw new Error(writeErrorText || 'Profile update failed');
      }

      this.applyProfileMedia(state.type, uploadedUrl);
      this.closeProfileMediaCropper();
      if (window.toastManager) {
        window.toastManager.success(
          this.getSocialTranslation(
            'social.profileUpdated',
            'Profile updated.',
          ),
        );
      }
    } catch (error) {
      console.error('Error uploading profile media:', error);
      const message =
        error instanceof Error
          ? error.message
          : this.getSocialTranslation(
              'social.failedToUploadImage',
              'Failed to upload image.',
            );
      if (window.toastManager) window.toastManager.error(message);
    } finally {
      if (confirmButton) confirmButton.disabled = false;
      this.setProfileMediaUploadLoading(false);
    }
  }

  applyProfileMedia(type: ProfileMediaType, url?: string) {
    if (type === 'avatar') {
      const avatar = document.querySelector<HTMLImageElement>(
        '#social-profile-avatar',
      );
      if (avatar && url) avatar.src = url;
      return;
    }

    const banner = document.querySelector<HTMLImageElement>(
      '#social-profile-banner',
    );
    const bannerContainer = banner?.closest<HTMLElement>(
      '.social-profile-banner',
    );
    if (!banner || !bannerContainer) return;

    if (url) {
      banner.src = url;
      bannerContainer.classList.add('has-image');
    } else {
      banner.removeAttribute('src');
      bannerContainer.classList.remove('has-image');
    }
  }

  async loadUserProfile() {
    if (!this.authToken || !this.userData) {
      console.error('No auth token or user data available');
      return;
    }

    try {
      const userId = this.userData.localId;

      const response = await fetch(
        `${this.API_URL}/read/users/${userId}`,
      );
      const data: any = await response.json();

      if (response.ok && !data.error) {
        const userFields = this.normalizeUserFields(data);

        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        const emailEl = document.querySelector<HTMLElement>(
          '#social-profile-email',
        );
        const currentEmailEl = document.querySelector<HTMLElement>(
          '#social-current-email',
        );
        const avatarEl = document.querySelector<HTMLImageElement>(
          '#social-profile-avatar',
        );
        const bannerEl = document.querySelector<HTMLImageElement>(
          '#social-profile-banner',
        );
        const usernameInput = document.querySelector<HTMLInputElement>(
          '#social-edit-username',
        );
        const privacyVisibility = document.querySelector<HTMLSelectElement>(
          '#social-privacy-visibility',
        );
        const privacySync = document.querySelector<HTMLInputElement>(
          '#social-privacy-sync',
        );

        if (usernameEl) usernameEl.textContent = userFields.username || 'User';
        this.applyProfileBadges('#social-profile-badges', userFields.badges);
        const canCustomize = this.canCustomizeProfile(userFields.badges);
        const profileTheme = canCustomize
          ? this.parseProfileTheme(userFields.profileTheme)
          : null;
        this.applyProfileTheme('self', profileTheme);
        this.toggleProfileCustomizationSection(
          canCustomize,
          profileTheme,
          userFields.badges,
        );
        if (emailEl) emailEl.textContent = this.userData.email || '';
        if (currentEmailEl) {
          currentEmailEl.textContent = this.userData.email || '';
        }
        if (avatarEl)
          avatarEl.src =
            userFields.photoURL || 'https://files.catbox.moe/xry0hs.png';
        if (bannerEl) this.applyProfileMedia('banner', userFields.bannerURL);
        if (usernameInput) usernameInput.value = userFields.username || '';

        if (userFields.username && this.userData) {
          this.userData.displayName = userFields.username;
          if (window.electronAPI?.store) {
            await window.electronAPI.store.set(
              'social.userData',
              this.userData,
            );
          }
          window.dispatchEvent(new CustomEvent('social-account-updated'));
        }

        if (
          userFields.privacySettings &&
          typeof userFields.privacySettings === 'object'
        ) {
          const privacy = userFields.privacySettings;
          if (privacyVisibility) {
            privacyVisibility.value = privacy.modsVisibility || 'global';
          }
          if (privacySync) {
            privacySync.checked = privacy.allowSync !== false;
          }
        } else {
          if (privacyVisibility) privacyVisibility.value = 'global';
          if (privacySync) privacySync.checked = true;
        }

        await this.loadAutoDownloadSettingsToUI();

        await this.loadUserStats();

        setTimeout(() => {
          if (
            document
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="discover"]',
              )
              ?.classList.contains('active')
          ) {
            this.loadDiscover();
          } else if (
            document
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="people-downloads"]',
              )
              ?.classList.contains('active')
          ) {
            this.loadFeed();
          }
        }, 100);
      } else {
        console.error('Failed to load user profile:', data);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToLoadProfileData');
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToLoadProfile');
      }
    }
  }

  async loadUserStats() {
    if (!this.authToken || !this.userData) return;

    try {
      const userId = this.userData.localId;

      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      let modsCount = 0;
      if (Array.isArray(mods)) {
        modsCount = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return modUserId === userId || (username && modPseudo === username);
        }).length;
      }

      const friendsData = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      let friendsCount = 0;
      if (friendsData.friends && Array.isArray(friendsData.friends)) {
        friendsCount = friendsData.friends.filter(
          (f) => f.status === 'accepted',
        ).length;
      }

      const modsStatEl =
        document.querySelector<HTMLElement>('#social-stat-mods');
      const friendsStatEl = document.querySelector<HTMLElement>(
        '#social-stat-friends',
      );

      if (modsStatEl) modsStatEl.textContent = `${modsCount}`;
      if (friendsStatEl) friendsStatEl.textContent = `${friendsCount}`;
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  setupProfileButtons() {
    if (this.socialProfileButtonsBound) return;
    this.socialProfileButtonsBound = true;

    const saveUsernameBtn = document.querySelector<HTMLElement>(
      '#social-save-username',
    );
    if (saveUsernameBtn) {
      saveUsernameBtn.addEventListener('click', async () => {
        await this.updateUsername();
      });
    }

    const changeEmailForm = document.querySelector<HTMLFormElement>(
      '#social-change-email-form',
    );
    if (changeEmailForm) {
      changeEmailForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.updateEmail();
      });
    }

    const passwordResetButton = document.querySelector<HTMLButtonElement>(
      '#social-send-password-reset',
    );
    if (passwordResetButton) {
      passwordResetButton.addEventListener('click', async () => {
        await this.sendPasswordReset();
      });
    }

    const savePrivacyBtn = document.querySelector<HTMLElement>(
      '#social-save-privacy',
    );
    if (savePrivacyBtn) {
      savePrivacyBtn.addEventListener('click', async () => {
        await this.updatePrivacySettings();
      });
    }

    const saveAutoDownloadBtn = document.querySelector<HTMLElement>(
      '#social-save-auto-download',
    );
    if (saveAutoDownloadBtn) {
      saveAutoDownloadBtn.addEventListener('click', async () => {
        await this.updateAutoDownloadSettings();
      });
    }

    const logoutBtn = document.querySelector<HTMLElement>('#social-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.logout();
      });
    }

    const addFriendForm = document.querySelector<HTMLFormElement>(
      '#social-add-friend-form',
    );
    if (addFriendForm) {
      addFriendForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.addFriendByUsername();
      });
    }

    this.setupProfileMediaButtons();
    this.setupProfileThemeControls();

    // Go to Settings button
    const goToSettingsBtn = document.querySelector<HTMLElement>(
      '#social-go-to-settings-btn',
    );
    if (goToSettingsBtn) {
      goToSettingsBtn.addEventListener('click', () => {
        // Switch to Settings tab
        const settingsTab = document.querySelector<HTMLElement>(
          '[data-tab="settings"]',
        );
        if (settingsTab) {
          settingsTab.click();
          // After a small delay, switch to the Social settings sub-tab
          setTimeout(() => {
            const socialSettingsBtn = document.querySelector<HTMLElement>(
              '[data-settings-tab="social"]',
            );
            if (socialSettingsBtn) {
              socialSettingsBtn.click();
            }
          }, 100);
        }
      });
    }

    if (this.socialDocumentClickListenerBound) return;
    this.socialDocumentClickListenerBound = true;

    document.addEventListener('click', async (e) => {
      const clickedElement = e.target as HTMLElement;
      const removeBtn = clickedElement.closest('.social-remove-friend-btn');

      if (
        removeBtn ||
        clickedElement.classList.contains('social-remove-friend-btn') ||
        (clickedElement.tagName === 'I' &&
          clickedElement.closest('.social-remove-friend-btn'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!this.authToken) {
          console.error('[Social] Cannot remove friend: user not logged in');
          return false;
        }

        this.hideRegisterModal();
        this.hideForgotPasswordModal();

        const btn =
          clickedElement.closest('.social-remove-friend-btn') || clickedElement;
        const relationId = btn.getAttribute('data-relation-id');
        const friendId = btn.getAttribute('data-friend-id');

        console.log('[Social] Remove friend button clicked:', {
          relationId,
          friendId,
          clickedElement: clickedElement.tagName,
          button: btn,
        });

        if (relationId) {
          this.removeFriend(relationId, friendId);
        } else {
          console.error(
            '[Social] No relationId found on remove friend button. Button:',
            btn,
          );
        }
        return false;
      }

      if (this.authToken && this.userData) {
        if (
          clickedElement.closest('#social-remove-friend-modal') ||
          clickedElement.closest('#social-register-modal') ||
          clickedElement.closest('#social-forgot-modal')
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      if (clickedElement.closest('.social-mod-download-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = clickedElement.closest('.social-mod-download-btn');
        const link = btn!.getAttribute('data-link');
        if (
          link &&
          link.startsWith('fightplanner:') &&
          window.electronAPI &&
          window.electronAPI.openFightPlannerLink
        ) {
          window.electronAPI.openFightPlannerLink(link);
        }
        return false;
      }

      const visibilityBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-mod-visibility-btn',
      );
      if (visibilityBtn) {
        e.preventDefault();
        e.stopPropagation();
        await this.updateSocialModVisibility(visibilityBtn);
        return false;
      }

      const carouselButton = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-carousel-btn',
      );
      if (carouselButton) {
        e.preventDefault();
        e.stopPropagation();
        const direction =
          carouselButton.getAttribute('data-direction') === 'next' ? 1 : -1;
        this.scrollGameBananaCarousel(direction);
        return false;
      }

      const socialFeedPageButton = clickedElement.closest<HTMLButtonElement>(
        '.social-feed-page-btn',
      );
      if (socialFeedPageButton) {
        e.preventDefault();
        e.stopPropagation();
        if (socialFeedPageButton.disabled) return false;

        const action = socialFeedPageButton.getAttribute('data-page-action');
        const nextPage =
          action === 'next' ? this.socialFeedPage + 1 : this.socialFeedPage - 1;
        this.setSocialFeedPage(nextPage);
        return false;
      }

      const featuredCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card-featured',
      );
      if (featuredCard) {
        const featuredPosition = featuredCard.getAttribute(
          'data-featured-position',
        );
        const featuredIndex = Number(
          featuredCard.getAttribute('data-featured-index'),
        );

        if (featuredPosition !== 'active' && Number.isFinite(featuredIndex)) {
          e.preventDefault();
          e.stopPropagation();
          const total = this.gameBananaFeaturedMods.length;
          const nextIndex = (this.gameBananaFeaturedIndex + 1) % total;
          const direction = featuredIndex === nextIndex ? 1 : -1;
          this.updateGameBananaFeaturedStack(featuredIndex, direction);
          return false;
        }
      }

      const pageButton = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-page-btn',
      );
      if (pageButton) {
        e.preventDefault();
        e.stopPropagation();
        if (pageButton.disabled) return false;

        const action = pageButton.getAttribute('data-page-action');
        const nextPage =
          action === 'next'
            ? this.gameBananaModsPage + 1
            : this.gameBananaModsPage - 1;
        await this.loadGameBananaModsPage(nextPage);
        return false;
      }

      if (clickedElement.closest('.social-gamebanana-detail-back')) {
        e.preventDefault();
        e.stopPropagation();
        await this.returnFromGameBananaDetail();
        return false;
      }

      const requirementInstallBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-install',
      );
      if (requirementInstallBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (requirementInstallBtn.disabled) return false;

        const pluginName =
          requirementInstallBtn.getAttribute('data-plugin-name');
        const repo = requirementInstallBtn.getAttribute('data-plugin-repo');
        if (pluginName && repo) {
          requirementInstallBtn.disabled = true;
          await this.installGameBananaRequirement(pluginName, repo);
          await window.pluginManager?.refreshPlugins?.();
          requirementInstallBtn.disabled = false;
          if (this.gameBananaCurrentDetail) {
            this.renderGameBananaDetailPage(
              this.gameBananaCurrentDetail.details,
              this.gameBananaCurrentDetail.fallback,
              false,
              this.gameBananaCurrentDetail.files,
            );
          }
        }
        return false;
      }

      const requirementLinkBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-link',
      );
      if (requirementLinkBtn) {
        e.preventDefault();
        e.stopPropagation();

        const url = requirementLinkBtn.getAttribute('data-url');
        if (url && window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const requirementSearchBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-search',
      );
      if (requirementSearchBtn) {
        e.preventDefault();
        e.stopPropagation();

        const query = requirementSearchBtn.getAttribute('data-query') || '';
        const provider =
          requirementSearchBtn.getAttribute('data-provider') || 'google';
        const url = this.getGameBananaRequirementSearchUrl(query, provider);
        if (window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const galleryThumb = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-gallery-thumb',
      );
      if (galleryThumb) {
        e.preventDefault();
        e.stopPropagation();
        const gallery = galleryThumb.closest<HTMLElement>(
          '.social-gamebanana-gallery',
        );
        const index = Number(galleryThumb.getAttribute('data-gallery-index'));
        if (gallery && Number.isFinite(index)) {
          this.updateGameBananaGallery(gallery, index);
        }
        return false;
      }

      const galleryNav = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-gallery-nav',
      );
      if (galleryNav) {
        e.preventDefault();
        e.stopPropagation();
        const gallery = galleryNav.closest<HTMLElement>(
          '.social-gamebanana-gallery',
        );
        const currentIndex = Number(
          gallery?.getAttribute('data-gallery-index') || 0,
        );
        const direction = Number(
          galleryNav.getAttribute('data-gallery-direction') || 0,
        );
        if (gallery && Number.isFinite(currentIndex)) {
          this.updateGameBananaGallery(gallery, currentIndex + direction);
        }
        return false;
      }

      const finishedWorkBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-finished-work-btn',
      );
      if (finishedWorkBtn) {
        e.preventDefault();
        e.stopPropagation();

        const modelName = finishedWorkBtn.getAttribute('data-gb-model');
        const submissionId = finishedWorkBtn.getAttribute('data-gb-id');
        if (modelName && submissionId) {
          this.gameBananaLastDetailSource = {
            modelName,
            submissionId,
            sourceKind: 'grid',
            page: this.gameBananaModsPage,
            scrollTop: this.getSocialMainScrollTop(),
          };
          await this.showGameBananaSubmissionDetails(modelName, submissionId);
        }
        return false;
      }

      const externalGameBananaBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-external-btn',
      );
      if (externalGameBananaBtn) {
        e.preventDefault();
        e.stopPropagation();

        const url = externalGameBananaBtn.getAttribute('data-url');
        if (url && window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const fileDownloadBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-file-download-btn',
      );
      if (fileDownloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (fileDownloadBtn.disabled) return false;

        const downloadUrl = fileDownloadBtn.getAttribute('data-download-url');
        if (downloadUrl && window.electronAPI?.openFightPlannerLink) {
          const originalContent = fileDownloadBtn.innerHTML;
          fileDownloadBtn.disabled = true;

          try {
            const shouldCheckDependencies =
              await this.shouldCheckGameBananaDependenciesOnDownload();
            fileDownloadBtn.innerHTML = shouldCheckDependencies
              ? '<i class="bi bi-hourglass-split"></i><span>Checking</span>'
              : '<i class="bi bi-download"></i><span>Downloading</span>';

            const shouldContinue =
              await this.confirmMissingGameBananaRequirements(downloadUrl);
            if (!shouldContinue) return false;

            this.registerPendingGameBananaSocialDownload(downloadUrl);
            const protocolUrl = downloadUrl.startsWith('fightplanner:')
              ? downloadUrl
              : `fightplanner:${downloadUrl}`;
            await window.electronAPI.openFightPlannerLink(protocolUrl);
          } finally {
            fileDownloadBtn.disabled = false;
            fileDownloadBtn.innerHTML = originalContent;
          }
        }
        return false;
      }

      const gameBananaCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card',
      );
      if (gameBananaCard) {
        e.preventDefault();
        e.stopPropagation();
        const modelName = gameBananaCard.getAttribute('data-gb-model');
        const submissionId = gameBananaCard.getAttribute('data-gb-id');
        if (modelName && submissionId) {
          this.captureGameBananaDiscoverSnapshot();
          this.gameBananaLastDetailSource = {
            modelName,
            submissionId,
            sourceKind: this.getGameBananaCardSourceKind(gameBananaCard),
            page: this.gameBananaModsPage,
            scrollTop: this.getSocialMainScrollTop(),
          };
          await this.showGameBananaSubmissionDetails(
            modelName,
            submissionId,
            gameBananaCard,
          );
        }
        return false;
      }

      const socialGameBananaCard = clickedElement.closest<HTMLElement>(
        '.social-mod-card.has-gamebanana-detail',
      );
      if (
        socialGameBananaCard &&
        !clickedElement.closest('.social-creator-link') &&
        !clickedElement.closest('.social-mod-download-btn') &&
        !clickedElement.closest('.social-mod-visibility-btn')
      ) {
        e.preventDefault();
        e.stopPropagation();
        await this.openSocialModGameBananaDetails(socialGameBananaCard);
        return false;
      }

      if (
        clickedElement.closest('.social-creator-link') &&
        !clickedElement.closest('.social-remove-friend-btn') &&
        !clickedElement.closest('.social-accept-friend-btn') &&
        !clickedElement.closest('.social-reject-friend-btn') &&
        !clickedElement.closest('.social-cancel-friend-btn')
      ) {
        const creatorLink = clickedElement.closest('.social-creator-link');
        const username = creatorLink!.getAttribute('data-username');
        const userId = creatorLink!.getAttribute('data-userid');
        if (
          username &&
          !clickedElement.closest('.social-mod-download-btn') &&
          !clickedElement.closest('.social-mod-visibility-btn')
        ) {
          this.showUserProfile(username, userId);
        }
      }

      if (clickedElement.closest('#social-back-btn')) {
        this.switchSection('people-downloads');
      }

      if (clickedElement.closest('#social-add-friend-btn')) {
        const btn = clickedElement.closest(
          '#social-add-friend-btn',
        ) as HTMLButtonElement;

        let userId = btn!.getAttribute('data-userid');

        const username =
          btn!.getAttribute('data-username') || this.viewedUsername;

        if (!userId) {
          userId = this.viewedUserId;
          if (!userId && username) {
            const addFriendText = document.querySelector<HTMLElement>(
              '#social-add-friend-text',
            );
            if (addFriendText) {
              addFriendText.textContent = this.getSocialTranslation(
                'social.findingUser',
                'Finding user...',
              );
            }
            btn.disabled = true;

            try {
              const modsData = await this.fetchWithCache(
                `${this.API_URL}/list/links`,
                {},
                'links',
              );

              // Handle both array and paginated response
              const mods: {
                userId?: string;
                pseudo?: string;
                creator?: string;
              }[] = Array.isArray(modsData)
                ? modsData
                : modsData.documents || [];

              if (Array.isArray(mods)) {
                const userMod = mods.find(
                  (mod) => (mod.pseudo || mod.creator) === username,
                );

                if (userMod && userMod.userId) {
                  userId = userMod.userId;
                  this.viewedUserId = userId;
                  btn.setAttribute('data-userid', userId);
                  btn.disabled = false;
                  if (addFriendText) {
                    addFriendText.textContent = this.getSocialTranslation(
                      'social.addFriend',
                      'Add Friend',
                    );
                  }
                }
              }
            } catch (err) {
              console.error('[Social] Error finding userId:', err);
              btn.disabled = false;
              if (addFriendText) {
                addFriendText.textContent = this.getSocialTranslation(
                  'social.addFriend',
                  'Add Friend',
                );
              }
            }
          }
        }

        if (userId) {
          this.sendFriendRequest(userId);
        } else {
          if (window.toastManager)
            window.toastManager.error(
              this.getSocialTranslation(
                'social.userIdNotFound',
                'Could not find user ID. Please try again.',
              ),
            );
          const addFriendText = document.querySelector<HTMLElement>(
            '#social-add-friend-text',
          );
          if (addFriendText) {
            addFriendText.textContent = this.getSocialTranslation(
              'social.addFriend',
              'Add Friend',
            );
          }
          btn.disabled = false;
        }
      }

      const target = e.target as HTMLElement;

      if (target.closest('.social-accept-friend-btn')) {
        const btn = target.closest('.social-accept-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.acceptFriendRequest(requestId);
        }
      }

      if (target.closest('.social-reject-friend-btn')) {
        const btn = target.closest('.social-reject-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.rejectFriendRequest(requestId);
        }
      }

      if (target.closest('.social-cancel-friend-btn')) {
        const btn = target.closest('.social-cancel-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.cancelFriendRequest(requestId);
        }
      }
    });
  }

  async updateAddFriendButton(username, userId) {
    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );

    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

    if (!addFriendBtn) return;

    if (!this.userData) {
      addFriendBtn.style.display = 'none';
      return;
    }

    const targetUserId = userId || this.viewedUserId;

    if (targetUserId && targetUserId === this.userData.localId) {
      addFriendBtn.style.display = 'none';
      return;
    }

    addFriendBtn.style.display = 'block';
    addFriendBtn.style.opacity = '0';
    addFriendBtn.style.transform = 'translateY(-10px)';
    addFriendBtn.disabled = true;
    if (addFriendText) {
      addFriendText.textContent = this.getSocialTranslation(
        'social.addFriend',
        'Add Friend',
      );
    }

    setTimeout(() => {
      addFriendBtn.style.transition = 'all 0.3s ease';
      addFriendBtn.style.opacity = '1';
      addFriendBtn.style.transform = 'translateY(0)';
    }, 100);

    this.checkFriendshipStatus(
      addFriendBtn,
      addFriendText,
      targetUserId,
      username,
    );
  }

  async checkFriendshipStatus(
    addFriendBtn,
    addFriendText,
    targetUserId,
    username,
  ) {
    if (!targetUserId) {
      addFriendBtn.disabled = false;
      if (addFriendText) {
        addFriendText.textContent = this.getSocialTranslation(
          'social.addFriend',
          'Add Friend',
        );
      }
      addFriendBtn.setAttribute('data-username', username);
      return;
    }

    try {
      const data = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      if (data.friends && Array.isArray(data.friends)) {
        const currentUserId = this.userData!.localId;

        const existingRelation = data.friends.find((f) => {
          const user1 = f.user_1 || f.user1;
          const user2 = f.user_2 || f.user2;
          return (
            (user1 === currentUserId && user2 === targetUserId) ||
            (user1 === targetUserId && user2 === currentUserId)
          );
        });

        if (existingRelation) {
          const status = existingRelation.status;
          if (status === 'accepted') {
            addFriendBtn.style.transition = 'all 0.3s ease';
            addFriendBtn.style.opacity = '0';
            addFriendBtn.style.transform = 'translateY(-10px)';
            setTimeout(() => {
              addFriendBtn.style.display = 'none';
            }, 300);
          } else if (status === 'pending') {
            const isSender =
              existingRelation.user_1 === currentUserId ||
              existingRelation.user1 === currentUserId;
            addFriendBtn.disabled = true;
            if (addFriendText)
              addFriendText.textContent = isSender
                ? this.getSocialTranslation(
                    'social.requestSent',
                    'Request Sent',
                  )
                : this.getSocialTranslation(
                    'social.pendingRequest',
                    'Pending Request',
                  );
            addFriendBtn.setAttribute('data-request-id', existingRelation.id);
          }
        } else {
          addFriendBtn.disabled = false;
          if (addFriendText) {
            addFriendText.textContent = this.getSocialTranslation(
              'social.addFriend',
              'Add Friend',
            );
          }
          addFriendBtn.setAttribute('data-userid', targetUserId);
        }
      } else {
        addFriendBtn.disabled = false;
        if (addFriendText) {
          addFriendText.textContent = this.getSocialTranslation(
            'social.addFriend',
            'Add Friend',
          );
        }
        addFriendBtn.setAttribute('data-userid', targetUserId);
      }
    } catch (error) {
      console.error('[Social] Error checking friendship:', error);
      addFriendBtn.disabled = false;
      if (addFriendText) {
        addFriendText.textContent = this.getSocialTranslation(
          'social.addFriend',
          'Add Friend',
        );
      }
      if (targetUserId) addFriendBtn.setAttribute('data-userid', targetUserId);
    }
  }

  async sendFriendRequest(targetUserId) {
    if (!this.authToken || !this.userData) return;

    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );
    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

    if (addFriendBtn) {
      addFriendBtn.disabled = true;
      if (addFriendText) {
        addFriendText.textContent = this.getSocialTranslation(
          'social.sending',
          'Sending...',
        );
      }
    }

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/create-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentUserId: this.userData.localId,
            targetUserId: targetUserId,
            status: 'pending',
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestSent');
        if (addFriendText) {
          addFriendText.textContent = this.getSocialTranslation(
            'social.requestSent',
            'Request Sent',
          );
        }
        if (addFriendBtn) {
          addFriendBtn.disabled = true;
          if (data.friendRequestId)
            addFriendBtn.setAttribute('data-request-id', data.friendRequestId);
        }
        this.invalidateCache('friends');
      } else {
        const errorMsg = data.error || 'toasts.failedToSendFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
        if (addFriendBtn) addFriendBtn.disabled = false;
        if (addFriendText) {
          addFriendText.textContent = this.getSocialTranslation(
            'social.addFriend',
            'Add Friend',
          );
        }
      }
    } catch (error) {
      console.error('[Social] Error sending friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToSendFriendRequest');
      if (addFriendBtn) addFriendBtn.disabled = false;
      if (addFriendText) {
        addFriendText.textContent = this.getSocialTranslation(
          'social.addFriend',
          'Add Friend',
        );
      }
    }
  }

  getSocialTranslation(key, fallback, params = {}) {
    const translation = window.i18n?.t?.(key, params);
    return translation && translation !== key ? translation : fallback;
  }

  setAddFriendByUsernameFeedback(message, type = '') {
    const feedback = document.querySelector<HTMLElement>(
      '#social-add-friend-feedback',
    );
    if (!feedback) return;

    feedback.textContent = message;
    feedback.classList.toggle('is-error', type === 'error');
    feedback.classList.toggle('is-success', type === 'success');
  }

  setAddFriendByUsernameLoading(isLoading, label = null) {
    const submitBtn = document.querySelector<HTMLButtonElement>(
      '#social-add-friend-submit',
    );
    const submitText = submitBtn?.querySelector<HTMLElement>('span');

    if (submitBtn) submitBtn.disabled = isLoading;
    if (submitText) {
      submitText.textContent =
        label || this.getSocialTranslation('social.addFriend', 'Add Friend');
    }
  }

  async findUserByUsername(username) {
    const response = await this.fetchWithAuth(
      `${this.API_URL}/find-user-by-username`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: this.authToken,
          username,
        }),
      },
    );

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || data.message || 'User lookup failed');
    }

    return data.user || null;
  }

  async getFriendRelationWithUser(targetUserId) {
    const data = await this.fetchWithCache(
      `${this.API_URL}/links-friends`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: this.authToken }),
      },
      'friends',
    );

    if (!data.friends || !Array.isArray(data.friends) || !this.userData) {
      return null;
    }

    const currentUserId = this.userData.localId;
    return data.friends.find((friend) => {
      const { user1, user2 } = this.getFriendRelationUsers(friend);
      return (
        (user1 === currentUserId && user2 === targetUserId) ||
        (user1 === targetUserId && user2 === currentUserId)
      );
    });
  }

  async addFriendByUsername() {
    if (!this.authToken || !this.userData) return;

    const usernameInput = document.querySelector<HTMLInputElement>(
      '#social-add-friend-username',
    );
    const username = usernameInput?.value.trim() || '';

    if (!username) {
      this.setAddFriendByUsernameFeedback(
        this.getSocialTranslation(
          'social.enterFriendUsername',
          'Enter a username.',
        ),
        'error',
      );
      usernameInput?.focus();
      return;
    }

    this.setAddFriendByUsernameFeedback('');
    this.setAddFriendByUsernameLoading(
      true,
      this.getSocialTranslation('social.searchingUser', 'Searching...'),
    );

    try {
      const user = await this.findUserByUsername(username);
      if (!user?.id) {
        this.setAddFriendByUsernameFeedback(
          this.getSocialTranslation('social.userNotFound', 'User not found.'),
          'error',
        );
        return;
      }

      if (user.id === this.userData.localId) {
        this.setAddFriendByUsernameFeedback(
          this.getSocialTranslation(
            'social.cannotAddYourself',
            'You cannot add yourself.',
          ),
          'error',
        );
        return;
      }

      const existingRelation = await this.getFriendRelationWithUser(user.id);
      if (existingRelation) {
        const status = this.getFriendRelationStatus(existingRelation);
        const { user1 } = this.getFriendRelationUsers(existingRelation);

        if (status === 'accepted') {
          this.setAddFriendByUsernameFeedback(
            this.getSocialTranslation(
              'social.alreadyFriends',
              'You are already friends.',
            ),
            'success',
          );
          return;
        }

        if (status === 'pending') {
          const isSender = user1 === this.userData.localId;
          this.setAddFriendByUsernameFeedback(
            isSender
              ? this.getSocialTranslation(
                  'social.friendRequestAlreadySent',
                  'Friend request already sent.',
                )
              : this.getSocialTranslation(
                  'social.friendRequestAlreadyReceived',
                  'This user already sent you a request.',
                ),
            isSender ? 'success' : '',
          );
          return;
        }
      }

      this.setAddFriendByUsernameLoading(
        true,
        this.getSocialTranslation('social.sendingRequest', 'Sending...'),
      );

      const response = await this.fetchWithAuth(
        `${this.API_URL}/create-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentUserId: this.userData.localId,
            targetUserId: user.id,
            status: 'pending',
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to send friend request');
      }

      this.invalidateCache('friends');
      await this.loadFriends();
      if (usernameInput) usernameInput.value = '';

      this.setAddFriendByUsernameFeedback(
        this.getSocialTranslation(
          'social.friendRequestSentTo',
          'Friend request sent.',
          { name: user.username || username },
        ),
        'success',
      );
      if (window.toastManager)
        window.toastManager.success('toasts.friendRequestSent');
    } catch (error) {
      console.error('[Social] Error adding friend by username:', error);
      this.setAddFriendByUsernameFeedback(
        this.getSocialTranslation(
          'social.failedToAddFriend',
          'Failed to add this friend.',
        ),
        'error',
      );
    } finally {
      this.setAddFriendByUsernameLoading(false);
    }
  }

  async acceptFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/accept-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: requestId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestAccepted');

        this.invalidateCache('friends');
        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToAcceptFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error accepting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToAcceptFriendRequest');
    }
  }

  async rejectFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/reject-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: requestId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestRejected');

        this.invalidateCache('friends');
        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRejectFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error rejecting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRejectFriendRequest');
    }
  }

  async cancelFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/reject-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: requestId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestRejected');

        this.invalidateCache('friends');
        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRejectFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error cancelling friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRejectFriendRequest');
    }
  }

  async removeFriend(relationId, friendId) {
    if (!this.authToken) {
      console.error('[Social] Cannot remove friend: no auth token');
      return;
    }

    console.log('[Social] removeFriend called:', { relationId, friendId });

    let friendUsername = 'this friend';
    const removeBtn = document.querySelector<HTMLElement>(
      `.social-remove-friend-btn[data-relation-id="${relationId}"]`,
    );
    if (removeBtn) {
      const friendCard = removeBtn.closest('.social-friend-card');
      if (friendCard) {
        const nameEl = friendCard.querySelector<HTMLElement>(
          '.social-friend-name',
        );
        if (nameEl) {
          friendUsername = nameEl.textContent || 'this friend';
        }
      }
    }

    console.log('[Social] Showing remove friend modal for:', friendUsername);

    this.showRemoveFriendModal(friendUsername, relationId);
  }

  showRemoveFriendModal(friendUsername, relationId) {
    console.log('[Social] showRemoveFriendModal called:', {
      friendUsername,
      relationId,
    });

    if (!this.authToken || !this.userData) {
      console.error(
        '[Social] Cannot show remove friend modal: user not logged in',
      );
      return;
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();

    let modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );

    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        modal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );
      }
    }

    if (!modal) {
      console.error(
        '[Social] Remove friend modal not found in DOM. All modals:',
        document.querySelectorAll<HTMLElement>('.social-modal'),
      );
      if (window.toastManager) {
        window.toastManager.error('toasts.modalNotFound');
      }
      return;
    }

    console.log('[Social] Modal found, setting up...', modal);

    if (!modal.hasAttribute('data-initialized')) {
      this.setupRemoveFriendModal();
      modal.setAttribute('data-initialized', 'true');
    }

    const friendNameEl = modal.querySelector<HTMLElement>(
      '[data-i18n="social.removeFriendConfirm"]',
    );
    if (friendNameEl) {
      const translated =
        window.i18n?.t?.('social.removeFriendConfirm', {
          name: friendUsername,
        }) ||
        `Are you sure you want to remove ${friendUsername} from your friends list?`;
      friendNameEl.textContent = translated;
      console.log('[Social] Friend name set in modal:', friendUsername);
    } else {
      console.error('[Social] Friend name element not found in modal');
    }

    modal.setAttribute('data-relation-id', relationId);
    console.log('[Social] Relation ID stored:', relationId);

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    modal.style.zIndex = '100000';

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

    if (content) {
      content.style.transform = 'translateY(20px)';
      content.style.opacity = '0';
    }

    void modal.offsetHeight;

    requestAnimationFrame(() => {
      modal.style.transition = 'opacity 0.2s ease';
      modal.style.opacity = '1';

      if (content) {
        content.style.transition =
          'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
        content.style.transform = 'translateY(0)';
        content.style.opacity = '1';
      }

      console.log('[Social] Modal should now be visible. Computed styles:', {
        display: window.getComputedStyle(modal).display,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
      });
    });
  }

  hideRemoveFriendModal() {
    const modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );
    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        const tabModal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );

        if (tabModal) {
          tabModal.style.display = 'none';
          tabModal.style.opacity = '0';
        }
      }
      return;
    }

    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.transition = 'none';

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

    if (content) {
      content.style.opacity = '0';
      content.style.transform = 'translateY(20px)';
      content.style.transition = 'none';
    }
  }

  async confirmRemoveFriend(relationId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/reject-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: relationId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        this.hideRemoveFriendModal();
        if (window.toastManager)
          window.toastManager.success('toasts.friendRemoved');

        this.invalidateCache('friends');
        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRemoveFriend';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error removing friend:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRemoveFriend');
    }
  }

  setupRemoveFriendModal() {
    setTimeout(() => {
      const modal = document.querySelector<HTMLElement>(
        '#social-remove-friend-modal',
      );
      if (!modal) {
        console.error('[Social] Remove friend modal not found during setup');
        return;
      }

      console.log('[Social] Setting up remove friend modal');

      modal.style.display = 'none';
      modal.style.opacity = '0';

      const closeBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-close',
      );
      const cancelBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-cancel',
      );
      const confirmBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-confirm',
      );

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const relationId = modal.getAttribute('data-relation-id');
          console.log(
            '[Social] Confirm button clicked, relationId:',
            relationId,
          );
          if (relationId) {
            this.confirmRemoveFriend(relationId);
          }
        });
      }

      this.bindBackdropClose(modal, () => this.hideRemoveFriendModal());
    }, 100);
  }

  async showUserProfile(username: string, userId: string | null = null) {
    this.viewedUserId = userId;
    this.viewedUsername = username;

    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
    if (userModsContent) {
      userModsContent.innerHTML = `<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>${this.escapeHtml(
        this.getSocialTranslation(
          'social.loadingUserMods',
          'Loading user mods...',
        ),
      )}</p></div>`;
      userModsContent.style.opacity = '0.5';
    }

    const usernameEl = document.querySelector<HTMLElement>(
      '#social-user-profile-username',
    );
    const avatarEl = document.querySelector<HTMLImageElement>(
      '#social-user-profile-avatar',
    );
    const bannerEl = document.querySelector<HTMLImageElement>(
      '#social-user-profile-banner',
    );

    if (usernameEl) {
      usernameEl.style.opacity = '0';
      usernameEl.textContent = username;
      setTimeout(() => {
        usernameEl.style.transition = 'opacity 0.3s ease';
        usernameEl.style.opacity = '1';
      }, 10);
    }
    this.applyProfileBadges('#social-user-profile-badges', []);
    this.applyProfileTheme('user', null);
    this.applyUserProfileBanNotice();
    if (avatarEl) {
      avatarEl.style.opacity = '0';
      avatarEl.src = 'https://files.catbox.moe/xry0hs.png';
      setTimeout(() => {
        avatarEl.style.transition = 'opacity 0.3s ease';
        avatarEl.style.opacity = '1';
      }, 10);
    }
    if (bannerEl) {
      bannerEl.removeAttribute('src');
      bannerEl
        .closest<HTMLElement>('.social-user-profile-banner')
        ?.classList.remove('has-image');
    }

    this.switchSection('user-profile');

    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.remove('active');
    });

    this.updateAddFriendButton(username, userId);

    this.loadUserMods(username, userId).then(() => {
      const resolvedUserId = userId || this.viewedUserId;
      if (resolvedUserId && resolvedUserId !== userId) {
        this.checkFriendshipStatus(
          document.querySelector<HTMLElement>('#social-add-friend-btn'),
          document.querySelector<HTMLElement>('#social-add-friend-text'),
          resolvedUserId,
          username,
        );
      }
    });

    if (userModsContent) {
      userModsContent.style.transition = 'opacity 0.3s ease';
      userModsContent.style.opacity = '1';
    }
  }

  async loadUserMods(username, userId: string | null = null) {
    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
    if (!userModsContent || !this.authToken) return;

    try {
      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (Array.isArray(mods)) {
        const userMods = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return (
            (userId && modUserId === userId) ||
            (username && modPseudo === username)
          );
        });

        if (userMods.length > 0 && !userId && userMods[0].userId) {
          userId = userMods[0].userId;
          this.viewedUserId = userId;
        } else if (userMods.length > 0 && userId) {
          this.viewedUserId = userId;
        }

        if (userId) {
          try {
            const userResponse = await fetch(
              `${this.API_URL}/read/users/${userId}`,
            );

            const userData: any = await userResponse.json();

            if (userData.fields || !userData.error) {
              const userFields = this.normalizeUserFields(userData);
              const avatarEl = document.querySelector<HTMLImageElement>(
                '#social-user-profile-avatar',
              );
              const bannerEl = document.querySelector<HTMLImageElement>(
                '#social-user-profile-banner',
              );
              if (avatarEl && userFields.photoURL) {
                avatarEl.style.transition = 'opacity 0.3s ease';
                avatarEl.style.opacity = '0';

                setTimeout(() => {
                  avatarEl.src = userFields.photoURL!;
                  avatarEl.style.opacity = '1';
                }, 150);
              }
              if (bannerEl) {
                const bannerContainer = bannerEl.closest<HTMLElement>(
                  '.social-user-profile-banner',
                );
                if (userFields.bannerURL) {
                  bannerEl.src = userFields.bannerURL;
                  bannerContainer?.classList.add('has-image');
                } else {
                  bannerEl.removeAttribute('src');
                  bannerContainer?.classList.remove('has-image');
                }
              }
              this.applyProfileBadges(
                '#social-user-profile-badges',
                userFields.badges,
              );
              this.applyProfileTheme(
                'user',
                this.canCustomizeProfile(userFields.badges)
                  ? this.parseProfileTheme(userFields.profileTheme)
                  : null,
              );
              this.applyUserProfileBanNotice(userFields);
            }
          } catch (e) {
            console.warn('Failed to fetch user info:', e);
          }
        }

        const modsCountEl = document.querySelector<HTMLElement>(
          '#social-user-stat-mods',
        );
        if (modsCountEl) {
          modsCountEl.style.transform = 'scale(0.8)';
          modsCountEl.style.opacity = '0';
          modsCountEl.textContent = `${userMods.length}`;
          setTimeout(() => {
            modsCountEl.style.transition = 'all 0.3s ease';
            modsCountEl.style.transform = 'scale(1)';
            modsCountEl.style.opacity = '1';
          }, 100);
        }

        userModsContent.style.opacity = '0';
        userModsContent.style.transform = 'translateY(10px)';

        await new Promise((resolve) => setTimeout(resolve, 150));

        if (userMods.length > 0) {
          userModsContent.innerHTML =
            '<div class="social-mods-grid">' +
            userMods.map((mod) => this.renderModCard(mod, false)).join('') +
            '</div>';
        } else {
          userModsContent.innerHTML = `<div class="social-empty-state"><i class="bi bi-collection"></i><p>${this.escapeHtml(
            this.getSocialTranslation(
              'social.noUserMods',
              "This user hasn't shared any mods yet.",
            ),
          )}</p></div>`;
        }

        setTimeout(() => {
          userModsContent.style.transition = 'all 0.4s ease';
          userModsContent.style.opacity = '1';
          userModsContent.style.transform = 'translateY(0)';

          const cards =
            userModsContent.querySelectorAll<HTMLInputElement>(
              '.social-mod-card',
            );

          cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';

            setTimeout(() => {
              card.style.transition = 'all 0.3s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, index * 50);
          });
        }, 50);
      }
    } catch (error) {
      console.error('[Social] Error loading user mods:', error);
      userModsContent.innerHTML = `<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>${this.escapeHtml(
        this.getSocialTranslation(
          'social.failedToLoadUserMods',
          'Failed to load user mods.',
        ),
      )}</p></div>`;
      userModsContent.style.opacity = '1';
      userModsContent.style.transform = 'translateY(0)';
    }
  }
}
