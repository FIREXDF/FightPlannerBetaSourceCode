export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[install-confirm-modal] ModalManagerClass not found'); return; }
  const transientAnimationTimers = new WeakMap<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >();

  function restartTransientAnimation(
    element: HTMLElement | null,
    className: string,
    duration = 420,
  ) {
    if (!element) return;

    const existingTimeout = transientAnimationTimers.get(element);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    element.classList.remove(className);
    if (document.body.classList.contains('no-animations')) {
      return;
    }

    void element.offsetWidth;
    element.classList.add(className);

    const effectiveDuration = document.body.classList.contains(
      'reduced-animations',
    )
      ? Math.min(duration, 220)
      : duration;

    const timeout = setTimeout(() => {
      element.classList.remove(className);
      transientAnimationTimers.delete(element);
    }, effectiveDuration);

    transientAnimationTimers.set(element, timeout);
  }

  function setAnimatedText(
    element: HTMLElement | null,
    nextText: string,
    className = 'install-count-bump',
    duration = 420,
  ) {
    if (!element) return;

    const previousText = element.textContent ?? '';
    element.textContent = nextText;

    if (previousText !== nextText) {
      restartTransientAnimation(element, className, duration);
    }
  }

  function syncStackCardMotion(
    card: HTMLElement,
    stackIndex: number,
    stackKey: string,
    isNew: boolean,
  ) {
    const previousKey = card.dataset.stackKey ?? '';
    const previousIndex = card.dataset.stackIndex ?? '';

    card.classList.remove('install-stack-card-1', 'install-stack-card-2');
    card.classList.add(`install-stack-card-${stackIndex}`);
    card.dataset.stackKey = stackKey;
    card.dataset.stackIndex = `${stackIndex}`;

    if (isNew) {
      restartTransientAnimation(card, 'install-stack-card-enter', 520);
      return;
    }

    if (
      previousKey &&
      (previousKey !== stackKey || previousIndex !== `${stackIndex}`)
    ) {
      restartTransientAnimation(card, 'install-stack-card-shift', 560);
    }
  }

  function createInstallFlightGhost(modal: HTMLElement) {
    const rect = modal.getBoundingClientRect();
    const ghost = modal.cloneNode(true) as HTMLElement;

    ghost.removeAttribute('id');
    ghost.classList.remove(
      'closing',
      'install-slide-out-top-right',
      'install-slide-in-right',
    );
    ghost.classList.add('install-confirm-flight-ghost');

    ghost.style.position = 'fixed';
    ghost.style.top = `${rect.top}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.minWidth = `${rect.width}px`;
    ghost.style.maxWidth = `${rect.width}px`;
    ghost.style.maxHeight = `${rect.height}px`;
    ghost.style.margin = '0';
    ghost.style.transform = 'none';
    ghost.style.transformOrigin = 'center center';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '10003';
    ghost.style.willChange = 'transform, opacity, filter';

    document.body.appendChild(ghost);
    return { ghost, rect };
  }

  M.prototype.openInstallConfirmModal = async function (url, downloadId, modId, modType = 'Mod') {
  this.installQueue.push({ url, downloadId, modId, modType });

  if (this.installQueue.length === 1) {
    await this._showInstallModal();
  } else {
    this._updateInstallQueueUI();
  }
};

M.prototype._showInstallModal = async function () {
  const item = this.installQueue[0];
  if (!item) return;

  const urlDisplay = document.querySelector<HTMLElement>('#install-url-display');
  if (urlDisplay) {
    urlDisplay.textContent = item.url;
  }

  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (modal) {
    modal.classList.remove('closing');
    this.showOverlay();
    modal.style.display = 'block';
  }

  const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
  if (previewContainer) {
    previewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
  }

  const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
  const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

  if (previewImage) {
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewImage.classList.remove('loaded');
  }
  if (previewLoading) {
    previewLoading.style.display = 'flex';
  }

  if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
    try {
      const result = await window.electronAPI.fetchGameBananaPreview(item.modId);
      if (result.success && result.imageUrl) {
        previewImage!.onload = () => {
          previewImage!.classList.add('loaded');
          if (previewLoading) previewLoading.style.display = 'none';
        };
        previewImage!.src = result.imageUrl;
        previewImage!.style.display = 'block';
      } else {
        if (previewLoading) previewLoading.style.display = 'none';
      }
    } catch (error) {
      console.error('[_showInstallModal] Failed to fetch preview:', error);
      if (previewLoading) previewLoading.style.display = 'none';
    }
  } else if (item.modType === 'Sound') {
    if (previewLoading) previewLoading.style.display = 'none';
  }

  this._updateInstallQueueUI();
};

M.prototype._updateInstallQueueUI = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (!modal) return;

  const total = this.installQueue.length;

  let badge = modal.querySelector<HTMLElement>('.install-queue-badge');
  if (total > 1) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'install-queue-badge';
      const header = modal.querySelector('.modal-header h3');
      if (header) header.appendChild(badge);
    }
    setAnimatedText(badge, `1 / ${total}`);
    badge.style.display = 'inline-flex';
  } else if (badge) {
    badge.style.display = 'none';
  }

  let cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
  if (total > 1) {
    if (cancelAllBtn) cancelAllBtn.style.display = 'inline-flex';
  } else if (cancelAllBtn) {
    cancelAllBtn.style.display = 'none';
  }

  const existingCards = Array.from(document.querySelectorAll('.install-stack-card'));

  if (total > 1) {
    const cardsToShow = Math.min(total - 1, 2);
    
    // Remove excess cards
    for (let i = cardsToShow; i < existingCards.length; i++) {
        existingCards[i].remove();
    }

    for (let i = 1; i <= cardsToShow; i++) {
      const item = this.installQueue[i];
      if (!item) continue;

      let card = document.querySelector(`.install-stack-card-${i}`) as HTMLElement;
      let isNew = false;
      if (!card) {
          card = modal.cloneNode(true) as HTMLElement;
          card.removeAttribute('id');
          card.className = 'modal install-stack-card';
          modal.parentElement?.insertBefore(card, modal);
          isNew = true;
      }

      syncStackCardMotion(card, i, item.downloadId || item.url, isNew);

      const urlDisplay = card.querySelector('.install-url-display');
      if (urlDisplay) urlDisplay.textContent = item.url;

      const cardBadge = card.querySelector('.install-queue-badge');
      if (cardBadge) {
        setAnimatedText(cardBadge as HTMLElement, `${i + 1} / ${total}`);
      }

      const cardPreviewContainer = card.querySelector('.install-preview-container') as HTMLElement;
      const cardPreviewImage = card.querySelector('.install-preview-image') as HTMLImageElement;
      const cardPreviewLoading = card.querySelector('.install-preview-loading') as HTMLElement;

      if (cardPreviewContainer) {
        cardPreviewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
      }
      if (isNew) {
        if (cardPreviewImage) {
          cardPreviewImage.src = '';
          cardPreviewImage.style.display = 'none';
          cardPreviewImage.classList.remove('loaded');
          cardPreviewImage.removeAttribute('id');
        }
        if (cardPreviewLoading) {
          cardPreviewLoading.style.display = 'flex';
        }

        if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
          window.electronAPI.fetchGameBananaPreview(item.modId).then(result => {
            if (result.success && result.imageUrl) {
              cardPreviewImage.onload = () => {
                cardPreviewImage.classList.add('loaded');
                if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
              };
              cardPreviewImage.src = result.imageUrl;
              cardPreviewImage.style.display = 'block';
            } else {
              if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
            }
          }).catch(() => {
            if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
          });
        }
      }
    }
  } else {
    existingCards.forEach(c => c.remove());
  }
};

M.prototype._clearInstallQueueUI = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (modal) {
    const badge = modal.querySelector<HTMLElement>('.install-queue-badge');
    if (badge) badge.style.display = 'none';

    const cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
    if (cancelAllBtn) cancelAllBtn.style.display = 'none';
  }

  document.querySelectorAll('.install-stack-card').forEach((c) => c.remove());
};

M.prototype._resetInstallPreview = function () {
  const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
  const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
  const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

  if (previewContainer) previewContainer.style.display = 'flex';
  if (previewImage) {
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewImage.classList.remove('loaded');
  }
  if (previewLoading) previewLoading.style.display = 'flex';
};

M.prototype.closeInstallConfirmModal = function () {
  this._clearInstallQueueUI();
  this._removeBubble();

  this.closeModal('install-confirm-modal', {
    onModalClosed: () => {
      this._resetInstallPreview();
    },
  });

  this.installQueue = [];
  this.confirmedInstalls = [];
};

M.prototype._getOrCreateBubble = function (): HTMLElement {
  let bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'install-confirm-bubble';
    bubble.className = 'install-confirm-bubble';
    bubble.textContent = '0';
    document.body.appendChild(bubble);
  }
  return bubble;
};

M.prototype._advanceInstallQueue = function (useDynamicIsland = false) {
  this.installQueue.shift();

  if (this.installQueue.length > 0) {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (!modal) { this._showInstallModal(); return; }

    const noAnimations = document.body.classList.contains('no-animations');

    const bubble = this._getOrCreateBubble();
    bubble.style.display = 'flex';

    if (useDynamicIsland) {
      const count = this.confirmedInstalls ? this.confirmedInstalls.length : 0;
      setAnimatedText(bubble, `${count}`, 'install-bubble-pop', 420);
    }

    if (noAnimations) {
      modal.style.display = 'none';
      this._showInstallModal();
      return;
    }

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const slideOutDuration = reducedAnimations ? 220 : 420;
    const slideInDuration = reducedAnimations ? 260 : 520;

    modal.classList.add('install-slide-out-top-right');

    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('install-slide-out-top-right');
      modal.classList.add('install-slide-in-right');
      this._showInstallModal();

      setTimeout(() => {
        modal.classList.remove('install-slide-in-right');
      }, slideInDuration);
    }, slideOutDuration);
  } else {
    this._clearInstallQueueUI();

    if (useDynamicIsland && this.confirmedInstalls && this.confirmedInstalls.length > 0) {
      this._launchAllConfirmedInstalls();
      this._animateModalToStatusBar();

      setTimeout(() => {
        this._animateBubbleToStatusBar();
      }, 300);
    } else {
      this._removeBubble();
      this.closeModal('install-confirm-modal', {
        onModalClosed: () => {
          this._resetInstallPreview();
        },
      });
    }
  }
};

M.prototype._removeBubble = function () {
  const bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  if (bubble) bubble.remove();
};

M.prototype._animateBubbleToStatusBar = function () {
  const bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  const statusBar = document.getElementById('main-status-bar');
  if (!bubble || !statusBar) {
    this._removeBubble();
    return;
  }

  const gsapRef = (window as any).gsap;
  if (!gsapRef) {
    this._removeBubble();
    return;
  }

  const statusBarRect = statusBar.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const reducedAnimations =
    document.body.classList.contains('reduced-animations');
  const targetLeft =
    statusBarRect.left + Math.min(statusBarRect.width * 0.34, 190);
  const targetTop =
    statusBarRect.top + statusBarRect.height / 2 - bubbleRect.height / 2;
  const deltaX = targetLeft - bubbleRect.left;
  const deltaY = targetTop - bubbleRect.top;
  const accentRgb =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-rgb')
      .trim() || '90,90,122';

  gsapRef.set(bubble, {
    left: bubbleRect.left,
    top: bubbleRect.top,
    right: 'auto',
    x: 0,
    y: 0,
    transformOrigin: 'center center',
    filter: 'blur(0px)',
  });

  const tl = gsapRef.timeline({
    onComplete: () => {
      bubble.remove();
    },
  });

  tl.to(bubble, {
    duration: reducedAnimations ? 0.12 : 0.18,
    scale: reducedAnimations ? 1.04 : 1.1,
    boxShadow: `0 10px 30px rgba(${accentRgb}, 0.22), 0 0 0 8px rgba(${accentRgb}, 0.12)`,
    ease: 'power2.out',
  });

  tl.to(bubble, {
    duration: reducedAnimations ? 0.24 : 0.4,
    x: deltaX,
    y: deltaY - (reducedAnimations ? 2 : 10),
    scale: reducedAnimations ? 0.5 : 0.38,
    opacity: reducedAnimations ? 0.36 : 0.2,
    filter: reducedAnimations ? 'blur(1px)' : 'blur(4px)',
    ease: 'power2.in',
  });

  tl.to(bubble, {
    duration: reducedAnimations ? 0.12 : 0.18,
    y: deltaY,
    scale: 0.16,
    opacity: 0,
    filter: reducedAnimations ? 'blur(5px)' : 'blur(10px)',
    ease: 'power3.in',
  });
};

M.prototype._launchAllConfirmedInstalls = function () {
  if (!this.confirmedInstalls) return;

  for (const item of this.confirmedInstalls) {
    if (window.electronAPI?.confirmProtocolInstall) {
      window.electronAPI.confirmProtocolInstall(item.url, item.downloadId).catch((error) => {
        console.error('[_launchAllConfirmedInstalls] Error confirming install:', error);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToStartInstallation');
        }
      });
    }
  }

  this.confirmedInstalls = [];
};

M.prototype._animateModalToStatusBar = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  const statusBar = document.getElementById('main-status-bar');
  if (!modal || !statusBar) {
    this.closeModal('install-confirm-modal', {
      onModalClosed: () => this._resetInstallPreview(),
    });
    return;
  }

  const noAnimations = document.body.classList.contains('no-animations');
  const reducedAnimations =
    document.body.classList.contains('reduced-animations');
  if (noAnimations) {
    this.closeModal('install-confirm-modal', {
      onModalClosed: () => this._resetInstallPreview(),
    });
    return;
  }

  if (window.statusBarManager) {
    window.statusBarManager.pendingDynamicIsland = true;
    const bottomBar = document.getElementById('main-status-bar');
    if (bottomBar) {
      bottomBar.classList.remove('expanded');
      const extContent = bottomBar.querySelector('.extended-content') as HTMLElement;
      if (extContent) extContent.style.display = 'none';
    }
  }

  const { ghost, rect: modalRect } = createInstallFlightGhost(modal);

  modal.style.visibility = 'hidden';
  modal.style.pointerEvents = 'none';

  const statusBarRect = statusBar.getBoundingClientRect();
  const targetCenterX =
    statusBarRect.left + Math.min(statusBarRect.width * 0.34, 210);
  const targetCenterY = statusBarRect.top + statusBarRect.height / 2;
  const modalCenterX = modalRect.left + modalRect.width / 2;
  const modalCenterY = modalRect.top + modalRect.height / 2;
  const deltaX = targetCenterX - modalCenterX;
  const deltaY = targetCenterY - modalCenterY;
  const targetScale = Math.max(
    (reducedAnimations ? 112 : 84) / modalRect.width,
    reducedAnimations ? 0.16 : 0.12,
  );

  const overlay = document.querySelector<HTMLElement>('#modal-overlay');

  const gsapRef = (window as any).gsap;
  if (!gsapRef) {
    this.closeModal('install-confirm-modal', {
      onModalClosed: () => this._resetInstallPreview(),
    });
    return;
  }

  gsapRef.set(ghost, {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    transformOrigin: 'center center',
    filter: 'blur(0px)',
  });

  const self = this;

  const tl = gsapRef.timeline({
    onComplete: () => {
      ghost.remove();
      modal.style.display = 'none';
      modal.removeAttribute('style');
      modal.style.display = 'none';
      self._resetInstallPreview();

      if (overlay) {
        overlay.style.display = 'none';
        overlay.removeAttribute('style');
        overlay.style.display = 'none';
      }

      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '90,90,122';
      statusBar.classList.remove('island-pulse');
      void statusBar.offsetHeight;
      statusBar.classList.add('island-pulse');
      gsapRef.fromTo(statusBar, {
        boxShadow: `0 -2px 25px 6px rgba(${accentRgb}, 0.6)`,
        filter: 'brightness(1.2)',
      }, {
        duration: 0.8,
        boxShadow: `0 -2px 0px 0px rgba(${accentRgb}, 0)`,
        filter: 'brightness(1)',
        ease: 'power2.out',
        onComplete: () => {
          statusBar.style.boxShadow = '';
          statusBar.style.filter = '';
          statusBar.classList.remove('island-pulse');
        },
      });

      setTimeout(() => {
        if (window.statusBarManager) {
          window.statusBarManager.pendingDynamicIsland = false;
          window.statusBarManager.userDismissedExtendedBar = false;
          window.statusBarManager.checkActiveDownloads();
        }
      }, 200);
    },
  });

  tl.to(ghost, {
    duration: reducedAnimations ? 0.14 : 0.18,
    y: reducedAnimations ? -8 : -14,
    scale: 0.992,
    boxShadow: '0 28px 70px rgba(0, 0, 0, 0.28)',
    ease: 'power2.out',
  });

  tl.to(ghost, {
    duration: reducedAnimations ? 0.28 : 0.42,
    x: deltaX,
    y: deltaY - (reducedAnimations ? 4 : 12),
    scale: targetScale * (reducedAnimations ? 1.08 : 1.18),
    borderRadius: '24px',
    opacity: reducedAnimations ? 0.56 : 0.72,
    filter: reducedAnimations ? 'blur(1px)' : 'blur(2px)',
    ease: 'power3.in',
  });

  tl.to(ghost, {
    duration: reducedAnimations ? 0.12 : 0.2,
    y: deltaY,
    opacity: 0,
    scale: targetScale * 0.64,
    filter: reducedAnimations ? 'blur(6px)' : 'blur(12px)',
    ease: 'power2.in',
  });

  if (overlay) {
    overlay.style.animation = 'none';
    overlay.style.transition = 'none';
    gsapRef.to(overlay, {
      duration: reducedAnimations ? 0.18 : 0.32,
      opacity: 0,
      ease: 'power2.inOut',
    });
  }
};

M.prototype.confirmInstall = function () {
  const item = this.installQueue[0];
  if (!item) return;

  if (!this.confirmedInstalls) this.confirmedInstalls = [];
  this.confirmedInstalls.push(item);

  this._advanceInstallQueue(true);
};

M.prototype.cancelInstallConfirm = function () {
  const item = this.installQueue[0];
  if (item && window.electronAPI?.cancelProtocolInstall) {
    window.electronAPI.cancelProtocolInstall(item.downloadId);
  }
  this._advanceInstallQueue();
};

M.prototype.cancelAllInstalls = function () {
  for (const item of this.installQueue) {
    if (window.electronAPI?.cancelProtocolInstall) {
      window.electronAPI.cancelProtocolInstall(item.downloadId);
    }
  }

  if (this.confirmedInstalls) {
    for (const item of this.confirmedInstalls) {
      if (window.electronAPI?.cancelProtocolInstall) {
        window.electronAPI.cancelProtocolInstall(item.downloadId);
      }
    }
    this.confirmedInstalls = [];
  }

  this.closeInstallConfirmModal();
};
})();

