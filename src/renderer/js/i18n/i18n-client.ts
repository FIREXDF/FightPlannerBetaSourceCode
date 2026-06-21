class I18nClient {
  currentLocale: string;
  translations: { [key: string]: any };
  availableLocales: string[];

  constructor() {
    this.currentLocale = 'en';
    this.translations = {};
    this.availableLocales = ['en', 'fr'];
  }

  async init(locale = 'en') {
    this.currentLocale = locale;
    await this.loadTranslations(locale);
    this.updateDOM();
    return this;
  }

  async loadTranslations(locale) {
    try {
      if (window.electronAPI && window.electronAPI.loadLocale) {
        console.log(`Loading locale via IPC: ${locale}`);
        const result = await window.electronAPI.loadLocale(locale);
        if (result.success) {
          this.translations = result.translations;
          console.log(
            `Translations loaded successfully for locale: ${locale} via IPC`,
            Object.keys(this.translations),
          );
          return true;
        } else {
          throw new Error(result.error || 'Failed to load locale via IPC');
        }
      }

      const urls = [
        `../locales/${locale}.json`,
        `../../locales/${locale}.json`,
        `locales/${locale}.json`,
      ];

      let lastError: Error | null = null;
      for (const url of urls) {
        try {
          console.log(`Trying to load translations from: ${url}`);
          const response = await fetch(url);
          if (response.ok) {
            this.translations = await response.json();
            console.log(
              `Translations loaded successfully for locale: ${locale} from ${url}`,
              Object.keys(this.translations),
            );
            return true;
          } else {
            lastError = new Error(
              `HTTP ${response.status}: Failed to load locale: ${locale} from ${url}`,
            );
          }
        } catch (err) {
          lastError = err;
          console.log(`Failed to load from ${url}, trying next...`);
        }
      }

      throw (
        lastError ||
        new Error(`Failed to load locale: ${locale} from all attempted paths`)
      );
    } catch (error) {
      console.error(`Failed to load translations for locale: ${locale}`, error);
      if (locale !== 'en') {
        console.log('Falling back to English...');
        return await this.loadTranslations('en');
      }
      return false;
    }
  }

  async changeLocale(locale) {
    if (!this.availableLocales.includes(locale)) {
      console.warn(`Locale ${locale} is not available`);
      return false;
    }

    console.log(`Changing locale to: ${locale}`);
    this.currentLocale = locale;
    const loaded = await this.loadTranslations(locale);

    if (!loaded) {
      console.error(`Failed to load translations for locale: ${locale}`);
      return false;
    }

    console.log('Translations loaded, updating DOM...');
    this.updateDOM();

    setTimeout(() => {
      this.updateDOM();
      console.log('DOM updated (retry)');
    }, 100);

    localStorage.setItem('fightplanner_locale', locale);

    const event = new CustomEvent('localeChanged', { detail: { locale } });
    window.dispatchEvent(event);

    return true;
  }

  t(key: string, params: Record<string, string> = {}) {
    if (!key) {
      console.warn('Translation key is empty');
      return '';
    }

    if (!this.translations || Object.keys(this.translations).length === 0) {
      console.warn('Translations not loaded yet');
      return key;
    }

    const keys = key.split('.');
    let value = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key} (stopped at: ${k})`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(
        `Translation value is not a string for key: ${key} (got: ${typeof value})`,
      );
      return key;
    }

    return this.interpolate(value, params);
  }

  interpolate(text: string, params: Record<string, string>) {
    return text.replace(/\{\{(\w+)}}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  updateDOM() {
    const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
    console.log(`Updating ${elements.length} elements with data-i18n`);

    let updatedCount = 0;
    elements.forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key) return;

      const params = this.getDataParams(element);
      const translation = this.t(key, params);

      if (
        element.hasAttribute('data-i18n-placeholder') &&
        'placeholder' in element
      ) {
        element.placeholder = translation;
        updatedCount++;
      } else if (element.hasAttribute('data-i18n-title')) {
        element.title = translation;
        updatedCount++;
      } else if (element.hasAttribute('data-i18n-html')) {
        element.innerHTML = translation;
        updatedCount++;
      } else {
        element.textContent = translation;
        updatedCount++;
      }
    });

    console.log(`Updated ${updatedCount} elements`);
    document.documentElement.lang = this.currentLocale;
  }

  getDataParams(element) {
    const params = {};
    const attributes = element.attributes;

    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      if (attr.name.startsWith('data-i18n-param-')) {
        const paramName = attr.name.replace('data-i18n-param-', '');
        params[paramName] = attr.value;
      }
    }

    return params;
  }

  getAvailableLocales() {
    return this.availableLocales;
  }

  getCurrentLocale() {
    return this.currentLocale;
  }

  addLocale(locale) {
    if (!this.availableLocales.includes(locale)) {
      this.availableLocales.push(locale);
    }
  }

  getSavedLocale() {
    return localStorage.getItem('fightplanner_locale') || 'en';
  }
}

const i18n = new I18nClient();

window.i18n = i18n;

export type { I18nClient };
