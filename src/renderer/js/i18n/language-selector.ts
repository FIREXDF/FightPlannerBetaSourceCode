class LanguageSelector {
  containerId: string;
  languages: {
    [code: string]: { name: string; flag: string };
  };

  constructor(containerId = 'language-selector-container') {
    this.containerId = containerId;
    this.languages = {
      en: { name: 'English', flag: '🇬🇧' },
      fr: { name: 'Français', flag: '🇫🇷' },
      es: { name: 'Español', flag: '🇪🇸' },
      de: { name: 'Deutsch', flag: '🇩🇪' },
      it: { name: 'Italiano', flag: '🇮🇹' },
      pt: { name: 'Português', flag: '🇵🇹' },
      ja: { name: '日本語', flag: '🇯🇵' },
      ko: { name: '한국어', flag: '🇰🇷' },
      'zh-CN': { name: '简体中文', flag: '🇨🇳' },
      'zh-TW': { name: '繁體中文', flag: '🇹🇼' },
    };
  }

  render() {
    const container = document.querySelector<HTMLElement>(
      `#${this.containerId}`,
    );
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    const availableLocales = window.i18n.getAvailableLocales();
    const currentLocale = window.i18n.getCurrentLocale();

    const select = document.createElement('select');
    select.className = 'language-selector';
    select.id = 'language-select';

    availableLocales.forEach((locale) => {
      const option = document.createElement('option');
      option.value = locale;
      const langInfo = this.languages[locale] || {
        name: locale,
        flag: '🌐',
      };
      option.textContent = `${langInfo.flag} ${langInfo.name}`;
      option.selected = locale === currentLocale;
      select.appendChild(option);
    });

    select.addEventListener('change', async () => {
      const newLocale = select.value;
      await window.i18n.changeLocale(newLocale);
    });

    container.innerHTML = '';
    container.appendChild(select);
  }

  renderDropdown() {
    const container = document.querySelector<HTMLElement>(
      `#${this.containerId}`,
    );
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    const availableLocales = window.i18n.getAvailableLocales();
    const currentLocale = window.i18n.getCurrentLocale();
    const currentLang = this.languages[currentLocale] || {
      name: currentLocale,
      flag: '🌐',
    };

    const dropdown = document.createElement('div');
    dropdown.className = 'language-dropdown';
    dropdown.innerHTML = `
            <button class="language-dropdown-toggle" id="lang-dropdown-toggle">
                <span class="current-lang-flag">${currentLang.flag}</span>
                <span class="current-lang-name">${currentLang.name}</span>
                <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 8L2 4h8L6 8z"/>
                </svg>
            </button>
            <div class="language-dropdown-menu" id="lang-dropdown-menu" style="display: none;">
                ${availableLocales
                  .map((locale) => {
                    const lang = this.languages[locale] || {
                      name: locale,
                      flag: '🌐',
                    };
                    return `
                        <button class="language-option ${locale === currentLocale ? 'active' : ''}" 
                                data-locale="${locale}">
                            <span class="lang-flag">${lang.flag}</span>
                            <span class="lang-name">${lang.name}</span>
                            ${locale === currentLocale ? '<span class="checkmark">✓</span>' : ''}
                        </button>
                    `;
                  })
                  .join('')}
            </div>
        `;

    container.innerHTML = '';
    container.appendChild(dropdown);

    const toggle = dropdown.querySelector<HTMLElement>('#lang-dropdown-toggle');
    const menu = dropdown.querySelector<HTMLElement>('#lang-dropdown-menu');

    toggle!.addEventListener('click', () => {
      const isVisible = menu!.style.display === 'block';
      menu!.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (!dropdown.contains(target)) {
        menu!.style.display = 'none';
      }
    });

    dropdown
      .querySelectorAll<HTMLElement>('.language-option')
      .forEach((option) => {
        option.addEventListener('click', async () => {
          const locale = option.getAttribute('data-locale');
          await window.i18n.changeLocale(locale);
          menu!.style.display = 'none';
          this.updateDropdownCurrent(locale);
        });
      });

    window.addEventListener('localeChanged', (event: CustomEvent) => {
      this.updateDropdownCurrent(event.detail.locale);
    });
  }

  updateDropdownCurrent(locale) {
    const currentLang = this.languages[locale] || {
      name: locale,
      flag: '🌐',
    };
    const toggle = document.querySelector<HTMLElement>('#lang-dropdown-toggle');
    if (toggle) {
      toggle.querySelector<HTMLElement>('.current-lang-flag')!.textContent =
        currentLang.flag;

      toggle.querySelector<HTMLElement>('.current-lang-name')!.textContent =
        currentLang.name;
    }

    document
      .querySelectorAll<HTMLElement>('.language-option')
      .forEach((option) => {
        const optionLocale = option.getAttribute('data-locale');
        option.classList.toggle('active', optionLocale === locale);

        const checkmark = option.querySelector<HTMLElement>('.checkmark');
        if (checkmark) checkmark.remove();

        if (optionLocale === locale) {
          const check = document.createElement('span');
          check.className = 'checkmark';
          check.textContent = '✓';
          option.appendChild(check);
        }
      });
  }

  addLanguage(code, name, flag) {
    this.languages[code] = { name, flag };
    window.i18n.addLocale(code);
  }
}

if (typeof window !== 'undefined') {
  window.LanguageSelector = LanguageSelector;
}

export { type LanguageSelector };
