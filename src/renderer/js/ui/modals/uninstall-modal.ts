export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[uninstall-modal] ModalManagerClass not found'); return; }

  function t(key, params = {}) {
    return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
  }

  function renderUninstallModalContent(modOrMods) {
    const mods = Array.isArray(modOrMods) ? modOrMods : [modOrMods];
    const isMultiple = mods.length > 1;
    const titleEl = document.querySelector<HTMLElement>('#uninstall-modal-title');
    const warningEl = document.querySelector<HTMLElement>('#uninstall-warning-text');
    const listEl = document.querySelector<HTMLElement>('#uninstall-mod-list');
    const hintEl = document.querySelector<HTMLElement>('#uninstall-modal-hint');
    const confirmLabelEl = document.querySelector<HTMLElement>('#uninstall-confirm-label');

    if (!warningEl || !listEl || !hintEl || !confirmLabelEl) {
      return;
    }

    if (titleEl) {
      titleEl.textContent = isMultiple
        ? t('modals.uninstall.titleMultiple', { count: mods.length })
        : t('modals.uninstall.title');
    }

    listEl.innerHTML = '';
    listEl.classList.remove('visible');

    if (isMultiple) {
      warningEl.textContent = t('modals.uninstall.warningMultiple', {
        count: mods.length,
      });
      hintEl.textContent = t('modals.uninstall.hintMultiple');
      confirmLabelEl.textContent = t('modals.uninstall.confirmMultiple', {
        count: mods.length,
      });

      mods.slice(0, 6).forEach((mod) => {
        const item = document.createElement('div');
        item.className = 'uninstall-mod-list-item';

        const icon = document.createElement('i');
        icon.className = 'bi bi-trash3';

        const label = document.createElement('span');
        label.textContent = mod.name;
        label.title = mod.name;

        item.appendChild(icon);
        item.appendChild(label);
        listEl.appendChild(item);
      });

      const remainingCount = mods.length - 6;
      if (remainingCount > 0) {
        const more = document.createElement('div');
        more.className = 'uninstall-mod-list-more';
        more.textContent = t('modals.uninstall.moreSelected', {
          count: remainingCount,
        });
        listEl.appendChild(more);
      }

      listEl.classList.add('visible');
      return;
    }

    warningEl.innerHTML = '';
    warningEl.appendChild(
      document.createTextNode(`${t('modals.uninstall.warning')} `),
    );

    const strong = document.createElement('strong');
    strong.id = 'uninstall-mod-name';
    strong.textContent = mods[0]?.name || '';
    warningEl.appendChild(strong);
    warningEl.appendChild(document.createTextNode('?'));

    hintEl.textContent = t('modals.uninstall.hint');
    confirmLabelEl.textContent = t('common.uninstall');
  }

  M.prototype.openUninstallModal = function (modOrMods, callback) {
    const mods = Array.isArray(modOrMods) ? modOrMods : [modOrMods];

    this.currentMod = mods.length === 1 ? mods[0] : mods;
    this.uninstallCallback = callback;

    const modal = document.querySelector<HTMLElement>('#uninstall-modal');

    if (modal) {
      modal.classList.remove('closing');

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      renderUninstallModalContent(mods);

      this.showOverlay();
      modal.style.display = 'block';

      if (this._uninstallKeyHandler) {
        document.removeEventListener('keydown', this._uninstallKeyHandler);
      }

      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.removeEventListener('keydown', keyHandler);
          this._uninstallKeyHandler = null;
          this.confirmUninstall();
        } else if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          this._uninstallKeyHandler = null;
          this.closeUninstallModal();
        }
      };

      this._uninstallKeyHandler = keyHandler;
      document.addEventListener('keydown', keyHandler);
    }
  };

  M.prototype.closeUninstallModal = function () {
    if (this._uninstallKeyHandler) {
      document.removeEventListener('keydown', this._uninstallKeyHandler);
      this._uninstallKeyHandler = null;
    }

    this.closeModal('uninstall-modal');
    this.currentMod = null;
    this.uninstallCallback = null;
  };

  M.prototype.confirmUninstall = function () {
    if (this.uninstallCallback) {
      this.uninstallCallback();
    }

    this.closeUninstallModal();
  };
})();
