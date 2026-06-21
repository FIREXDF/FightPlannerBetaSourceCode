class ToastManager {
  container: HTMLElement | null;
  toasts: HTMLElement[];
  toastHistory: Map<string, number>;
  toastCooldown: number;
  groupedToasts: Map<string, any>;
  groupTimeout: number | null;
  maxVisible: number;

  constructor() {
    this.container = null;
    this.toasts = [];
    this.toastHistory = new Map();
    this.toastCooldown = 2000;
    this.groupedToasts = new Map();
    this.groupTimeout = null;
    this.maxVisible = 5;

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        this.setupContainer(),
      );
    } else {
      this.setupContainer();
    }
  }

  setupContainer() {
    this.container = document.querySelector<HTMLElement>('#toast-container');
    if (!this.container) {
      console.warn('[ToastManager] toast container not found');
    }
  }

  translateMessage(message, params = {}) {
    if (!message) return '';

    if (message.startsWith('toasts.')) {
      if (window.i18n && window.i18n.t) {
        let translated = window.i18n.t(message, params);
        return translated || message;
      }
      return message;
    }

    if (params && Object.keys(params).length > 0) {
      let result = message;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return result;
    }

    return message;
  }

  updateStackState() {
    const visibleToasts = this.toasts.filter(
      (t) => t.parentElement && !t.classList.contains('toast-hide'),
    );

    for (let i = 0; i < visibleToasts.length; i++) {
      const toast = visibleToasts[i];
      const index = Math.min(i, 4);
      toast.style.setProperty('--stack-index', String(index));
      if (i === 0) {
        toast.removeAttribute('data-stacked');
      } else {
        toast.setAttribute('data-stacked', 'true');
      }
    }
  }

  show(
    type,
    message,
    duration = 3000,
    params = {},
    options: { actionButton?: { text: string; onClick?: () => void } } = {},
  ) {
    if (!this.container) {
      this.setupContainer();
      if (!this.container) {
        console.error('[ToastManager] Cannot show toast: container not found');
        return;
      }
    }

    const translatedMessage =
      this.translateMessage(message, params) || message || '';
    if (!translatedMessage) {
      console.warn('[ToastManager] message is empty, skipping');
      return;
    }
    const toastKey = `${type}:${translatedMessage}`;
    const now = Date.now();

    if (this.toastHistory.has(toastKey)) {
      const lastShown = this.toastHistory.get(toastKey);
      const timeSince = now - lastShown!;

      if (timeSince < this.toastCooldown) {
        console.log(
          '[ToastManager] Skipping duplicate toast (shown',
          timeSince,
          'ms ago):',
          message,
        );
        return;
      }
    }

    this.toastHistory.set(toastKey, now);
    this.playToastSound(type);

    for (const [key, timestamp] of this.toastHistory.entries()) {
      if (now - timestamp > 10000) {
        this.toastHistory.delete(key);
      }
    }

    if (this.toasts.length >= this.maxVisible) {
      this.hide(this.toasts[this.toasts.length - 1]);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.setProperty('--toast-duration', `${duration}ms`);

    let icon = '';
    switch (type) {
      case 'success':
        icon = '<i class="bi bi-check-circle-fill"></i>';
        break;
      case 'error':
        icon = '<i class="bi bi-x-circle-fill"></i>';
        break;
      case 'warning':
        icon = '<i class="bi bi-exclamation-triangle-fill"></i>';
        break;
      case 'info':
        icon = '<i class="bi bi-info-circle-fill"></i>';
        break;
    }

    let actionButtonHtml = '';
    if (options.actionButton) {
      const actionText = options.actionButton.text || 'Action';
      actionButtonHtml = `<button class="toast-action-btn">${this.escapeHtml(actionText)}</button>`;
    }

    toast.innerHTML = `
${icon}
<span class="toast-message">${this.escapeHtml(translatedMessage)}</span>
${actionButtonHtml}
<button class="toast-close">
<i class="bi bi-x"></i>
</button>
`;

    if (this.container.firstChild) {
      this.container.insertBefore(toast, this.container.firstChild);
    } else {
      this.container.appendChild(toast);
    }
    this.toasts.unshift(toast);

    const closeBtn = toast.querySelector<HTMLElement>('.toast-close');
    closeBtn!.addEventListener('click', () => this.hide(toast));

    const onClick = options.actionButton?.onClick;

    if (onClick) {
      const actionBtn = toast.querySelector<HTMLElement>('.toast-action-btn');

      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          onClick();
          this.hide(toast);
        });
      }
    }

    let autoHideTimeout: ReturnType<typeof setTimeout> | null = null;
    let remainingTime = duration;
    let pauseStart = 0;

    const startAutoHide = () => {
      autoHideTimeout = setTimeout(() => {
        this.hide(toast);
      }, remainingTime);
    };

    toast.addEventListener('mouseenter', () => {
      toast.classList.add('toast-paused');
      if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
      }
      pauseStart = Date.now();
    });

    toast.addEventListener('mouseleave', () => {
      toast.classList.remove('toast-paused');
      if (pauseStart > 0) {
        remainingTime = Math.max(remainingTime - (Date.now() - pauseStart), 500);
        pauseStart = 0;
      }
      startAutoHide();
    });

    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
      this.updateStackState();
    });

    startAutoHide();
  }

  hide(toast) {
    if (!toast || !toast.parentElement) return;

    toast.classList.remove('toast-show');
    toast.removeAttribute('data-stacked');
    toast.classList.add('toast-hide');

    const noAnimations = document.body.classList.contains('no-animations');
    const delay = noAnimations ? 0 : 450;

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }

      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }

      this.updateStackState();
    }, delay);
  }

  playToastSound(type) {
    if (!window.appSoundManager) {
      return;
    }

    switch (type) {
      case 'success':
        window.appSoundManager.play('complete');
        break;
      case 'error':
        window.appSoundManager.play('error');
        break;
      default:
        window.appSoundManager.play('notification');
        break;
    }
  }

  success(message, duration?, params?, options?) {
    this.show('success', message, duration, params, options);
  }

  error(message, duration?, params?, options?) {
    this.show('error', message, duration, params, options);
  }

  warning(message, duration?, params?, options?) {
    this.show('warning', message, duration, params, options);
  }

  info(message, duration?, params?, options?) {
    this.show('info', message, duration, params, options);
  }

  clear() {
    this.toasts.forEach((toast) => {
      if (toast.parentElement) {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => {
          if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
          }
        }, 450);
      }
    });
    this.toasts = [];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.toastManager = new ToastManager();
  console.log('[ToastManager] initialized');
}

export { type ToastManager };
