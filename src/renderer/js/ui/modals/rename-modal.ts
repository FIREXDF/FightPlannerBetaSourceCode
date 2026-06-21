export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[rename-modal] ModalManagerClass not found'); return; }

  M.prototype.openRenameModal = function (mod, callback) {
    this.currentMod = mod;
    this.renameCallback = callback;

    const modal = document.querySelector<HTMLElement>('#rename-modal');
    const input = document.querySelector<HTMLInputElement>('#rename-input');

    if (modal && input) {
      modal.classList.remove('closing');
      input.value = mod.name;
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.confirmRename();
        } else if (e.key === 'Escape') {
          this.closeRenameModal();
        }
      };
    }
  };

  M.prototype.closeRenameModal = function () {
    this.closeModal('rename-modal');
    this.currentMod = null;
    this.renameCallback = null;
  };

  M.prototype.confirmRename = function () {
    const input = document.querySelector<HTMLInputElement>('#rename-input');
    const newName = input!.value.trim();

    if (!newName) {
      this.showAlert('error', 'Error', 'Mod name cannot be empty');
      return;
    }

    if (newName === this.currentMod.name) {
      this.closeRenameModal();
      return;
    }

    if (this.renameCallback) {
      this.renameCallback(newName);
    }

    this.closeRenameModal();
  };
})();
