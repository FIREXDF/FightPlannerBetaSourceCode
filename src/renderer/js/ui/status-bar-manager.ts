interface NoneUpdate {
  type: 'none';
}

interface SuccessUpdate {
  type: 'success';
  fileName: string;
}

interface ConflictUpdate {
  type: 'conflict';
  conflictCount: number;
  modsWithConflictsCount: number;
}

interface DownloadItem {
  id: string;
  fileName: string;
  modName?: string;
  statusText?: string;
  progress: number;
  speedText?: string;
  phaseLabel?: string;
  iconClass?: string;
}

interface DownloadUpdate {
  type: 'download';
  downloads: DownloadItem[];
}

type StatusTab =
  | 'downloads'
  | 'tools'
  | 'plugins'
  | 'settings'
  | 'characters'
  | 'stages'
  | 'fightplanner';

interface StatusSnapshot {
  content: string;
  useInnerHTML?: boolean;
  downloading?: boolean;
}

export class StatusBarManager {
  updateInterval: ReturnType<typeof setTimeout> | null;
  currentTab: StatusTab | null;
  preservedStatus: string | null;
  animationTimeout: ReturnType<typeof setTimeout> | null;
  hasActiveDownloads: boolean = false;
  private animationCounter: number = 0;
  userDismissedExtendedBar: boolean = false;
  lastExtendedBarData: string | null = null;
  pendingDynamicIsland: boolean = false;
  private lastHandledSuccessId: string | null = null;
  private statusCycleId: number = 0;
  private renderedStatusSignature: string | null = null;
  private temporaryStatus: StatusSnapshot | null = null;
  private temporaryStatusTimeout: ReturnType<typeof setTimeout> | null = null;
  private islandPulseTimeout: ReturnType<typeof setTimeout> | null = null;
  private islandSettleTimeout: ReturnType<typeof setTimeout> | null = null;
  private islandGsapTimeline: any = null;
  private transientElementTimers = new WeakMap<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >();

  constructor() {
    this.updateInterval = null;
    this.currentTab = null;
    this.preservedStatus = null;
    this.animationTimeout = null;
    this.userDismissedExtendedBar = false;
    this.lastExtendedBarData = null;
    this.claimManagedStatusNode();
    this.setupCollapsedStatusClickHandler();

    // Start global monitoring for downloads
    setInterval(() => {
      // Always check
      this.checkActiveDownloads();
    }, 500);
  }

  t(key, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }
    return key;
  }

  private claimManagedStatusNode() {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    if (statusText.dataset.statusBarManaged !== 'true') {
      statusText.dataset.statusBarManaged = 'true';
      statusText.removeAttribute('data-i18n');
    }
  }

  private getStatusTextElement() {
    const statusText =
      document.querySelector<HTMLElement>('#main-status-bar .bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text');

    if (statusText && statusText.dataset.statusBarManaged !== 'true') {
      statusText.dataset.statusBarManaged = 'true';
      statusText.removeAttribute('data-i18n');
    }

    return statusText;
  }

  private isEnhancedStatusBarEnabled() {
    return window.settingsManager?.settings.enhancedStatusBar !== false;
  }

  private setupCollapsedStatusClickHandler() {
    const bottomBar = document.getElementById('main-status-bar');
    if (!bottomBar || bottomBar.dataset.collapsedClickAttached === 'true') {
      return;
    }

    bottomBar.addEventListener('click', (event) => {
      if (!this.isEnhancedStatusBarEnabled()) {
        return;
      }

      if (bottomBar.classList.contains('expanded')) {
        return;
      }

      const target = event.target as HTMLElement;
      if (!target.closest('.bottom-text-left')) {
        return;
      }

      if (!this.hasDownloadsInProgress()) {
        return;
      }

      this.userDismissedExtendedBar = false;
      this.checkActiveDownloads();
    });

    bottomBar.dataset.collapsedClickAttached = 'true';
  }

  private clearUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private clearIslandAnimationTimers() {
    if (this.islandPulseTimeout) {
      clearTimeout(this.islandPulseTimeout);
      this.islandPulseTimeout = null;
    }

    if (this.islandSettleTimeout) {
      clearTimeout(this.islandSettleTimeout);
      this.islandSettleTimeout = null;
    }
  }

  private clearIslandGsapTimeline() {
    if (this.islandGsapTimeline) {
      this.islandGsapTimeline.kill();
      this.islandGsapTimeline = null;
    }
  }

  private resetIslandAnimationStyles(...elements: Array<HTMLElement | null>) {
    elements.forEach((element) => {
      if (!element) {
        return;
      }

      element.style.removeProperty('transform');
      element.style.removeProperty('opacity');
      element.style.removeProperty('filter');
      element.style.removeProperty('clip-path');
      element.style.removeProperty('visibility');
      element.style.removeProperty('will-change');
    });
  }

  private renderDownloadCardWithFlip(
    content: HTMLElement,
    render: () => void,
  ) {
    const { gsapRef, flipRef } = this.resolveFlipRuntime();

    if (
      !gsapRef ||
      !flipRef ||
      document.body.classList.contains('no-animations')
    ) {
      render();
      return;
    }

    try {
      if (window.__flipPluginRegistered !== true) {
        gsapRef.registerPlugin(flipRef);
        window.__flipPluginRegistered = true;
      }

      this.ensureDownloadFlipIds(content);

      const currentTargets = Array.from(
        content.querySelectorAll<HTMLElement>('[data-flip-id]'),
      );

      if (currentTargets.length === 0) {
        render();
        return;
      }

      const previousHeight = content.getBoundingClientRect().height;
      const state = flipRef.getState(currentTargets);
      render();
      this.ensureDownloadFlipIds(content);
      this.animateExtendedContentHeight(content, previousHeight);

      const nextTargets = Array.from(
        content.querySelectorAll<HTMLElement>('[data-flip-id]'),
      );

      if (nextTargets.length === 0) {
        return;
      }

      flipRef.from(state, {
        targets: nextTargets,
        duration: document.body.classList.contains('reduced-animations')
          ? 0.2
          : 0.68,
        ease: 'expo.out',
        absolute: false,
        nested: true,
        scale: true,
        simple: false,
        prune: true,
      });
    } catch (error) {
      render();
    }
  }

  private resolveFlipRuntime() {
    let gsapRef = window.gsap as any;
    let flipRef = window.Flip as any;

    if ((!gsapRef || !flipRef) && typeof require === 'function') {
      try {
        const gsapModule = require('gsap');
        const flipModule = require('gsap/Flip');

        gsapRef =
          gsapRef ||
          gsapModule?.gsap ||
          gsapModule?.default ||
          gsapModule;
        flipRef =
          flipRef ||
          flipModule?.Flip ||
          flipModule?.default ||
          flipModule;

        if (!window.gsap && gsapRef) {
          window.gsap = gsapRef;
        }

        if (!window.Flip && flipRef) {
          window.Flip = flipRef;
        }
      } catch (error) {
        // Keep the window globals path as the primary runtime.
      }
    }

    return { gsapRef, flipRef };
  }

  private animateExtendedContentHeight(
    content: HTMLElement,
    previousHeight: number,
  ) {
    const { gsapRef } = this.resolveFlipRuntime();

    if (
      !gsapRef ||
      previousHeight <= 0 ||
      document.body.classList.contains('no-animations')
    ) {
      return;
    }

    const previousInlineHeight = content.style.height;
    const previousBoxSizing = content.style.boxSizing;

    content.style.height = 'auto';
    content.style.boxSizing = 'border-box';
    const nextHeight = content.getBoundingClientRect().height;
    content.style.height = previousInlineHeight;
    content.style.boxSizing = previousBoxSizing;

    if (Math.abs(nextHeight - previousHeight) < 1) {
      return;
    }

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');

    gsapRef.killTweensOf(content, 'height');
    gsapRef.fromTo(
      content,
      {
        boxSizing: 'border-box',
        height: previousHeight,
      },
      {
        height: nextHeight,
        duration: reducedAnimations ? 0.16 : 0.62,
        ease: 'expo.out',
        clearProps: 'height,boxSizing',
        overwrite: 'auto',
      },
    );
  }

  private ensureDownloadFlipIds(content: HTMLElement) {
    const idMap: Array<[string, string]> = [
      ['.ext-status-badge', 'download-badge'],
      ['.ext-filename, .ext-download-title', 'download-title'],
      ['.ext-progress-row, .ext-multi-dl-list', 'download-body'],
    ];

    idMap.forEach(([selector, flipId]) => {
      const element = content.querySelector<HTMLElement>(selector);
      if (element && !element.dataset.flipId) {
        element.setAttribute('data-flip-id', flipId);
      }
    });
  }

  private getDownloadFlipKey(id: string) {
    return `download-item-${String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private getDownloadNameFlipKey(id: string) {
    return `${this.getDownloadFlipKey(id)}-name`;
  }

  private getDownloadProgressFlipKey(id: string) {
    return `${this.getDownloadFlipKey(id)}-progress`;
  }

  private animateElementTextChange(
    element: HTMLElement | null,
    nextText: string,
    className = 'ext-count-bump',
    duration = 420,
  ) {
    if (!element) {
      return;
    }

    const previousText = element.textContent ?? '';

    if (previousText === nextText) {
      return;
    }

    const { gsapRef } = this.resolveFlipRuntime();
    const reducedAnimations =
      document.body.classList.contains('reduced-animations');

    if (!gsapRef || document.body.classList.contains('no-animations')) {
      element.textContent = nextText;
      this.restartTransientElementAnimation(element, className, duration);
      return;
    }

    gsapRef.killTweensOf(element);
    gsapRef
      .timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          gsapRef.set(element, {
            clearProps: 'transform,opacity,visibility,filter,transformOrigin',
          });
        },
      })
      .to(element, {
        y: reducedAnimations ? 1 : 5,
        scale: reducedAnimations ? 0.995 : 0.965,
        autoAlpha: reducedAnimations ? 0.72 : 0,
        filter: reducedAnimations ? 'blur(0px)' : 'blur(4px)',
        transformOrigin: '50% 50%',
        duration: reducedAnimations ? 0.06 : 0.12,
        ease: 'power2.in',
        onComplete: () => {
          element.textContent = nextText;
        },
      })
      .fromTo(
        element,
        {
          y: reducedAnimations ? -1 : -7,
          scale: reducedAnimations ? 1.002 : 1.045,
          autoAlpha: reducedAnimations ? 0.72 : 0,
          filter: reducedAnimations ? 'blur(0px)' : 'blur(5px)',
          transformOrigin: '50% 50%',
        },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          filter: 'blur(0px)',
          duration: reducedAnimations ? 0.14 : 0.34,
          ease: 'expo.out',
        },
      );
  }

  private animateProgressFill(fillEl: HTMLElement | null, progress: number) {
    if (!fillEl) {
      return;
    }

    const { gsapRef } = this.resolveFlipRuntime();
    const reducedAnimations =
      document.body.classList.contains('reduced-animations');

    if (!gsapRef || document.body.classList.contains('no-animations')) {
      fillEl.style.width = `${progress}%`;
      return;
    }

    gsapRef.to(fillEl, {
      width: `${progress}%`,
      duration: reducedAnimations ? 0.16 : 0.48,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  }

  private getMultiDownloadViewData(dl: DownloadItem) {
    const progress = Math.round(dl.progress || 0);
    const displayName = this._getDownloadDisplayName(dl);
    let pctText = `${progress}%`;

    if (dl.statusText) {
      const lowerStatus = dl.statusText.toLowerCase();
      if (lowerStatus.includes('extract')) pctText = 'Extracting...';
      else if (lowerStatus.includes('verif')) pctText = 'Verifying...';
    }

    return { progress, displayName, pctText };
  }

  private createMultiDownloadItemElement(dl: DownloadItem) {
    const item = document.createElement('div');
    const { progress, displayName, pctText } = this.getMultiDownloadViewData(dl);

    item.className = 'ext-multi-dl-item';
    item.dataset.dlId = dl.id;
    item.setAttribute('data-flip-id', this.getDownloadFlipKey(dl.id));
    item.innerHTML = `
      <div class="ext-multi-dl-info">
        <span class="ext-multi-dl-name" data-flip-id="${this.getDownloadNameFlipKey(dl.id)}" title="${displayName}">${displayName}</span>
        <span class="ext-multi-dl-pct" data-flip-id="${this.getDownloadFlipKey(dl.id)}-pct">${pctText}</span>
      </div>
      <div class="ext-multi-dl-bar" data-flip-id="${this.getDownloadProgressFlipKey(dl.id)}">
        <div class="ext-multi-dl-fill" style="width: ${progress}%"></div>
      </div>
    `;

    return item;
  }

  private updateMultiDownloadItemElement(itemEl: HTMLElement, dl: DownloadItem) {
    const { progress, displayName, pctText } = this.getMultiDownloadViewData(dl);
    const nameEl = itemEl.querySelector('.ext-multi-dl-name');
    const pctEl = itemEl.querySelector('.ext-multi-dl-pct');
    const fillEl = itemEl.querySelector('.ext-multi-dl-fill') as HTMLElement | null;

    itemEl.dataset.dlId = dl.id;
    if (nameEl) {
      (nameEl as HTMLElement).title = displayName;
      this.animateElementTextChange(nameEl as HTMLElement, displayName, 'ext-text-swap', 280);
    }
    if (pctEl) this.animateElementTextChange(pctEl as HTMLElement, pctText, 'ext-text-swap', 280);
    this.animateProgressFill(fillEl, progress);
  }

  private animateMultiDownloadListChanges(
    content: HTMLElement,
    downloads: DownloadItem[],
  ) {
    const { gsapRef, flipRef } = this.resolveFlipRuntime();
    const listEl = content.querySelector<HTMLElement>('.ext-multi-dl-list');
    const badgeEl = content.querySelector('.ext-status-badge');

    if (!listEl) {
      return false;
    }

    const existingItems = Array.from(
      listEl.querySelectorAll<HTMLElement>('.ext-multi-dl-item'),
    );
    const existingById = new Map(
      existingItems.map((item) => [item.dataset.dlId || '', item]),
    );
    const nextIds = new Set(downloads.map((dl) => dl.id));
    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const canAnimate =
      !!gsapRef &&
      !!flipRef &&
      !document.body.classList.contains('no-animations');

    if (badgeEl) {
      this.animateElementTextChange(
        badgeEl as HTMLElement,
        `${downloads.length} Downloads`,
      );
    }

    if (!canAnimate) {
      listEl.innerHTML = '';
      downloads.forEach((dl) => {
        listEl.appendChild(this.createMultiDownloadItemElement(dl));
      });
      return true;
    }

    if (window.__flipPluginRegistered !== true) {
      gsapRef.registerPlugin(flipRef);
      window.__flipPluginRegistered = true;
    }

    const previousContentHeight = content.getBoundingClientRect().height;
    const listState = flipRef.getState(existingItems);
    const listRect = listEl.getBoundingClientRect();
    const leavingClones: HTMLElement[] = [];

    existingItems.forEach((item) => {
      const id = item.dataset.dlId;
      if (!id || nextIds.has(id)) {
        return;
      }

      const itemRect = item.getBoundingClientRect();
      const clone = item.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = `${itemRect.left - listRect.left}px`;
      clone.style.top = `${itemRect.top - listRect.top}px`;
      clone.style.width = `${itemRect.width}px`;
      clone.style.height = `${itemRect.height}px`;
      clone.style.margin = '0';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '3';
      listEl.appendChild(clone);
      leavingClones.push(clone);
      item.remove();
    });

    const enteringItems: HTMLElement[] = [];

    downloads.forEach((dl) => {
      const existingItem = existingById.get(dl.id);
      if (existingItem) {
        this.updateMultiDownloadItemElement(existingItem, dl);
        listEl.appendChild(existingItem);
        return;
      }

      const newItem = this.createMultiDownloadItemElement(dl);
      newItem.classList.add('entering');
      listEl.appendChild(newItem);
      enteringItems.push(newItem);
    });

    this.animateExtendedContentHeight(content, previousContentHeight);

    const remainingItems = Array.from(
      listEl.querySelectorAll<HTMLElement>('.ext-multi-dl-item:not(.entering)'),
    );

    flipRef.from(listState, {
      targets: remainingItems,
      duration: reducedAnimations ? 0.18 : 0.52,
      ease: 'expo.out',
      absolute: false,
      nested: true,
      simple: false,
      prune: true,
    });

    if (enteringItems.length > 0) {
      gsapRef.fromTo(
        enteringItems,
        {
          autoAlpha: 0,
          x: reducedAnimations ? -2 : -10,
          y: reducedAnimations ? 4 : 16,
          scale: reducedAnimations ? 0.995 : 0.975,
          filter: reducedAnimations ? 'blur(0px)' : 'blur(6px)',
        },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: reducedAnimations ? 0.16 : 0.44,
          ease: 'expo.out',
          stagger: reducedAnimations ? 0.015 : 0.065,
          clearProps: 'transform,opacity,visibility,filter',
          onComplete: () => {
            enteringItems.forEach((item) => item.classList.remove('entering'));
          },
        },
      );
    }

    if (leavingClones.length > 0) {
      gsapRef.to(leavingClones, {
        autoAlpha: 0,
        x: reducedAnimations ? -2 : -8,
        y: reducedAnimations ? -4 : -12,
        scale: reducedAnimations ? 0.995 : 0.98,
        filter: reducedAnimations ? 'blur(0px)' : 'blur(5px)',
        duration: reducedAnimations ? 0.14 : 0.34,
        ease: 'power2.inOut',
        stagger: reducedAnimations ? 0.01 : 0.045,
        onComplete: () => {
          leavingClones.forEach((clone) => clone.remove());
        },
      });
    }

    return true;
  }

  private animateExtendedBarEntrance(bottomBar: HTMLElement, content: HTMLElement) {
    const gsapRef = window.gsap as any;
    const statusBarContent =
      bottomBar.querySelector<HTMLElement>('.status-bar-content');

    if (
      !gsapRef ||
      !statusBarContent ||
      document.body.classList.contains('no-animations')
    ) {
      bottomBar.classList.remove('gsap-island-animating');
      return;
    }

    this.clearIslandGsapTimeline();
    bottomBar.classList.add('gsap-island-animating');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const card = content.firstElementChild as HTMLElement | null;
    const iconContainer =
      card?.querySelector<HTMLElement>('.ext-card-icon-container') || null;
    const details = card?.querySelector<HTMLElement>('.ext-card-details') || null;
    const primaryMeta =
      card?.querySelector<HTMLElement>(
        '.ext-progress-row, .ext-card-meta, .ext-conflict-message, .ext-multi-dl-list',
      ) || null;
    const actionButton =
      card?.querySelector<HTMLElement>('.ext-action-btn') || null;
    const rows = card
      ? Array.from(card.querySelectorAll<HTMLElement>('.ext-multi-dl-item'))
      : [];
    const transformOrigin = bottomBar.classList.contains('conflict-mode')
      ? 'right bottom'
      : 'left bottom';
    const timeline = gsapRef.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.resetIslandAnimationStyles(bottomBar, statusBarContent, content);
        bottomBar.classList.remove('gsap-island-animating');
        this.islandGsapTimeline = null;
      },
    });

    this.islandGsapTimeline = timeline;
    bottomBar.style.willChange = 'transform';
    statusBarContent.style.willChange = 'transform, opacity, filter';
    content.style.willChange = 'transform, opacity, filter, clip-path';

    timeline
      .fromTo(
        bottomBar,
        { y: 0 },
        {
          y: -1,
          duration: reducedAnimations ? 0.18 : 0.66,
          ease: 'expo.out',
          clearProps: 'transform',
        },
        0,
      )
      .fromTo(
        content,
        {
          transformOrigin,
          y: reducedAnimations ? 8 : 16,
          scaleX: 0.992,
          scaleY: 0.94,
          autoAlpha: 0,
          filter: 'blur(12px) saturate(0.9)',
          clipPath: 'inset(100% -50px 0 -50px)',
        },
        {
          y: 0,
          scaleX: 1,
          scaleY: 1,
          autoAlpha: 1,
          filter: 'blur(0px) saturate(1)',
          clipPath: 'inset(-50px -50px 0 -50px)',
          duration: reducedAnimations ? 0.2 : 0.72,
          ease: 'expo.out',
          clearProps: 'transform,opacity,filter,clipPath,visibility',
        },
        0,
      )
      .fromTo(
        statusBarContent,
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
        },
        {
          y: 1,
          scale: 0.992,
          autoAlpha: 0.92,
          duration: reducedAnimations ? 0.16 : 0.58,
          ease: 'expo.out',
          clearProps: 'transform,opacity,visibility',
        },
        0,
      );

    if (iconContainer) {
      timeline.fromTo(
        iconContainer,
        { y: reducedAnimations ? 4 : 10, scale: 0.9, autoAlpha: 0 },
        {
          y: -1,
          scale: 1,
          autoAlpha: 1,
          duration: reducedAnimations ? 0.14 : 0.46,
          ease: 'expo.out',
          clearProps: 'transform,opacity,visibility',
        },
        reducedAnimations ? 0.02 : 0.05,
      );
    }

    if (details) {
      timeline.fromTo(
        details,
        { y: reducedAnimations ? 4 : 10, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reducedAnimations ? 0.14 : 0.28,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
        },
        reducedAnimations ? 0.04 : 0.09,
      );
    }

    if (primaryMeta && rows.length === 0) {
      timeline.fromTo(
        primaryMeta,
        { y: reducedAnimations ? 2 : 6, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reducedAnimations ? 0.12 : 0.22,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        },
        reducedAnimations ? 0.06 : 0.14,
      );
    }

    if (rows.length > 0) {
      timeline.fromTo(
        rows,
        { y: reducedAnimations ? 2 : 6, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          stagger: reducedAnimations ? 0.02 : 0.045,
          duration: reducedAnimations ? 0.12 : 0.22,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        },
        reducedAnimations ? 0.06 : 0.14,
      );
    }

    if (actionButton) {
      timeline.fromTo(
        actionButton,
        { y: reducedAnimations ? 2 : 6, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reducedAnimations ? 0.12 : 0.22,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        },
        reducedAnimations ? 0.08 : 0.18,
      );
    }
  }

  private animateExtendedBarExit(
    bottomBar: HTMLElement,
    content: HTMLElement,
    onComplete: () => void,
  ) {
    const gsapRef = window.gsap as any;
    const statusBarContent =
      bottomBar.querySelector<HTMLElement>('.status-bar-content');

    if (
      !gsapRef ||
      !statusBarContent ||
      document.body.classList.contains('no-animations')
    ) {
      bottomBar.classList.remove('gsap-island-animating');
      this.clearIslandGsapTimeline();
      onComplete();
      return;
    }

    this.clearIslandGsapTimeline();
    bottomBar.classList.add('gsap-island-animating');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const card = content.firstElementChild as HTMLElement | null;
    const iconContainer =
      card?.querySelector<HTMLElement>('.ext-card-icon-container') || null;
    const detailBlocks = card
      ? Array.from(card.querySelectorAll<HTMLElement>('.ext-card-details > *'))
      : [];
    const actionButton =
      card?.querySelector<HTMLElement>('.ext-action-btn') || null;
    const transformOrigin = bottomBar.classList.contains('conflict-mode')
      ? 'right bottom'
      : 'left bottom';
    const timeline = gsapRef.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        onComplete();
        this.resetIslandAnimationStyles(bottomBar, statusBarContent, content);
        bottomBar.classList.remove('gsap-island-animating');
        this.islandGsapTimeline = null;
      },
    });

    this.islandGsapTimeline = timeline;
    bottomBar.style.willChange = 'transform';
    statusBarContent.style.willChange = 'transform, opacity, filter';
    content.style.willChange = 'transform, opacity, filter, clip-path';

    if (detailBlocks.length > 0) {
      timeline.to(
        detailBlocks,
        {
          y: reducedAnimations ? 2 : 6,
          autoAlpha: 0,
          stagger: reducedAnimations ? 0.01 : 0.02,
          duration: reducedAnimations ? 0.08 : 0.14,
          ease: 'power1.in',
        },
        0,
      );
    }

    if (actionButton) {
      timeline.to(
        actionButton,
        {
          y: reducedAnimations ? 2 : 5,
          autoAlpha: 0,
          duration: reducedAnimations ? 0.08 : 0.12,
          ease: 'power1.in',
        },
        0,
      );
    }

    if (iconContainer) {
      timeline.to(
        iconContainer,
        {
          y: reducedAnimations ? 3 : 6,
          scale: 0.9,
          autoAlpha: 0,
          duration: reducedAnimations ? 0.1 : 0.16,
          ease: 'power2.in',
        },
        0,
      );
    }

    timeline
      .to(
        content,
        {
          transformOrigin,
          y: reducedAnimations ? 8 : 14,
          scaleX: 0.982,
          scaleY: 0.82,
          autoAlpha: 0,
          filter: 'blur(12px) saturate(0.9)',
          clipPath: 'inset(100% -50px 0 -50px)',
          duration: reducedAnimations ? 0.16 : 0.34,
          ease: 'power3.in',
        },
        0,
      )
      .to(
        bottomBar,
        {
          y: 0,
          scaleY: 1,
          duration: reducedAnimations ? 0.16 : 0.32,
          ease: 'power2.out',
        },
        0.02,
      )
      .to(
        statusBarContent,
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: reducedAnimations ? 0.14 : 0.28,
          ease: 'power2.out',
        },
        0.02,
      );
  }

  private restartTransientElementAnimation(
    element: HTMLElement | null,
    className: string,
    duration: number,
  ) {
    if (!element) {
      return;
    }

    const existingTimeout = this.transientElementTimers.get(element);
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
      this.transientElementTimers.delete(element);
    }, effectiveDuration);

    this.transientElementTimers.set(element, timeout);
  }

  private setAnimatedElementText(
    element: HTMLElement | null,
    nextText: string,
    className = 'ext-count-bump',
    duration = 420,
  ) {
    if (!element) {
      return;
    }

    const previousText = element.textContent ?? '';
    element.textContent = nextText;

    if (previousText !== nextText) {
      this.restartTransientElementAnimation(element, className, duration);
    }
  }

  private getIslandMode(bottomBar: HTMLElement) {
    if (bottomBar.classList.contains('success-mode')) {
      return 'success';
    }

    if (bottomBar.classList.contains('conflict-mode')) {
      return 'conflict';
    }

    if (bottomBar.classList.contains('download-mode')) {
      return 'download';
    }

    return 'idle';
  }

  private triggerIslandPulse(
    bottomBar: HTMLElement,
    mode: 'download' | 'success' | 'conflict',
  ) {
    if (document.body.classList.contains('no-animations')) {
      return;
    }

    this.clearIslandAnimationTimers();

    bottomBar.classList.remove('island-pulse', 'island-settle', 'island-collapse');
    bottomBar.dataset.islandMode = mode;

    // Force reflow so repeated pulses retrigger cleanly.
    bottomBar.offsetHeight;
    bottomBar.classList.add('island-pulse');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const pulseDuration = reducedAnimations ? 220 : 720;
    const settleDuration = reducedAnimations ? 140 : 420;

    this.islandPulseTimeout = setTimeout(() => {
      bottomBar.classList.remove('island-pulse');
      bottomBar.classList.add('island-settle');

      this.islandSettleTimeout = setTimeout(() => {
        bottomBar.classList.remove('island-settle');
      }, settleDuration);
    }, pulseDuration);
  }

  private triggerIslandCollapse(bottomBar: HTMLElement) {
    if (document.body.classList.contains('no-animations')) {
      bottomBar.classList.remove('island-pulse', 'island-settle', 'island-collapse');
      return;
    }

    this.clearIslandAnimationTimers();
    bottomBar.classList.remove('island-pulse', 'island-settle');
    bottomBar.classList.add('island-collapse');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const collapseDuration = reducedAnimations ? 180 : 420;

    this.islandPulseTimeout = setTimeout(() => {
      bottomBar.classList.remove('island-collapse');
    }, collapseDuration);
  }

  private beginStatusCycle() {
    this.clearUpdateLoop();
    this.statusCycleId += 1;
    return this.statusCycleId;
  }

  private isStatusCycleCurrent(cycleId: number) {
    return cycleId === this.statusCycleId;
  }

  private hasTemporaryStatus() {
    return this.temporaryStatus !== null;
  }

  private isActiveDownloadState(download: any) {
    return (
      download?.status === 'downloading' || download?.status === 'extracting'
    );
  }

  private hasDownloadsInProgress() {
    if (!window.downloadManager) {
      return false;
    }

    if (window.downloadManager.ftpTransfer) {
      return true;
    }

    const activeDownloadsMap = (window.downloadManager as any).activeDownloads;
    if (!activeDownloadsMap) {
      return false;
    }

    return Array.from(activeDownloadsMap.values()).some((download: any) =>
      this.isActiveDownloadState(download),
    );
  }

  private normalizeTab(tabName: string | null | undefined): StatusTab | null {
    const validTabs: StatusTab[] = [
      'downloads',
      'tools',
      'plugins',
      'settings',
      'characters',
      'stages',
      'fightplanner',
    ];

    if (!tabName) {
      return null;
    }

    return validTabs.includes(tabName as StatusTab)
      ? (tabName as StatusTab)
      : null;
  }

  private syncCurrentTabFromSidebar() {
    const activeButton = document.querySelector<HTMLElement>('.sidebar-btn.active');
    const tabId = activeButton?.getAttribute('data-tab');
    const normalizedTab = this.normalizeTab(tabId);
    if (normalizedTab) {
      this.currentTab = normalizedTab;
    }
  }

  private isCustomStatusPayload(tabName: string) {
    return (
      tabName.startsWith('statusBar.') ||
      tabName.includes('...') ||
      tabName.includes('\u2026')
    );
  }

  private resolveCustomStatusPayload(tabName: string): StatusSnapshot {
    return {
      content: tabName.startsWith('statusBar.') ? this.t(tabName) : tabName,
    };
  }

  private buildStatusSignature(snapshot: StatusSnapshot) {
    return [
      snapshot.useInnerHTML ? 'html' : 'text',
      snapshot.downloading ? 'downloading' : 'idle',
      snapshot.content,
    ].join('|');
  }

  private normalizeStatusContent(content: string) {
    if (!content) {
      return content;
    }

    let normalized = content;

    if (/(?:Ã.|Â|â€¢|â€¦|â€)/.test(normalized)) {
      try {
        const bytes = new Uint8Array(
          Array.from(normalized, (char) => char.charCodeAt(0) & 0xff),
        );
        const decoded = new TextDecoder('utf-8').decode(bytes);
        if (!decoded.includes('\uFFFD')) {
          normalized = decoded;
        }
      } catch (error) {
        // Fall back to explicit replacements below.
      }
    }

    return normalized
      .replace(/Ã¢â‚¬Â¢|â€¢/g, '\u2022')
      .replace(/Ã¢â‚¬Â¦|â€¦/g, '\u2026')
      .replace(/Ã©/g, 'é')
      .replace(/Ã¨/g, 'è')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã /g, 'à')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã»/g, 'û')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã®/g, 'î')
      .replace(/Â/g, '');
  }

  private renderStatus(
    snapshot: StatusSnapshot,
    options: { force?: boolean } = {},
  ) {
    if ((this.preservedStatus || this.hasTemporaryStatus()) && !options.force) {
      return false;
    }

    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return false;
    }

    const normalizedSnapshot = {
      ...snapshot,
      content: this.normalizeStatusContent(snapshot.content),
    };
    const signature = this.buildStatusSignature(normalizedSnapshot);
    statusText.classList.toggle(
      'status-downloading',
      normalizedSnapshot.downloading === true,
    );

    if (this.renderedStatusSignature === signature) {
      return true;
    }

    if (normalizedSnapshot.useInnerHTML) {
      statusText.innerHTML = normalizedSnapshot.content;
    } else {
      statusText.textContent = normalizedSnapshot.content;
    }

    this.renderedStatusSignature = signature;
    return true;
  }

  private applySnapshot(
    snapshot: StatusSnapshot,
    options: { animate?: boolean; force?: boolean; cycleId?: number } = {},
  ) {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    const normalizedSnapshot = {
      ...snapshot,
      content: this.normalizeStatusContent(snapshot.content),
    };
    const signature = this.buildStatusSignature(normalizedSnapshot);
    if (this.renderedStatusSignature === signature && !options.force) {
      this.renderStatus(normalizedSnapshot, options);
      return;
    }

    const render = () => {
      if (
        options.cycleId !== undefined &&
        !this.isStatusCycleCurrent(options.cycleId)
      ) {
        return;
      }

      this.renderStatus(normalizedSnapshot, options);
    };

    if (options.animate) {
      this.animateStatusChange(statusText, render);
      return;
    }

    render();
  }

  private getPluralSuffix(count: number) {
    return count !== 1 ? 's' : '';
  }

  private getToolsSnapshot(): StatusSnapshot {
    try {
      if (window.modManager?.mods) {
        const mods = window.modManager.mods;
        const enabledMods = mods.filter((mod) => mod.status === 'active').length;

        return {
          content: this.t('statusBar.modsEnabled', {
            enabled: enabledMods,
            total: mods.length,
            plural: this.getPluralSuffix(mods.length),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.modsReady') };
  }

  private getPluginsSnapshot(): StatusSnapshot {
    try {
      if (window.pluginManager) {
        const plugins = window.pluginManager.plugins || [];
        const enabledPlugins = plugins.filter((plugin) => plugin.enabled !== false)
          .length;

        return {
          content: this.t('statusBar.pluginsEnabled', {
            enabled: enabledPlugins,
            total: plugins.length,
            plural: this.getPluralSuffix(plugins.length),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.pluginsReady') };
  }

  private getCharactersSnapshot(): StatusSnapshot {
    try {
      if (window.charactersManager?.characters) {
        const count = window.charactersManager.characters.size;
        return {
          content: this.t('statusBar.charactersAvailable', {
            count,
            plural: this.getPluralSuffix(count),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.charactersReady') };
  }

  private getSettingsSnapshot(): StatusSnapshot {
    return { content: this.t('statusBar.settings') };
  }

  private getStagesSnapshot(): StatusSnapshot {
    return { content: this.t('statusBar.stages') };
  }

  private getDownloadsIdleSnapshot(): StatusSnapshot {
    if (!window.downloadManager || !(window.downloadManager as any).activeDownloads) {
      return { content: this.t('statusBar.downloadsReady') };
    }

    const completedCount = window.downloadManager.completedDownloads
      ? window.downloadManager.completedDownloads.length
      : 0;

    if (completedCount > 0) {
      return {
        content: this.t('statusBar.downloadsCompleted', {
          count: completedCount,
          plural: this.getPluralSuffix(completedCount),
        }),
      };
    }

    return { content: this.t('statusBar.downloadsNoActive') };
  }

  private getSnapshotForTab(tab: StatusTab): StatusSnapshot {
    switch (tab) {
      case 'downloads':
        return this.getDownloadsIdleSnapshot();
      case 'tools':
        return this.getToolsSnapshot();
      case 'plugins':
        return this.getPluginsSnapshot();
      case 'settings':
        return this.getSettingsSnapshot();
      case 'characters':
        return this.getCharactersSnapshot();
      case 'stages':
        return this.getStagesSnapshot();
      case 'fightplanner':
      default:
        return { content: this.t('statusBar.ready') };
    }
  }

  private collapseTransientExtendedBar() {
    const bottomBar = document.getElementById('main-status-bar');
    if (
      bottomBar &&
      bottomBar.classList.contains('expanded') &&
      !bottomBar.classList.contains('conflict-mode') &&
      !bottomBar.classList.contains('success-mode')
    ) {
      this.updateExtendedBar({ type: 'none' });
    }
  }

  private canRefreshTab(cycleId: number, tab: StatusTab) {
    return (
      this.isStatusCycleCurrent(cycleId) &&
      this.currentTab === tab &&
      !this.preservedStatus &&
      !this.hasModalOpen() &&
      !this.hasTemporaryStatus() &&
      !this.hasDownloadsInProgress()
    );
  }

  private startStaticTabPolling(
    tab: 'tools' | 'plugins' | 'characters',
    cycleId: number,
  ) {
    this.updateInterval = setInterval(() => {
      if (!this.canRefreshTab(cycleId, tab)) {
        this.clearUpdateLoop();
        return;
      }

      this.applySnapshot(this.getSnapshotForTab(tab), { cycleId });
    }, 10000);
  }

  private renderCurrentTab(cycleId: number, animate: boolean) {
    if (!this.currentTab) {
      return;
    }

    this.applySnapshot(this.getSnapshotForTab(this.currentTab), {
      animate,
      cycleId,
    });

    switch (this.currentTab) {
      case 'tools':
        this.startStaticTabPolling('tools', cycleId);
        break;
      case 'plugins':
        this.startStaticTabPolling('plugins', cycleId);
        break;
      case 'characters':
        this.startStaticTabPolling('characters', cycleId);
        break;
      case 'downloads':
      case 'settings':
      case 'stages':
      case 'fightplanner':
      default:
        break;
    }
  }

  updateStatus(tabName) {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    const normalizedTab = this.normalizeTab(tabName);
    if (normalizedTab) {
      this.currentTab = normalizedTab;
    } else if (!this.currentTab) {
      this.syncCurrentTabFromSidebar();
    }

    if (typeof tabName === 'string' && this.isCustomStatusPayload(tabName)) {
      const cycleId = this.beginStatusCycle();
      this.applySnapshot(this.resolveCustomStatusPayload(tabName), {
        animate: !this.preservedStatus,
        cycleId,
      });
      return;
    }

    if (!this.currentTab) {
      return;
    }

    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    if (this.preservedStatus && !modalOpen && !hasActiveDownloads) {
      this.preservedStatus = null;
    }

    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    const cycleId = this.beginStatusCycle();

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      this.startDownloadsStatusLoop(cycleId);
      return;
    } else {
      this.collapseTransientExtendedBar();
      this.renderCurrentTab(cycleId, true);
    }
  }

  animateStatusChange(statusText, callback) {
    if (
      this.preservedStatus ||
      (this.hasModalOpen() && !this.checkActiveDownloads())
    ) {
      return;
    }

    const isReducedAnimations =
      document.body.classList.contains('reduced-animations');
    const isNoAnimations = document.body.classList.contains('no-animations');
    const bottomBar = document.getElementById('main-status-bar');

    if (isNoAnimations) {
      callback();
      return;
    }

    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
    }

    this.animationCounter++;
    const myCounter = this.animationCounter;
    const cleanupAnimation = () => {
      statusText.style.transition = '';
      statusText.style.opacity = '';
      statusText.style.transform = '';
      statusText.style.filter = '';
      statusText.style.willChange = '';
      statusText.classList.remove('status-changing');
      if (bottomBar && !bottomBar.classList.contains('expanded')) {
        bottomBar.classList.remove('collapsed-status-swap');
      }
    };

    statusText.classList.add('status-changing');
    statusText.style.willChange = 'opacity, transform, filter';
    if (bottomBar && !bottomBar.classList.contains('expanded')) {
      bottomBar.classList.remove('collapsed-status-swap');
      bottomBar.offsetHeight;
      bottomBar.classList.add('collapsed-status-swap');
    }

    if (isReducedAnimations) {
      statusText.style.transition =
        'opacity 0.12s ease-out, transform 0.12s ease-out, filter 0.12s ease-out';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translate3d(0, 4px, 0) scale(0.994)';
      statusText.style.filter = 'blur(2px)';

      this.animationTimeout = setTimeout(() => {
        if (myCounter !== this.animationCounter) return;
        this.animationTimeout = null;
        callback();

        statusText.style.transition = 'none';
        statusText.style.opacity = '0';
        statusText.style.transform = 'translate3d(0, -4px, 0) scale(1.004)';
        statusText.style.filter = 'blur(2px)';

        requestAnimationFrame(() => {
          if (myCounter !== this.animationCounter) return;
          statusText.style.transition =
            'opacity 0.16s ease-out, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), filter 0.16s ease-out';
          statusText.style.opacity = '1';
          statusText.style.transform = 'translate3d(0, 0, 0) scale(1)';
          statusText.style.filter = 'blur(0)';

          setTimeout(() => {
            if (myCounter !== this.animationCounter) return;
            cleanupAnimation();
          }, 180);
        });
      }, 110);
    } else {
      statusText.style.transition =
        'opacity 0.16s ease-in, transform 0.18s cubic-bezier(0.55, 0, 0.75, 0), filter 0.16s ease-in';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translate3d(0, 7px, 0) scale(0.986)';
      statusText.style.filter = 'blur(5px)';

      this.animationTimeout = setTimeout(() => {
        if (myCounter !== this.animationCounter) return;
        this.animationTimeout = null;
        callback();

        statusText.style.transition = 'none';
        statusText.style.opacity = '0';
        statusText.style.transform = 'translate3d(0, -9px, 0) scale(1.012)';
        statusText.style.filter = 'blur(6px)';

        requestAnimationFrame(() => {
          if (myCounter !== this.animationCounter) return;
          statusText.style.transition =
            'opacity 0.24s ease-out, transform 0.34s cubic-bezier(0.16, 1, 0.3, 1), filter 0.26s ease-out';
          statusText.style.opacity = '1';
          statusText.style.transform = 'translate3d(0, 0, 0) scale(1)';
          statusText.style.filter = 'blur(0)';

          setTimeout(() => {
            if (myCounter !== this.animationCounter) return;
            cleanupAnimation();
          }, 340);
        });
      }, 150);
    }
  }

  hasModalOpen() {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (overlay && overlay.style.display === 'block') {
      return true;
    }

    const allModals = document.querySelectorAll<HTMLElement>(
      '.modal, .character-modal-overlay',
    );
    for (const modal of allModals) {
      if (modal.style.display === 'block' || modal.style.display === 'flex') {
        return true;
      }
    }
    return false;
  }

  preserveCurrentStatus() {
    const statusText = this.getStatusTextElement();
    if (statusText) {
      const currentStatus = statusText.textContent || statusText.innerHTML;
      if (
        currentStatus &&
        currentStatus.trim() &&
        currentStatus !== this.t('statusBar.ready') &&
        currentStatus !== 'Ready' &&
        currentStatus !== 'Prêt'
      ) {
        this.preservedStatus = currentStatus;
      }
    }
  }

  restorePreservedStatus() {
    if (
      this.preservedStatus &&
      !this.hasDownloadsInProgress() &&
      !this.hasModalOpen()
    ) {
      const statusText = this.getStatusTextElement();
      if (statusText) {
        this.renderStatus(
          {
            content: this.preservedStatus,
          },
          { force: true },
        );
        this.preservedStatus = null;
        if (this.currentTab) {
          setTimeout(() => {
            if (!this.hasModalOpen() && !this.hasDownloadsInProgress()) {
              this.updateStatus(this.currentTab);
            }
          }, 100);
        }
      } else {
        this.preservedStatus = null;
      }
    }
  }

  setStatusText(content, useInnerHTML = false) {
    return this.renderStatus({ content, useInnerHTML });
  }

  showTemporaryStatus(
    content,
    options: { useInnerHTML?: boolean; autoRestoreMs?: number } = {},
  ) {
    if (this.temporaryStatusTimeout) {
      clearTimeout(this.temporaryStatusTimeout);
      this.temporaryStatusTimeout = null;
    }

    this.beginStatusCycle();
    this.temporaryStatus = {
      content,
      useInnerHTML: options.useInnerHTML === true,
    };
    this.renderStatus(this.temporaryStatus, { force: true });

    if (options.autoRestoreMs && options.autoRestoreMs > 0) {
      this.temporaryStatusTimeout = setTimeout(() => {
        this.clearTemporaryStatus();
      }, options.autoRestoreMs);
    }
  }

  clearTemporaryStatus() {
    if (this.temporaryStatusTimeout) {
      clearTimeout(this.temporaryStatusTimeout);
      this.temporaryStatusTimeout = null;
    }

    if (!this.temporaryStatus) {
      return;
    }

    this.temporaryStatus = null;
    this.refreshStandardStatus();
  }

  private startDownloadsStatusLoop(cycleId: number) {
    let animationFrame = 0;
    let lastUpdateTime = Date.now();
    const lastReceivedBytes = new Map();

    const renderDownloadStatus = () => {
      if (!this.isStatusCycleCurrent(cycleId)) {
        this.clearUpdateLoop();
        return;
      }

      if (this.hasTemporaryStatus()) {
        this.renderStatus(this.temporaryStatus!, { force: true });
        this.clearUpdateLoop();
        return;
      }

      if (this.preservedStatus && !this.hasDownloadsInProgress()) {
        return;
      }

      if (this.hasModalOpen() && !this.hasDownloadsInProgress()) {
        return;
      }

      try {
        if (window.downloadManager?.ftpTransfer) {
          const ftp = window.downloadManager.ftpTransfer;
          const dots = '.'.repeat(animationFrame % 4);
          animationFrame += 1;
          const details: string[] = [];
          const progress = Math.max(
            0,
            Math.min(
              100,
              Math.round(
                ftp.progress ||
                  (ftp.totalFiles > 0
                    ? (ftp.transferredCount / ftp.totalFiles) * 100
                    : 0),
              ),
            ),
          );

          let statusContent;
          if (ftp.totalMods > 0) {
            statusContent = this.t('statusBar.ftpSending', {
              current: ftp.currentMod || 0,
              total: ftp.totalMods || 0,
            });
          } else {
            statusContent = this.t('statusBar.ftpSending', {
              current: '',
              total: '',
            }).replace(` \u2022 / mods`, '');
          }

          if (ftp.totalFiles > 0) {
            details.push(`${ftp.transferredCount}/${ftp.totalFiles} files`);
          }

          if (progress > 0) {
            details.push(`${progress}%`);
          }

          if (ftp.currentFileName) {
            const shortFileName =
              ftp.currentFileName.length > 26
                ? `${ftp.currentFileName.substring(0, 23)}...`
                : ftp.currentFileName;
            details.push(shortFileName);
          }

          const detailsSuffix =
            details.length > 0 ? ` • ${details.join(' • ')}` : '';

          this.renderStatus(
            {
              content: `${statusContent}${detailsSuffix}${dots}`,
              downloading: true,
            },
            { force: true },
          );
          return;
        }

        const activeDownloads = Array.from(
          window.downloadManager?.activeDownloads?.values() || [],
        ).filter((download: any) => this.isActiveDownloadState(download));

        if (activeDownloads.length === 0) {
          const statusText = this.getStatusTextElement();
          if (statusText) {
            statusText.classList.remove('status-downloading');
          }

          this.clearUpdateLoop();

          if (this.currentTab === 'downloads') {
            this.applySnapshot(this.getDownloadsIdleSnapshot(), { cycleId });
          } else {
            this.refreshStandardStatus();
          }

          return;
        }

        const firstDownload: any = activeDownloads[0];
        const currentTime = Date.now();
        const timeDelta = (currentTime - lastUpdateTime) / 1000;

        let speedText = '';
        let progressText = '';

        if (
          firstDownload.receivedBytes !== undefined &&
          firstDownload.totalBytes !== undefined &&
          firstDownload.totalBytes > 0
        ) {
          const progress = Math.round(
            (firstDownload.receivedBytes / firstDownload.totalBytes) * 100,
          );
          progressText = `${progress}%`;

          const downloadId = firstDownload.id;
          const lastBytes = lastReceivedBytes.get(downloadId) || 0;
          const bytesDelta = firstDownload.receivedBytes - lastBytes;

          if (timeDelta > 0 && bytesDelta > 0) {
            const speedBytes = bytesDelta / timeDelta;
            speedText = this.formatSpeed(speedBytes);
          }

          lastReceivedBytes.set(downloadId, firstDownload.receivedBytes);
        } else if (firstDownload.progress !== undefined) {
          progressText = `${Math.round(firstDownload.progress)}%`;
        }

        let sizeInfo = '';
        if (
          firstDownload.totalBytes !== undefined &&
          firstDownload.totalBytes > 0
        ) {
          const received = firstDownload.receivedBytes || 0;
          sizeInfo = `${this.formatBytes(received)} / ${this.formatBytes(
            firstDownload.totalBytes,
          )}`;
        }

        const fileName =
          firstDownload.modName ||
          firstDownload.fileName ||
          firstDownload.url?.split('/').pop() ||
          'Downloading...';
        const shortFileName =
          fileName.length > 30 ? `${fileName.substring(0, 27)}...` : fileName;

        const dots = '.'.repeat(animationFrame % 4);
        const activeIndicator =
          activeDownloads.length > 1 ? ` [${activeDownloads.length} active]` : '';

        const progressPart = progressText ? ` \u2022 ${progressText}` : '';
        const sizePart = sizeInfo ? ` \u2022 ${sizeInfo}` : '';
        const speedPart = speedText ? ` \u2022 ${speedText}` : '';

        this.renderStatus(
          {
            content:
              this.t('statusBar.downloadsDownloading', {
                fileName: shortFileName,
                progress: progressPart,
                size: sizePart,
                speed: speedPart,
              }) + dots + activeIndicator,
            downloading: true,
          },
          { force: true },
        );

        lastUpdateTime = currentTime;
        animationFrame += 1;
      } catch (error) {
        const statusText = this.getStatusTextElement();
        if (statusText) {
          statusText.classList.remove('status-downloading');
        }

        this.clearUpdateLoop();

        if (this.currentTab === 'downloads') {
          this.applySnapshot(this.getDownloadsIdleSnapshot(), { cycleId });
        } else {
          this.refreshStandardStatus();
        }
      }
    };

    renderDownloadStatus();

    this.updateInterval = setInterval(() => {
      renderDownloadStatus();
    }, 500);
  }

  completeFtpTransfer(transferredCount = 0) {
    this.clearUpdateLoop();
    this.hasActiveDownloads = false;

    const statusText = this.getStatusTextElement();
    if (statusText) {
      statusText.classList.remove('status-downloading');
    }

    const label =
      transferredCount > 0
        ? `Switch transfer completed (${transferredCount} files)`
        : 'Switch transfer completed';
    const completedStatus =
      transferredCount > 0
        ? this.t('statusBar.ftpCompletedWithFiles', {
            count: transferredCount,
          })
        : this.t('statusBar.ftpCompleted');

    this.showTemporaryStatus(completedStatus, { autoRestoreMs: 2600 });

    if (this.isEnhancedStatusBarEnabled()) {
      this.userDismissedExtendedBar = false;
      this.lastExtendedBarData = `ftp-complete:${Date.now()}`;
      this.updateExtendedBar({
        type: 'success',
        fileName: label,
      });

      setTimeout(() => {
        const bottomBar = document.getElementById('main-status-bar');
        if (bottomBar?.classList.contains('success-mode')) {
          this.updateExtendedBar({ type: 'none' });
        }
        this.refreshStandardStatus();
      }, 2200);
      return;
    }

    this.updateExtendedBar({ type: 'none' });
    this.refreshStandardStatus();
  }

  _getDownloadDisplayName(dl: DownloadItem): string {
    if (dl.modName) return dl.modName;
    if (dl.statusText && !dl.statusText.toLowerCase().includes('downloading')) return dl.statusText;
    const name = dl.fileName || '';
    if (/^\d+$/.test(name) || name === 'mod.zip') return 'Downloading...';
    return name;
  }

  updateExtendedBar(
    update: NoneUpdate | SuccessUpdate | ConflictUpdate | DownloadUpdate,
  ) {
    if (typeof update === 'string' && update === 'none') {
      update = { type: 'none' } as NoneUpdate;
    }

    const bottomBar = document.getElementById('main-status-bar');
    if (!bottomBar) return;

    const content = bottomBar.querySelector('.extended-content');
    const enabled = this.isEnhancedStatusBarEnabled();
    const wasExpanded = bottomBar.classList.contains('expanded');
    const previousMode = this.getIslandMode(bottomBar);

    if (update.type === 'none' || !enabled || !content) {
      if (update.type === 'none') {
        this.userDismissedExtendedBar = true;
      }

      if (bottomBar.classList.contains('expanded')) {
        this.triggerIslandCollapse(bottomBar);
        const finalizeCollapse = () => {
          bottomBar.classList.remove('expanded');
          bottomBar.classList.remove(
            'download-mode',
            'conflict-mode',
            'success-mode',
          );
          bottomBar.dataset.islandMode = 'idle';

          if (content) {
            delete (content as HTMLElement).dataset.extendedSignature;
            (content as HTMLElement).style.display = 'none';
            (content as HTMLElement).innerHTML = '';
          }
        };

        if (content) {
          this.animateExtendedBarExit(
            bottomBar,
            content as HTMLElement,
            finalizeCollapse,
          );
        } else {
          finalizeCollapse();
        }
      } else if (content) {
        delete (content as HTMLElement).dataset.extendedSignature;
        (content as HTMLElement).style.display = 'none';
        (content as HTMLElement).innerHTML = '';
      }
      return;
    }

    if (update.type === 'download') {
      delete (content as HTMLElement).dataset.extendedSignature;

      if (!bottomBar.classList.contains('download-mode')) {
        bottomBar.classList.remove('conflict-mode', 'success-mode');
        bottomBar.classList.add('download-mode');
      }

      if (this.pendingDynamicIsland) {
        return;
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      const shouldAnimateEntrance = !wasExpanded || previousMode !== 'download';

      if (shouldAnimateEntrance) {
        this.triggerIslandPulse(bottomBar, 'download');
      }

      (content as HTMLElement).style.display = 'flex';

      const downloads = update.downloads || [];
      const isSingle = downloads.length === 1;

      if (isSingle) {
        const dl = downloads[0];
        const progress = Math.round(dl.progress || 0);
        let speed = dl.speedText || '';
        const displayName = this._getDownloadDisplayName(dl);

        let phaseText = dl.phaseLabel || 'Downloading';
        let iconClass = dl.iconClass || 'bi-cloud-arrow-down-fill';
        let isExtractingOrVerifying = false;

        if (!dl.phaseLabel && dl.statusText) {
          const lowerStatus = dl.statusText.toLowerCase();
          if (lowerStatus.includes('extract')) {
            phaseText = 'Extracting...';
            iconClass = 'bi-file-zip-fill';
            isExtractingOrVerifying = true;
          } else if (lowerStatus.includes('verif')) {
            phaseText = 'Verifying...';
            iconClass = 'bi-shield-check';
            isExtractingOrVerifying = true;
          }
        }

        if (isExtractingOrVerifying) {
          speed = '';
        }

        const isActiveDownloadCard = content.querySelector('.ext-download-card .ext-progress-container');
        const isMultiCard = content.querySelector('.ext-multi-download-card');
        const canPatchExistingCard =
          wasExpanded &&
          previousMode === 'download' &&
          isActiveDownloadCard &&
          !isMultiCard;

        if (canPatchExistingCard) {
            const fileNameEl = content.querySelector('.ext-filename');
            const progressFillEl = content.querySelector('.ext-progress-fill') as HTMLElement;
            const percentageEl = content.querySelector('.ext-percentage');
            const speedEl = content.querySelector('.ext-speed');
            const badgeEl = content.querySelector('.ext-status-badge');
            const iconEl = content.querySelector('.ext-card-icon i');
            const metaEl = content.querySelector('.ext-download-meta') as HTMLElement;
            const phaseEl = content.querySelector('.ext-download-phase');
            const separatorEl = content.querySelector('.ext-separator');
            const glareEl = content.querySelector('.ext-progress-glare');

            if (fileNameEl) {
                fileNameEl.setAttribute('title', displayName);
                this.animateElementTextChange(
                  fileNameEl as HTMLElement,
                  displayName,
                  'ext-text-swap',
                  280,
                );
            }
            this.animateProgressFill(progressFillEl, progress);

            if (badgeEl) {
                this.animateElementTextChange(badgeEl as HTMLElement, phaseText);
            }
            if (iconEl && iconEl.className !== `bi ${iconClass}`) {
                iconEl.className = `bi ${iconClass}`;
            }

            if (isExtractingOrVerifying) {
              if (percentageEl) {
                this.animateElementTextChange(
                  percentageEl as HTMLElement,
                  phaseText,
                  'ext-text-swap',
                  280,
                );
              }
              if (speedEl) {
                this.animateElementTextChange(
                  speedEl as HTMLElement,
                  '',
                  'ext-text-swap',
                  280,
                );
              }
            } else {
              if (percentageEl) {
                this.animateElementTextChange(
                  percentageEl as HTMLElement,
                  `${progress}%`,
                  'ext-text-swap',
                  280,
                );
              }
              if (speedEl) {
                this.animateElementTextChange(
                  speedEl as HTMLElement,
                  speed,
                  'ext-text-swap',
                  280,
                );
              }
            }

            if (metaEl) {
              metaEl.style.display = speed ? 'flex' : 'none';
            }

            phaseEl?.remove();
            separatorEl?.remove();
            glareEl?.remove();
        } else {
            this.renderDownloadCardWithFlip(content as HTMLElement, () => {
              content.innerHTML = `
              <div class="ext-download-card" data-flip-id="download-shell">
                  <button class="ext-close-btn" data-flip-id="download-close" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                      <i class="bi bi-chevron-down"></i>
                  </button>
                  <div class="ext-card-icon-container" data-flip-id="download-icon">
                      <div class="ext-card-icon">
                          <i class="bi ${iconClass}"></i>
                      </div>
                  </div>
                  <div class="ext-card-details" data-flip-id="download-details">
                      <div class="ext-download-topline" data-flip-id="download-topline">
                          <span class="ext-status-badge" data-flip-id="download-badge">${phaseText}</span>
                      </div>
                      <div class="ext-card-header ext-download-header" data-flip-id="download-header">
                          <span class="ext-filename" data-flip-id="${this.getDownloadNameFlipKey(dl.id)}" title="${displayName}">${displayName}</span>
                      </div>

                      <div class="ext-progress-row" data-flip-id="download-body">
                          <div class="ext-progress-container" data-flip-id="${this.getDownloadProgressFlipKey(dl.id)}">
                              <div class="ext-progress-track">
                                  <div class="ext-progress-fill" style="width: ${progress}%"></div>
                              </div>
                          </div>
                          <span class="ext-percentage">${isExtractingOrVerifying ? phaseText : progress + '%'}</span>
                      </div>
                      
                      <div class="ext-card-meta ext-download-meta">
                          <span class="ext-speed">${speed}</span>
                          <span class="ext-separator" style="display: ${isExtractingOrVerifying ? 'none' : 'inline'}">•</span>
                          <span class="ext-download-phase">${phaseText}</span>
                      </div>
                  </div>
              </div>
            `;

              const metaEl = content.querySelector('.ext-download-meta') as HTMLElement | null;
              const phaseEl = content.querySelector('.ext-download-phase');
              const separatorEl = content.querySelector('.ext-separator');

              if (metaEl) {
                metaEl.style.display = speed ? 'flex' : 'none';
              }

              phaseEl?.remove();
              separatorEl?.remove();
            });
        }
      } else {
        const existingItems = content.querySelectorAll('.ext-multi-dl-item');
        const existingIds = new Set<string>();
        existingItems.forEach((el) => {
          const id = (el as HTMLElement).dataset.dlId;
          if (id) existingIds.add(id);
        });

        const currentIds = new Set(downloads.map(d => d.id));
        let needsFullRebuild = !content.querySelector('.ext-multi-download-card');

        if (!needsFullRebuild) {
          for (const id of existingIds) {
            if (!currentIds.has(id)) { needsFullRebuild = true; break; }
          }
          for (const id of currentIds) {
            if (!existingIds.has(id)) { needsFullRebuild = true; break; }
          }
        }

        if (needsFullRebuild) {
          if (
            content.querySelector('.ext-multi-download-card') &&
            this.animateMultiDownloadListChanges(content as HTMLElement, downloads)
          ) {
            // The list update is animated internally without rebuilding the panel.
          } else {
            const itemsHtml = downloads.map((dl) => {
              const { progress, displayName, pctText } =
                this.getMultiDownloadViewData(dl);

              return `
                <div class="ext-multi-dl-item" data-dl-id="${dl.id}" data-flip-id="${this.getDownloadFlipKey(dl.id)}">
                  <div class="ext-multi-dl-info">
                    <span class="ext-multi-dl-name" data-flip-id="${this.getDownloadNameFlipKey(dl.id)}" title="${displayName}">${displayName}</span>
                    <span class="ext-multi-dl-pct" data-flip-id="${this.getDownloadFlipKey(dl.id)}-pct">${pctText}</span>
                  </div>
                  <div class="ext-multi-dl-bar" data-flip-id="${this.getDownloadProgressFlipKey(dl.id)}">
                    <div class="ext-multi-dl-fill" style="width: ${progress}%"></div>
                  </div>
                </div>`;
            }).join('');

            this.renderDownloadCardWithFlip(content as HTMLElement, () => {
            content.innerHTML = `
            <div class="ext-multi-download-card ext-download-card" data-flip-id="download-shell">
                <button class="ext-close-btn" data-flip-id="download-close" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                    <i class="bi bi-chevron-down"></i>
                </button>
                <div class="ext-card-icon-container" data-flip-id="download-icon">
                    <div class="ext-card-icon">
                        <i class="bi bi-cloud-arrow-down-fill"></i>
                    </div>
                </div>
                <div class="ext-card-details" data-flip-id="download-details">
                    <div class="ext-download-topline" data-flip-id="download-topline">
                        <span class="ext-status-badge" data-flip-id="download-badge">${downloads.length} Downloads</span>
                    </div>
                    <div class="ext-card-header ext-download-header" data-flip-id="download-header">
                        <span class="ext-download-title" data-flip-id="download-title">Multiple active downloads</span>
                    </div>
                    <div class="ext-multi-dl-list" data-flip-id="download-body">
                      ${itemsHtml}
                    </div>
                </div>
            </div>
          `;
            });
          }
        } else {
          downloads.forEach((dl) => {
            const itemEl = content.querySelector(`.ext-multi-dl-item[data-dl-id="${dl.id}"]`);
            if (!itemEl) return;
            const progress = Math.round(dl.progress || 0);
            const displayName = this._getDownloadDisplayName(dl);
            let pctText = `${progress}%`;
            
            if (dl.statusText) {
              const lowerStatus = dl.statusText.toLowerCase();
              if (lowerStatus.includes('extract')) pctText = 'Extracting...';
              else if (lowerStatus.includes('verif')) pctText = 'Verifying...';
            }

            const nameEl = itemEl.querySelector('.ext-multi-dl-name');
            const pctEl = itemEl.querySelector('.ext-multi-dl-pct');
            const fillEl = itemEl.querySelector('.ext-multi-dl-fill') as HTMLElement;
            if (nameEl) {
              (nameEl as HTMLElement).title = displayName;
              this.animateElementTextChange(
                nameEl as HTMLElement,
                displayName,
                'ext-text-swap',
                280,
              );
            }
            if (pctEl) {
              this.animateElementTextChange(
                pctEl as HTMLElement,
                pctText,
                'ext-text-swap',
                280,
              );
            }
            this.animateProgressFill(fillEl, progress);
          });

          const badgeEl = content.querySelector('.ext-status-badge');
          if (badgeEl) {
            this.animateElementTextChange(
              badgeEl as HTMLElement,
              `${downloads.length} Downloads`,
            );
          }
        }
      }

      if (shouldAnimateEntrance) {
        this.animateExtendedBarEntrance(bottomBar, content as HTMLElement);
      }
    } else if (update.type === 'success') {
      delete (content as HTMLElement).dataset.extendedSignature;

      if (!bottomBar.classList.contains('success-mode')) {
        bottomBar.classList.remove('download-mode', 'conflict-mode');
        bottomBar.classList.add('success-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      const shouldAnimateEntrance = !wasExpanded || previousMode !== 'success';

      if (shouldAnimateEntrance) {
        this.triggerIslandPulse(bottomBar, 'success');
      }

      // Ensure content is visible
      (content as HTMLElement).style.display = 'flex';

      content.innerHTML = `
            <div class="ext-download-card">
                <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                    <i class="bi bi-chevron-down"></i>
                </button>
                <div class="ext-card-icon-container" style="background: rgba(40, 167, 69, 0.1); border-color: #28a745;">
                    <div class="ext-card-icon">
                        <i class="bi bi-check-circle-fill" style="color: #28a745;"></i>
                    </div>
                </div>
                <div class="ext-card-details">
                    <div class="ext-card-header">
                        <span class="ext-status-badge" style="background: #28a745; border-color: #28a745; color: #fff;">Completed</span>
                        <span class="ext-filename" title="${update.fileName}">${update.fileName || 'Unknown file'}</span>
                    </div>
                    
                    <div class="ext-card-meta">
                        <span style="color: #28a745;">Download finished successfully</span>
                    </div>
                </div>
            </div>
        `;

      if (shouldAnimateEntrance) {
        this.animateExtendedBarEntrance(bottomBar, content as HTMLElement);
      }
    } else if (update.type === 'conflict') {
      const contentEl = content as HTMLElement;
      const conflictSignature = `conflict:${update.conflictCount}:${update.modsWithConflictsCount}`;

      if (!bottomBar.classList.contains('conflict-mode')) {
        bottomBar.classList.remove('download-mode', 'success-mode');
        bottomBar.classList.add('conflict-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      const shouldAnimateEntrance = !wasExpanded || previousMode !== 'conflict';

      if (shouldAnimateEntrance) {
        this.triggerIslandPulse(bottomBar, 'conflict');
      }

      // Ensure content is visible
      contentEl.style.display = 'flex';

      if (contentEl.dataset.extendedSignature !== conflictSignature) {
        content.innerHTML = `  
          <div class="ext-conflict-card">
              <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                  <i class="bi bi-chevron-down"></i>
              </button>
              <div class="ext-card-icon-container icon-warning">
                  <div class="ext-card-icon">
                      <i class="bi bi-exclamation-triangle-fill"></i>
                  </div>
              </div>
              <div class="ext-card-details">
                  <div class="ext-card-header">
                       <span class="ext-status-badge badge-warning">Conflicts Detected</span>
                  </div>
                  <div class="ext-conflict-message">
                      ${update.modsWithConflictsCount} mod${update.modsWithConflictsCount !== 1 ? 's' : ''} have ${update.conflictCount} conflicting files.
                  </div>
                  <button class="ext-action-btn" onclick="window.conflictModalManager.showConflictModal()">
                      Resolve Now
                  </button>
              </div>
          </div>
        `;
        contentEl.dataset.extendedSignature = conflictSignature;
      }

      if (shouldAnimateEntrance) {
        this.animateExtendedBarEntrance(bottomBar, contentEl);
      }
    }
  }

  checkActiveDownloads() {
    try {
      if (!window.downloadManager) return false;

      // Check for FTP transfer first
      if (window.downloadManager.ftpTransfer) {
        const ftp = window.downloadManager.ftpTransfer;
        const progress = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ftp.progress ||
                (ftp.totalFiles > 0
                  ? (ftp.transferredCount / ftp.totalFiles) * 100
                  : 0),
            ),
          ),
        );
        const currentMod = ftp.currentMod || 0;
        const totalMods = ftp.totalMods || 0;
        const transferKey = `ftp:${ftp.id}`;

        this.hasActiveDownloads = true;

        if (this.lastExtendedBarData !== transferKey) {
          this.userDismissedExtendedBar = false;
          this.lastExtendedBarData = transferKey;
        }

        if (!this.userDismissedExtendedBar) {
          const metaParts: string[] = [];
          if (totalMods > 0) {
            metaParts.push(`Mod ${currentMod}/${totalMods}`);
          }
          if (ftp.totalFiles > 0) {
            metaParts.push(`${ftp.transferredCount}/${ftp.totalFiles} files`);
          }

          this.updateExtendedBar({
            type: 'download',
            downloads: [
              {
                id: ftp.id,
                fileName:
                  ftp.currentFileName ||
                  ftp.currentModName ||
                  'Sending to Switch...',
                progress,
                speedText: metaParts.join(' • '),
                phaseLabel: 'Sending to Switch',
                iconClass: 'bi-cloud-arrow-up-fill',
              },
            ],
          });
        }

        return true;
      }

      const activeDownloadsMap = (window.downloadManager as any)
        .activeDownloads;

      if (!activeDownloadsMap) {
        // If activeDownloads is missing, assume no downloads
        return false;
      }

      const downloads = Array.from(activeDownloadsMap.values());
      const activeDownloads = downloads.filter(
        (d: any) => d.status === 'downloading' || d.status === 'extracting',
      );

      if (activeDownloads.length > 0) {
        const active: any = activeDownloads[0];
        this.hasActiveDownloads = true;

        // Detection of data change for downloads
        const downloadIds = activeDownloads
          .map((d: any) => d.id || d.fileName)
          .sort()
          .join(',');
        const dataKey = `download:${downloadIds}`;

        if (this.lastExtendedBarData !== dataKey) {
          this.userDismissedExtendedBar = false;
          this.lastExtendedBarData = dataKey;
        }

        if (!this.userDismissedExtendedBar) {
          // Update extended bar
          const dlItems: DownloadItem[] = activeDownloads.map((d: any) => ({
            id: d.id,
            fileName: d.fileName,
            modName: d.modName,
            statusText: d.statusText,
            progress: d.progress || 0,
            speedText: d.speedText || '',
          }));
          this.updateExtendedBar({ type: 'download', downloads: dlItems });
        }

        // Also update standard status bar as fallback or complement
        const statusRight =
          document.querySelector<HTMLElement>('.bottom-text-right');
        if (statusRight) {
          statusRight.textContent = '';
        }

        if (this.currentTab !== 'downloads') {
          const dlName =
            active.modName ||
            active.fileName ||
            active.url?.split('/').pop() ||
            'Downloading...';
          const shortName =
            dlName.length > 30 ? `${dlName.substring(0, 27)}...` : dlName;

          let prog = '';
          if (active.statusText) {
            const lowerStatus = active.statusText.toLowerCase();
            if (lowerStatus.includes('extract')) prog = ' • Extracting...';
            else if (lowerStatus.includes('verif')) prog = ' • Verifying...';
          }
          if (!prog && active.progress !== undefined) {
            prog = ` • ${Math.round(active.progress)}%`;
          }

          this.renderStatus(
            {
              content: this.t('statusBar.downloadsDownloading', {
                fileName: shortName,
                progress: prog,
                size: '',
                speed: '',
              }),
              downloading: true,
            },
            { force: !this.hasTemporaryStatus() },
          );
        }
        return true;
      } else {
        const wasActive = this.hasActiveDownloads;
        this.hasActiveDownloads = false;

        const statusText = this.getStatusTextElement();
        if (statusText) {
          statusText.classList.remove('status-downloading');
        }

        // Check if a download JUST finished to show success state
        if (wasActive) {
          const completed =
            (window.downloadManager as any).completedDownloads || [];
          if (completed.length > 0) {
            const last = completed[0];
            // If finished within last 5 seconds AND it's a new completion
            if (Date.now() - (last.endTime || 0) < 5000 && this.lastHandledSuccessId !== last.id) {
              this.lastHandledSuccessId = last.id; // Mark this download as handled for success UI
              this.userDismissedExtendedBar = false; // Always show success
              this.updateExtendedBar({
                type: 'success',
                fileName: last.modName || last.fileName,
              });

              this.refreshStandardStatus(); // Update the background text instantly

              // Wait 2 seconds then retract
              setTimeout(() => {
                const bottomBar = document.getElementById('main-status-bar');
                if (bottomBar && bottomBar.classList.contains('success-mode')) {
                  this.updateExtendedBar({ type: 'none' });
                }
              }, 2000);

              return false;
            }
          }
        }

        if (!wasActive) {
          // Only verify conflicts if we weren't just downloading (avoid flashing)
          if (window.modManager && window.modManager.conflictGroups) {
            const conflicts = window.modManager.conflictGroups;

            const modsWithConflicts = conflicts.reduce<Set<string>>(
              (mods, nextConflict) => {
                return new Set([
                  ...Array.from(mods),
                  ...nextConflict.conflicts.flatMap((conflict) =>
                    conflict.mods.map((mod) => mod.name),
                  ),
                ]);
              },
              new Set(),
            );

            const conflictCount = conflicts.length;

            if (conflictCount > 0) {
              const dataKey = `conflict:${conflictCount}`;
              if (this.lastExtendedBarData !== dataKey) {
                this.userDismissedExtendedBar = false;
                this.lastExtendedBarData = dataKey;
              }

              if (!this.userDismissedExtendedBar) {
                this.updateExtendedBar({
                  type: 'conflict',
                  conflictCount,
                  modsWithConflictsCount: modsWithConflicts.size,
                });
              }
              return false;
            } else {
              // No conflicts, reset dismissal for next time
              if (this.lastExtendedBarData?.startsWith('conflict:')) {
                this.lastExtendedBarData = null;
                this.userDismissedExtendedBar = false;
              }
            }
          }
        }

        if (wasActive) {
          // Immediate cleanup if no success state needed
          this.updateExtendedBar({ type: 'none' });
          this.refreshStandardStatus();
        } else {
          // Routine cleanup
          const bottomBar = document.getElementById('main-status-bar');
          if (
            bottomBar &&
            bottomBar.classList.contains('expanded') &&
            !bottomBar.classList.contains('conflict-mode') &&
            !bottomBar.classList.contains('success-mode')
          ) {
            this.updateExtendedBar({ type: 'none' });
          }
        }

        return false;
      }
    } catch (e) {
      return false;
    }
  }

  refreshStandardStatus() {
    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    if (!this.currentTab) {
      this.syncCurrentTabFromSidebar();
    }

    if (this.currentTab) {
      this.updateStatus(this.currentTab);
    } else {
      const statusLeft = this.getStatusTextElement();
      if (statusLeft) {
        statusLeft.classList.remove('status-downloading');
        this.updateStatus('tools');
      }
    }
  }

  checkAndUpdateForDownloads() {
    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      const cycleId = this.beginStatusCycle();
      this.startDownloadsStatusLoop(cycleId);
    } else if (this.currentTab && !modalOpen) {
      if (statusText.classList.contains('status-downloading')) {
        statusText.classList.remove('status-downloading');
        statusText.offsetHeight;
      }
      this.updateStatus(this.currentTab);
    } else if (!modalOpen && this.preservedStatus) {
      this.restorePreservedStatus();
    }
  }

  updateDownloadsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.startDownloadsStatusLoop(cycleId);
    return;

    let animationFrame = 0;
    let lastUpdateTime = Date.now();
    let lastReceivedBytes = new Map();

    const updateStatus = () => {
      if (this.preservedStatus && !this.checkActiveDownloads()) {
        return;
      }

      if (this.hasModalOpen() && !this.checkActiveDownloads()) {
        return;
      }

      try {
        // Check for FTP transfer first
        if (window.downloadManager && window.downloadManager.ftpTransfer) {
          const ftp = window.downloadManager.ftpTransfer;
          const dots = '.'.repeat(animationFrame % 4);
          animationFrame++;

          let statusContent;
          if (ftp.totalMods > 0) {
            statusContent = this.t('statusBar.ftpSending', {
              current: ftp.currentMod || 0,
              total: ftp.totalMods || 0,
            });
          } else {
            statusContent = this.t('statusBar.ftpSending', {
              current: '',
              total: '',
            }).replace(' • / mods', '');
          }
          statusContent += dots;

          if (this.setStatusText(statusContent, true)) {
            const statusText =
              document.querySelector<HTMLElement>('.bottom-text-left') ||
              document.querySelector<HTMLElement>('.bottom-text');
            if (
              statusText &&
              !statusText.classList.contains('status-downloading')
            ) {
              statusText.classList.add('status-downloading');
            }
          }

          setTimeout(() => updateStatus(), 200);
          return;
        }

        if (window.downloadManager && window.downloadManager.activeDownloads) {
          const activeDownloads = Array.from(
            window.downloadManager.activeDownloads.values(),
          );
          const activeCount = activeDownloads.length;
          const completedCount = window.downloadManager.completedDownloads
            ? window.downloadManager.completedDownloads.length
            : 0;

          if (activeCount > 0) {
            const firstDownload = activeDownloads[0];
            const currentTime = Date.now();
            const timeDelta = (currentTime - lastUpdateTime) / 1000;

            let speedText = '';
            let progressText = '';

            if (
              firstDownload.receivedBytes !== undefined &&
              firstDownload.totalBytes !== undefined &&
              firstDownload.totalBytes > 0
            ) {
              const progress = Math.round(
                (firstDownload.receivedBytes / firstDownload.totalBytes) * 100,
              );
              progressText = `${progress}%`;

              const downloadId = firstDownload.id;
              const lastBytes = lastReceivedBytes.get(downloadId) || 0;
              const bytesDelta = firstDownload.receivedBytes - lastBytes;

              if (timeDelta > 0 && bytesDelta > 0) {
                const speedBytes = bytesDelta / timeDelta;
                speedText = this.formatSpeed(speedBytes);
              }

              lastReceivedBytes.set(downloadId, firstDownload.receivedBytes);
            } else if (firstDownload.progress !== undefined) {
              progressText = `${Math.round(firstDownload.progress)}%`;
            }

            let sizeInfo = '';
            if (
              firstDownload.totalBytes !== undefined &&
              firstDownload.totalBytes > 0
            ) {
              const received = firstDownload.receivedBytes || 0;
              sizeInfo = `${this.formatBytes(received)} / ${this.formatBytes(
                firstDownload.totalBytes,
              )}`;
            }

            const fileName =
              firstDownload.modName ||
              firstDownload.fileName ||
              firstDownload.url?.split('/').pop() ||
              'Downloading...';
            const shortFileName =
              fileName.length > 30
                ? fileName.substring(0, 27) + '...'
                : fileName;

            const dots = '.'.repeat(animationFrame % 4);
            const animIndicator =
              activeCount > 1 ? ` [${activeCount} active]` : '';

            let progressPart = progressText ? ` • ${progressText}` : '';
            let sizePart = sizeInfo ? ` • ${sizeInfo}` : '';
            let speedPart = speedText ? ` • ${speedText}` : '';

            let statusContent = this.t('statusBar.downloadsDownloading', {
              fileName: shortFileName,
              progress: progressPart,
              size: sizePart,
              speed: speedPart,
            });
            statusContent += dots;
            if (animIndicator) statusContent += animIndicator;

            if (this.setStatusText(statusContent, true)) {
              const statusText =
                document.querySelector<HTMLElement>('.bottom-text-left') ||
                document.querySelector<HTMLElement>('.bottom-text');
              if (
                statusText &&
                !statusText.classList.contains('status-downloading')
              ) {
                statusText.classList.add('status-downloading');
              }
            }

            lastUpdateTime = currentTime;
            animationFrame++;
          } else {
            if (statusText.classList.contains('status-downloading')) {
              statusText.classList.remove('status-downloading');

              statusText.offsetHeight;
            }

            if (this.updateInterval) {
              clearInterval(this.updateInterval);
              this.updateInterval = null;
            }

            if (this.currentTab !== 'downloads') {
              if (!this.hasModalOpen() && !this.preservedStatus) {
                this.updateStatus(this.currentTab);
              }
              return;
            }

            if (!this.hasModalOpen() && !this.preservedStatus) {
              if (completedCount > 0) {
                this.setStatusText(
                  this.t('statusBar.downloadsCompleted', {
                    count: completedCount,
                    plural: completedCount !== 1 ? 's' : '',
                  }),
                );
              } else {
                this.setStatusText(this.t('statusBar.downloadsNoActive'));
              }
            }
          }
        } else {
          if (statusText.classList.contains('status-downloading')) {
            statusText.classList.remove('status-downloading');

            statusText.offsetHeight;
          }

          if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
          }

          if (this.currentTab !== 'downloads') {
            if (!this.hasModalOpen() && !this.preservedStatus) {
              this.updateStatus(this.currentTab);
            }
            return;
          }

          if (!this.hasModalOpen() && !this.preservedStatus) {
            this.setStatusText(this.t('statusBar.downloadsReady'));
          }
        }
      } catch (error) {
        console.error('Status bar error:', error);
        statusText.classList.remove('status-downloading');

        if (this.currentTab !== 'downloads') {
          if (!this.hasModalOpen() && !this.preservedStatus) {
            this.updateStatus(this.currentTab);
          }
          return;
        }

        if (!this.hasModalOpen() && !this.preservedStatus) {
          this.setStatusText('Downloads • Ready');
        }
      }
    };

    updateStatus();

    this.updateInterval = setInterval(() => {
      const hasActiveDownloads = this.checkActiveDownloads();
      if (hasActiveDownloads) {
        // Only update status if there's no ongoing FTP with its own loop
        if (!window.downloadManager || !window.downloadManager.ftpTransfer) {
          updateStatus();
        }
      } else {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }

        if (statusText.classList.contains('status-downloading')) {
          statusText.classList.remove('status-downloading');
          statusText.offsetHeight;
        }

        if (this.currentTab && this.currentTab !== 'downloads') {
          this.updateStatus(this.currentTab);
        } else if (this.currentTab === 'downloads') {
          const completedCount =
            window.downloadManager?.completedDownloads?.length || 0;
          if (completedCount > 0) {
            this.setStatusText(
              this.t('statusBar.downloadsCompleted', {
                count: completedCount,
                plural: completedCount !== 1 ? 's' : '',
              }),
            );
          } else {
            this.setStatusText(this.t('statusBar.downloadsNoActive'));
          }
        }
      }
    }, 500);
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format download speed
   */
  formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond === 0) return '';
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  updateToolsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getToolsSnapshot(), { cycleId });
    this.startStaticTabPolling('tools', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'tools' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.modManager && window.modManager.mods) {
          const mods = window.modManager.mods;

          const enabledMods = mods.filter(
            (mod) => mod.status === 'active',
          ).length;
          const totalMods = mods.length;

          this.setStatusText(
            this.t('statusBar.modsEnabled', {
              enabled: enabledMods,
              total: totalMods,
              plural: totalMods !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.modsReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.modsReady'));
      }
    };

    updateStatus();

    this.updateInterval = setInterval(updateStatus, 10000);
  }

  /**
   * Update status for Plugins tab
   */
  updatePluginsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getPluginsSnapshot(), { cycleId });
    this.startStaticTabPolling('plugins', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'plugins' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.pluginManager) {
          const plugins = window.pluginManager.plugins || [];
          const enabledPlugins = plugins.filter(
            (p) => p.enabled !== false,
          ).length;

          this.setStatusText(
            this.t('statusBar.pluginsEnabled', {
              enabled: enabledPlugins,
              total: plugins.length,
              plural: plugins.length !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.pluginsReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.pluginsReady'));
      }
    };

    updateStatus();
    this.updateInterval = setInterval(updateStatus, 10000);
  }

  updateSettingsStatus(statusText) {
    this.applySnapshot(this.getSettingsSnapshot());
    return;

    this.setStatusText(this.t('statusBar.settings'));
  }

  /**
   * Update status for Characters tab
   */
  updateCharactersStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getCharactersSnapshot(), { cycleId });
    this.startStaticTabPolling('characters', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'characters' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.charactersManager && window.charactersManager.characters) {
          const characters = window.charactersManager.characters;
          const count = characters.size;

          this.setStatusText(
            this.t('statusBar.charactersAvailable', {
              count: count,
              plural: count !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.charactersReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.charactersReady'));
      }
    };

    updateStatus();
    this.updateInterval = setInterval(updateStatus, 10000);
  }
  updateStagesStatus(statusText) {
    this.applySnapshot(this.getStagesSnapshot());
    return;

    this.setStatusText(this.t('statusBar.stages'));
  }

  updateCheckingConflictsStatus() {
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';
    const checkingText = document.createElement('span');
    checkingText.textContent = this.t('statusBar.checkingConflicts');
    checkingText.style.display = 'flex';
    checkingText.style.alignItems = 'center';
    checkingText.style.gap = '6px';

    // Spinner
    const spinner = document.createElement('i');
    spinner.className = 'fas fa-circle-notch fa-spin';
    spinner.style.fontSize = '12px';
    checkingText.appendChild(spinner);

    statusRight.appendChild(checkingText);

    // Small delay to allow check to perform
    setTimeout(() => {
      if (window.modManager && window.modManager.conflictGroups) {
        const conflicts = window.modManager.conflictGroups;
        const conflictCount = conflicts.length;

        const modsWithConflicts = conflicts.reduce<Set<string>>(
          (mods, nextConflict) => {
            return new Set([
              ...Array.from(mods),
              ...nextConflict.conflicts.flatMap((conflict) =>
                conflict.mods.map((mod) => mod.name),
              ),
            ]);
          },
          new Set(),
        );

        if (conflictCount > 0) {
          // Update extended bar
          this.updateExtendedBar({
            type: 'conflict',
            conflictCount,
            modsWithConflictsCount: modsWithConflicts.size,
          });

          statusRight.innerHTML = '';
          const warning = document.createElement('span');
          warning.style.color = 'var(--warning-color)';
          warning.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> ${conflictCount} conflicts`;
          warning.style.cursor = 'pointer';
          warning.onclick = () => {
            if (window.conflictModalManager) {
              window.conflictModalManager.showConflictModal();
            }
          };
          statusRight.appendChild(warning);
        } else {
          // Clear extended bar if no downloads
          if (!this.hasActiveDownloads) {
            this.updateExtendedBar({ type: 'none' });
          }
          statusRight.textContent = '';
        }
      }
    }, 500);
  }

  updateConflictStatus(conflictCount: number, modsWithConflictsCount: number) {
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';

    if (conflictCount > 0) {
      this.updateExtendedBar({
        type: 'conflict',
        conflictCount,
        modsWithConflictsCount,
      }); // Update extended bar

      const conflictText = document.createElement('span');

      conflictText.className = 'conflict-link';
      conflictText.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (window.statusBarManager) {
          window.statusBarManager.preserveCurrentStatus();
        }

        if (window.conflictModalManager) {
          window.conflictModalManager.showConflictModal();
        }
      });

      conflictText.textContent = this.t('statusBar.conflictsDetected', {
        count: conflictCount,
        plural: conflictCount !== 1 ? 's' : '',
      });

      statusRight.appendChild(conflictText);
    }
  }

  clear() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (statusRight) {
      statusRight.innerHTML = '';
    }
    if (this.currentTab && !this.preservedStatus) {
      this.updateStatus(this.currentTab);
    }
  }
}

if (typeof window !== 'undefined') {
  window.statusBarManager = new StatusBarManager();

  // Écouter les changements de langue pour mettre à jour la status bar
  window.addEventListener('localeChanged', () => {
    if (window.statusBarManager && window.statusBarManager.currentTab) {
      // Mettre à jour le statut avec l'onglet actuel pour appliquer les nouvelles traductions
      setTimeout(() => {
        window.statusBarManager.updateStatus(
          window.statusBarManager.currentTab,
        );
      }, 100);
    }
  });
}
