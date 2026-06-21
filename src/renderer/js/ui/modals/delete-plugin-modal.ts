export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[delete-plugin-modal] ModalManagerClass not found'); return; }

  M.prototype.openDeletePluginModal = function (plugin, callback) {
    this.currentPlugin = plugin;
    this.deletePluginCallback = callback;

    const modal = document.querySelector<HTMLElement>('#delete-plugin-modal');
    const pluginNameEl = document.querySelector<HTMLElement>('#delete-plugin-name');

    if (modal && pluginNameEl) {
      modal.classList.remove('closing');
      pluginNameEl.textContent = plugin.name;
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.removeEventListener('keydown', keyHandler);
          this.confirmDeletePlugin();
        } else if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          this.closeDeletePluginModal();
        }
      };
      document.addEventListener('keydown', keyHandler);
    }
  };

  M.prototype.closeDeletePluginModal = function () {
    this.closeModal('delete-plugin-modal');
    this.currentPlugin = null;
    this.deletePluginCallback = null;
  };

  M.prototype.confirmDeletePlugin = function () {
    if (this.deletePluginCallback) {
      this.deletePluginCallback();
    }
    this.closeDeletePluginModal();
  };
})();
