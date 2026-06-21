export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[alert-modal] ModalManagerClass not found'); return; }

  M.prototype.showAlert = function (type, title, message, params = {}) {
    const modal = document.querySelector<HTMLElement>('#alert-modal');
    const header = document.querySelector<HTMLElement>('#alert-modal-header');
    const titleEl = document.querySelector<HTMLElement>('#alert-modal-title');
    const messageEl = document.querySelector<HTMLElement>('#alert-modal-message');

    if (!modal || !header || !titleEl || !messageEl) return;

    const t = (key: string, p: any = {}) => {
      if (window.i18n && window.i18n.t) {
        return window.i18n.t(key, p);
      }
      return key;
    };

    modal.classList.remove('closing');
    let icon = 'bi-info-circle';
    header.className = 'modal-header';

    if (type === 'success') {
      icon = 'bi-check-circle';
    } else if (type === 'error') {
      icon = 'bi-x-circle';
      header.classList.add('modal-header-danger');
    } else if (type === 'warning') {
      icon = 'bi-exclamation-triangle';
    }

    const translatedTitle =
      title &&
        (title.startsWith('modals.') ||
          title.startsWith('common.') ||
          title.startsWith('toasts.'))
        ? t(title, params)
        : title || '';
    const translatedMessage =
      message &&
        (message.startsWith('modals.') ||
          message.startsWith('common.') ||
          message.startsWith('toasts.'))
        ? t(message, params)
        : message || '';

    titleEl.innerHTML = `<i class="bi ${icon}"></i> ${this.escapeHtml(translatedTitle)}`;
    messageEl.textContent = translatedMessage;

    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }
  };

  M.prototype.closeAlertModal = function () {
    this.closeModal('alert-modal');
  };
})();
