import type { ModListRenderer } from './mod-list-renderer';
import type { ModContextMenuHandler } from './mod-context-menu';
import type { ModOperations } from './mod-operations';
import type { ModKeybindsHandler } from './mod-keybinds';

export interface Mod {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  size: string;
  category?: string | null;
  path: string;
  status: 'active' | 'disabled' | 'conflict';
  hash?: string;
  addedAt?: number;
  modifiedAt?: number;
}

export interface SimpleMod {
  name: Mod['name'];
  category?: Mod['category'];
  path: Mod['path'];
}

interface SelectModOptions {
  forceUpdate?: boolean;
  multi?: boolean;
  range?: boolean;
}

interface FolderModState {
  activeMods: Array<{
    name: string;
    path: string;
    hash?: string;
    addedAt?: number;
    modifiedAt?: number;
  }>;
  disabledMods: Array<{
    name: string;
    path: string;
    hash?: string;
    addedAt?: number;
    modifiedAt?: number;
  }>;
}

type ModSortOrder = 'name-asc' | 'added-desc' | 'modified-desc';

class ModManager {
  mods: Mod[];
  selectedMod: Mod | null;
  selectedMods: Mod[];
  modListContainer: HTMLElement | null;
  modsPath: string | null;
  searchQuery: string;
  categoryFilter: string;
  sortOrder: ModSortOrder;
  renderedModIds: Set<string>;
  selectionAnchorId: string | null;
  selectionUpdateToken: number;
  previewTimeline: any | null;
  conflictGroups: {
    fighter: string;
    slot: string;
    conflicts: {
      filePath: string;
      mods: {
        name: string;
        path: string;
      }[];
    }[];
  }[];
  isCheckingConflicts: boolean;
  listRenderer: ModListRenderer | null;
  contextMenuHandler: ModContextMenuHandler | null;
  operations: ModOperations | null;
  keybindsHandler: ModKeybindsHandler | null;
  batchTestingOverrideActive: boolean;

  constructor() {
    this.mods = [];
    this.selectedMod = null;
    this.selectedMods = [];
    this.modListContainer = null;
    this.modsPath = null;
    this.searchQuery = '';
    this.categoryFilter = '';
    this.sortOrder = 'name-asc';
    this.renderedModIds = new Set();
    this.selectionAnchorId = null;
    this.selectionUpdateToken = 0;
    this.previewTimeline = null;
    this.conflictGroups = [];
    this.isCheckingConflicts = false;

    this.listRenderer = null;
    this.contextMenuHandler = null;
    this.operations = null;
    this.batchTestingOverrideActive = false;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initContainer());
    } else {
      this.initContainer();
    }
  }

  initContainer() {
    this.modListContainer = document.querySelector<HTMLElement>('#mod-list');
    if (!this.modListContainer) {
      console.warn('Mod list container not found - will be initialized later');
      return;
    }

    if (!this.listRenderer) {
      this.listRenderer = new window.ModListRenderer(this);
    }

    if (!this.contextMenuHandler) {
      this.contextMenuHandler = new window.ModContextMenuHandler(this);
    }

    if (!this.operations) {
      this.operations = new window.ModOperations(this);
    }

    if (!this.keybindsHandler) {
      this.keybindsHandler = new window.ModKeybindsHandler(this);
    }

    console.log('Mod Manager components initialized');
  }

  reinitialize() {
    this.initContainer();

    if (this.mods.length > 0) {
      this.renderModList(true);
    } else {
      this.restoreSelectedMod();
    }
  }

  filterMods(query) {
    this.searchQuery = query.toLowerCase();
    this.updateVisibility();
  }

  filterByCategory(category) {
    this.categoryFilter = category;
    this.updateVisibility();
  }

  sortModsBy(order: string) {
    const allowedOrders: ModSortOrder[] = [
      'name-asc',
      'added-desc',
      'modified-desc',
    ];
    this.sortOrder = allowedOrders.includes(order as ModSortOrder)
      ? (order as ModSortOrder)
      : 'name-asc';
    this.renderModList(true);
  }

  getSortedMods(mods: Mod[] = this.mods) {
    const statusRank = { active: 0, conflict: 1, disabled: 2 };
    const getTime = (mod: Mod, field: 'addedAt' | 'modifiedAt') => {
      const value = Number(mod[field] || 0);
      return Number.isFinite(value) ? value : 0;
    };

    return [...mods].sort((a, b) => {
      if (this.sortOrder === 'added-desc') {
        const delta = getTime(b, 'addedAt') - getTime(a, 'addedAt');
        if (delta !== 0) return delta;
      } else if (this.sortOrder === 'modified-desc') {
        const delta = getTime(b, 'modifiedAt') - getTime(a, 'modifiedAt');
        if (delta !== 0) return delta;
      } else {
        const statusDelta = statusRank[a.status] - statusRank[b.status];
        if (statusDelta !== 0) return statusDelta;
      }

      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  updateVisibility() {
    if (!this.modListContainer) {
      this.modListContainer = document.querySelector<HTMLElement>('#mod-list');
    }

    if (!this.modListContainer) {
      console.warn('Cannot update visibility: container not found');
      return;
    }

    if (!this.listRenderer) {
      console.warn('List renderer not initialized, doing full render instead');
      this.renderModList(true);
      return;
    }

    const success = this.listRenderer.updateVisibility(
      this.mods,
      this.modListContainer,
      this.searchQuery,
      this.categoryFilter,
    );

    if (!success) {
      this.renderModList(true);
    }
  }

  async loadMods(modsData: Mod[]) {
    this.mods = modsData;
    this.renderModList(true);

    if (window.discordRPCClient) {
      window.discordRPCClient.updateModCount(modsData.length);
    }
  }

  mapFolderStateToMods(result: FolderModState) {
    const allMods: Mod[] = [];
    let idCounter = 1;

    for (const mod of result.activeMods) {
      allMods.push({
        id: String(idCounter++),
        name: mod.name,
        version: 'Unknown',
        author: 'Unknown',
        description: 'Active mod',
        size: 'Unknown',
        status: 'active',
        path: mod.path,
        category: null,
        hash: mod.hash,
        addedAt: mod.addedAt,
        modifiedAt: mod.modifiedAt,
      });
    }

    for (const mod of result.disabledMods) {
      allMods.push({
        id: String(idCounter++),
        name: mod.name,
        version: 'Unknown',
        author: 'Unknown',
        description: 'Disabled mod',
        size: 'Unknown',
        status: 'disabled',
        path: mod.path,
        category: null,
        hash: mod.hash,
        addedAt: mod.addedAt,
        modifiedAt: mod.modifiedAt,
      });
    }

    return allMods;
  }

  async refreshModsFromState(result: FolderModState) {
    const allMods = this.mapFolderStateToMods(result);

    await this.loadMods(allMods);
    this.clearBatchTestingOverride();
    this.loadCategoriesInBackground(allMods);

    if (
      window.settingsManager &&
      window.settingsManager.settings.conflictDetectionEnabled
    ) {
      const whitelistPatterns =
        window.settingsManager.settings.conflictWhitelistPatterns || [];
      setTimeout(() => {
        this.checkConflicts(whitelistPatterns);
      }, 1000);
    }

    this.scheduleNroLimitCheck();
  }

  scheduleNroLimitCheck() {
    if (window.settingsManager?.settings.nroLimitCheckEnabled === false) {
      return;
    }

    // This check is global: emulator and real hardware both can hit the .nro loader limit.
    setTimeout(() => {
      this.checkNroLimit();
    }, 1200);
  }

  isBatchTestingLocked() {
    const batchManager = (window as any).batchTestingManager;
    const isModalOpen = !!(
      batchManager?.modal && document.body.contains(batchManager.modal)
    );

    return !!(isModalOpen || batchManager?.isRestoring);
  }

  applyBatchTestingState(modsData: Mod[], modsPath: string | null) {
    this.batchTestingOverrideActive = true;
    this.modsPath = modsPath;
    return this.loadMods(modsData);
  }

  clearBatchTestingOverride() {
    this.batchTestingOverrideActive = false;
  }

  private t(key: string, fallback: string, params: Record<string, string> = {}) {
    const translated = window.i18n?.t?.(key, params);
    return translated && translated !== key ? translated : fallback;
  }

  private isDirectHardwareLibraryMode() {
    return (
      window.settingsManager?.getAppRunMode?.() === 'hardware' &&
      window.settingsManager?.getHardwareLibraryMode?.() === 'direct'
    );
  }

  private getHardwareLibraryCacheKey(modsPath: string | null) {
    return `fightplanner.hardwareModsCache:${modsPath || 'unknown'}`;
  }

  private saveHardwareLibraryCache(
    modsPath: string,
    result: FolderModState,
  ) {
    if (!this.isDirectHardwareLibraryMode()) {
      return;
    }

    try {
      localStorage.setItem(
        this.getHardwareLibraryCacheKey(modsPath),
        JSON.stringify({
          savedAt: Date.now(),
          result,
        }),
      );
    } catch (error) {
      console.warn('[ModManager] Failed to cache hardware mods:', error);
    }
  }

  private readHardwareLibraryCache(modsPath: string | null) {
    try {
      const raw = localStorage.getItem(this.getHardwareLibraryCacheKey(modsPath));
      if (!raw) {
        return null;
      }

      const cache = JSON.parse(raw);
      if (!cache?.result?.activeMods || !cache?.result?.disabledMods) {
        return null;
      }

      return cache as {
        savedAt: number;
        result: FolderModState;
      };
    } catch (error) {
      console.warn('[ModManager] Failed to read hardware mods cache:', error);
      return null;
    }
  }

  private async isDirectHardwareLibraryUnavailable(modsPath: string | null) {
    if (!this.isDirectHardwareLibraryMode()) {
      this.setHardwareLibraryBlockedState(false);
      return false;
    }

    if (!modsPath || !window.electronAPI?.checkPathAccessible) {
      return true;
    }

    const result = await window.electronAPI.checkPathAccessible(modsPath);
    return !(result?.success && result.accessible === true);
  }

  private setHardwareLibraryBlockedState(blocked: boolean, cached = false) {
    document
      .querySelector<HTMLElement>('.content-box')
      ?.classList.toggle('hardware-library-blocked', blocked);
    document
      .querySelector<HTMLElement>('.content-box')
      ?.classList.toggle('hardware-library-cached', cached);
    document
      .querySelector<HTMLElement>('#right-panel')
      ?.classList.toggle('hardware-library-blocked', blocked);
  }

  private createHardwareLibraryMessage(
    targetPath: string | null,
    cached: boolean,
  ) {
    const blocker = document.createElement('div');
    blocker.className = cached
      ? 'hardware-library-message hardware-library-cache-message'
      : 'hardware-library-message';

    const icon = document.createElement('i');
    icon.className = cached ? 'bi bi-database' : 'bi bi-usb-drive';

    const text = document.createElement('div');
    text.className = 'hardware-library-message-text';

    const title = document.createElement('strong');
    title.textContent = cached
      ? this.t('tools.hardwareLibraryCacheTitle', 'Showing cached mods')
      : this.t('tools.hardwareLibraryDisconnectedTitle', 'Switch disconnected');

    const message = document.createElement('p');
    message.textContent = cached
      ? this.t(
          'tools.hardwareLibraryCacheMessage',
          'Reconnect your Switch or remount the SD card to refresh names, statuses, and details.',
        )
      : this.t(
          'tools.hardwareLibraryDisconnectedMessage',
          'Reconnect your Switch or remount the SD card to view and manage mods.',
        );

    const path = document.createElement('code');
    path.textContent = targetPath || this.t('common.error', 'Error');

    text.append(title, message, path);

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'input-btn short';
    refreshButton.innerHTML = `<i class="bi bi-arrow-clockwise"></i><span>${this.t(
      'tools.refreshMods',
      'Refresh Mods',
    )}</span>`;
    refreshButton.addEventListener('click', () => {
      this.fetchMods();
    });

    blocker.append(icon, text, refreshButton);
    return blocker;
  }

  private async renderHardwareCache(targetPath: string | null) {
    const cache = this.readHardwareLibraryCache(targetPath);
    if (!cache) {
      return false;
    }

    this.modsPath = targetPath;
    this.selectedMod = null;
    this.selectedMods = [];
    this.setHardwareLibraryBlockedState(true, true);

    const cachedMods = this.mapFolderStateToMods(cache.result);
    await this.loadMods(cachedMods);

    if (!this.modListContainer) {
      this.modListContainer = document.querySelector<HTMLElement>('#mod-list');
    }

    this.modListContainer?.prepend(
      this.createHardwareLibraryMessage(targetPath, true),
    );
    window.modInfoManager?.clearModInfo?.();
    return true;
  }

  private renderHardwareReconnectBlocker(targetPath: string | null) {
    if (!this.modListContainer) {
      this.modListContainer = document.querySelector<HTMLElement>('#mod-list');
    }

    if (!this.modListContainer) {
      return;
    }

    this.mods = [];
    this.selectedMod = null;
    this.selectedMods = [];
    this.modsPath = targetPath;
    this.renderedModIds.clear();
    this.setHardwareLibraryBlockedState(true);
    this.modListContainer.innerHTML = '';
    this.modListContainer.appendChild(
      this.createHardwareLibraryMessage(targetPath, false),
    );

    window.modInfoManager?.clearModInfo?.();
  }

  renderModList(forceRender = false) {
    if (!this.modListContainer) {
      this.modListContainer = document.querySelector<HTMLElement>('#mod-list');
    }

    if (!this.modListContainer) {
      console.warn('Mod list container not found, skipping render');
      return;
    }

    if (!this.listRenderer) {
      console.warn('List renderer not initialized, reinitializing...');
      this.initContainer();
      if (!this.listRenderer) {
        console.error('Failed to initialize list renderer');
        return;
      }
    }

    if (this.mods.length === 0) {
      const t = (
        key: string,
        fallback: string,
        params: Record<string, string> = {},
      ) => {
        const translated = window.i18n?.t?.(key, params);
        return translated && translated !== key ? translated : fallback;
      };
      const gameBananaLink =
        '<a href="#" onclick="window.electronAPI.openUrl(\'https://gamebanana.com/games/6498\'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>';

      this.modListContainer.innerHTML =
        '<div class="no-results-message" style="color: var(--text-muted); text-align: center; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">' +
        '<i class="bi bi-folder-x" style="font-size: 32px; opacity: 0.5;"></i>' +
        `<span>${t('tools.noModsAvailable', 'No mods available.')}</span>` +
        `<span style="font-size: 13px;">${t('tools.downloadOnGameBanana', `Go download some on ${gameBananaLink}!`, { site: gameBananaLink })}</span>` +
        '</div>';
      this.renderedModIds.clear();
      return;
    }

    const currentModIds = new Set(this.mods.map((m) => m.id));
    const needsFullRender =
      forceRender ||
      this.renderedModIds.size !== currentModIds.size ||
      ![...currentModIds].every((id) => this.renderedModIds.has(id));

    if (!needsFullRender) {
      this.updateVisibility();
      return;
    }

    this.listRenderer.renderModList(
      this.getSortedMods(),
      this.modListContainer,
      this.searchQuery,
      this.categoryFilter,
    );
    this.renderedModIds = currentModIds;

    this.reapplySelectionState();
    if (this.selectedMods.length === 0) {
      this.restoreSelectedMod();
    }

    setTimeout(() => {
      if (this.listRenderer) {
        this.listRenderer.showNonVisibleInstantly();
      }
    }, 1000);
  }

  reapplySelectionState() {
    const hadSelection = this.selectedMods.length > 0 || !!this.selectedMod;
    const selectedIds = new Set(this.selectedMods.map((mod) => mod.id));
    const selectedPaths = new Set(
      this.selectedMods
        .map((mod) => mod.path)
        .filter((path): path is string => Boolean(path)),
    );

    if (selectedIds.size === 0 && selectedPaths.size === 0) {
      this.applySelectionClasses();
      return;
    }

    const refreshedSelection = this.mods.filter(
      (mod) => selectedIds.has(mod.id) || selectedPaths.has(mod.path),
    );

    if (refreshedSelection.length === 0) {
      this.selectedMods = [];
      this.selectedMod = null;
      this.selectionAnchorId = null;
      localStorage.removeItem('selectedModId');
      this.applySelectionClasses();

      if (hadSelection) {
        const updateToken = ++this.selectionUpdateToken;
        void this.updateSelectionInfo([], updateToken);
        void this.updatePreview([], updateToken);
      }

      return;
    }

    const primaryMod =
      refreshedSelection.find((mod) => mod.id === this.selectedMod?.id) ||
      refreshedSelection[0];

    this.selectedMods = this.prioritizeSelection(
      refreshedSelection,
      primaryMod,
    );
    this.selectedMod = primaryMod;
    this.selectionAnchorId =
      this.selectionAnchorId &&
      refreshedSelection.some((mod) => mod.id === this.selectionAnchorId)
        ? this.selectionAnchorId
        : primaryMod.id;

    this.applySelectionClasses();
  }

  restoreSelectedMod() {
    const savedModId = localStorage.getItem('selectedModId');
    if (savedModId && this.mods.find((m) => m.id === savedModId)) {
      setTimeout(() => {
        this.selectMod(savedModId);
      }, 100);
    }
  }

  normalizeSelectOptions(
    forceUpdateOrOptions: boolean | SelectModOptions = false,
  ) {
    if (typeof forceUpdateOrOptions === 'boolean') {
      return { forceUpdate: forceUpdateOrOptions };
    }

    return forceUpdateOrOptions;
  }

  getCurrentSelectedMods() {
    return this.selectedMods
      .map(
        (selectedMod) =>
          this.mods.find(
            (mod) =>
              mod.id === selectedMod.id ||
              (selectedMod.path && mod.path === selectedMod.path),
          ) || null,
      )
      .filter((mod): mod is Mod => Boolean(mod));
  }

  getSelectionSignature(mods: Mod[]) {
    return mods.map((mod) => mod.id).join('|');
  }

  prioritizeSelection(mods: Mod[], primaryMod: Mod | null) {
    const dedupedMods = mods.filter(
      (mod, index, allMods) =>
        allMods.findIndex((candidate) => candidate.id === mod.id) === index,
    );

    if (!primaryMod) {
      return dedupedMods;
    }

    return [
      primaryMod,
      ...dedupedMods.filter((mod) => mod.id !== primaryMod.id),
    ];
  }

  getVisibleModsInOrder() {
    if (!this.modListContainer) {
      return this.mods;
    }

    const visibleModIds = Array.from(
      this.modListContainer.querySelectorAll<HTMLElement>('.mod-item'),
    )
      .filter((item) => item.style.display !== 'none')
      .map((item) => item.dataset.modId)
      .filter((modId): modId is string => Boolean(modId));

    const visibleMods = visibleModIds
      .map((modId) => this.mods.find((mod) => mod.id === modId) || null)
      .filter((mod): mod is Mod => Boolean(mod));

    return visibleMods.length > 0 ? visibleMods : this.mods;
  }

  applySelectionClasses() {
    if (!this.modListContainer) return;

    const selectedMods = this.getCurrentSelectedMods();
    const selectedIds = new Set(selectedMods.map((mod) => mod.id));
    const selectionIndexes = new Map(
      selectedMods.map((mod, index) => [mod.id, index + 1]),
    );
    const showSelectionIndexes = selectedMods.length > 1;
    const allModItems =
      this.modListContainer.querySelectorAll<HTMLElement>('.mod-item');

    allModItems.forEach((item) => {
      const modId = item.dataset.modId;
      const isSelected = !!modId && selectedIds.has(modId);

      item.classList.toggle('selected', isSelected);

      if (isSelected && modId && showSelectionIndexes) {
        item.dataset.selectionIndex = `${selectionIndexes.get(modId)}`;
      } else {
        delete item.dataset.selectionIndex;
      }
    });
  }

  clearSelection() {
    this.selectedMods = [];
    this.selectedMod = null;
    this.selectionAnchorId = null;
    localStorage.removeItem('selectedModId');
    this.applySelectionClasses();

    const updateToken = ++this.selectionUpdateToken;
    void this.updateSelectionInfo([], updateToken);
    void this.updatePreview([], updateToken);
  }

  arePreviewAnimationsDisabled() {
    return (
      document.body.classList.contains('reduced-animations') ||
      document.body.classList.contains('no-animations')
    );
  }

  getGsapRuntime() {
    if (window.gsap) {
      return window.gsap as any;
    }

    if (typeof require === 'function') {
      try {
        const gsapModule = require('gsap');
        const gsapRef =
          gsapModule?.gsap || gsapModule?.default || gsapModule || null;

        if (gsapRef && !window.gsap) {
          window.gsap = gsapRef;
        }

        return gsapRef;
      } catch (error) {
        console.warn('[ModManager] Failed to resolve GSAP runtime:', error);
      }
    }

    return null;
  }

  openPreviewZoom(previewPath: string) {
    const zoomOverlay = document.getElementById('image-zoom-overlay');
    const zoomImg = document.getElementById(
      'image-zoom-img',
    ) as HTMLImageElement | null;

    if (!zoomOverlay || !zoomImg) {
      return;
    }

    zoomImg.src = previewPath;
    zoomOverlay.style.display = 'flex';

    void zoomOverlay.offsetWidth;

    zoomOverlay.classList.add('active');

    const closeBtn = document.getElementById('image-zoom-close');
    const closeZoom = () => {
      zoomOverlay.classList.remove('active');
      setTimeout(() => {
        zoomOverlay.style.display = 'none';
        zoomImg.src = '';
      }, 300);
    };

    closeBtn?.addEventListener('click', closeZoom, { once: true });
    let pointerStartedOnZoomOverlay = false;
    const zoomPointerHandler = (event: PointerEvent) => {
      pointerStartedOnZoomOverlay = event.target === zoomOverlay;
    };
    const zoomBackdropClickHandler = (event: MouseEvent) => {
      const shouldClose =
        pointerStartedOnZoomOverlay && event.target === zoomOverlay;
      pointerStartedOnZoomOverlay = false;
      if (shouldClose) {
        closeZoom();
        zoomOverlay.removeEventListener('pointerdown', zoomPointerHandler);
        zoomOverlay.removeEventListener('click', zoomBackdropClickHandler);
      }
    };
    zoomOverlay.addEventListener('pointerdown', zoomPointerHandler);
    zoomOverlay.addEventListener('click', zoomBackdropClickHandler);

    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeZoom();
        document.removeEventListener('keydown', escHandler);
      }
    };

    document.addEventListener('keydown', escHandler);
  }

  clearPreviewArea(previewArea: HTMLElement, showPlaceholder = false) {
    if (this.previewTimeline?.kill) {
      this.previewTimeline.kill();
    }

    const finishClear = () => {
      this.previewTimeline = null;
      previewArea.style.removeProperty('height');
      previewArea.classList.add('no-preview');
      previewArea.classList.remove('has-stacked-preview');
      previewArea.innerHTML = showPlaceholder
        ? '<p style="color: #666; text-align: center;">No preview available</p>'
        : '';
    };

    const stack = previewArea.querySelector<HTMLElement>('.preview-stack');
    const cards = stack
      ? Array.from(stack.querySelectorAll<HTMLElement>('.preview-stack-card'))
      : [];
    const gsapRef = this.getGsapRuntime();

    if (cards.length === 0 || !gsapRef || this.arePreviewAnimationsDisabled()) {
      finishClear();
      return;
    }

    gsapRef.set(cards, {
      transformOrigin: 'center top',
      willChange: 'transform, opacity, filter',
    });

    this.previewTimeline = gsapRef.timeline({
      defaults: {
        duration: 0.24,
        ease: 'power3.in',
      },
      onComplete: finishClear,
    });

    this.previewTimeline.to(cards, {
      x: (index: number) => 18 + index * 8,
      y: (index: number) => -14 + index * 6,
      scale: (index: number) => Math.max(0.72 - index * 0.04, 0.56),
      opacity: 0,
      filter: 'blur(14px)',
      stagger: {
        each: 0.03,
        from: 'end',
      },
      clearProps: 'willChange',
    });
  }

  getPreviewStackTargetState(index: number, totalCards = 1) {
    const isStackedPreview = totalCards > 1;
    const offsetX = isStackedPreview ? 2 : 10;
    const offsetY = isStackedPreview ? 30 : 16;
    const scaleStep = isStackedPreview ? 0.06 : 0.08;
    const opacityStep = isStackedPreview ? 0.08 : 0.12;
    const blurStep = isStackedPreview ? 0.18 : 0.35;

    return {
      x: index * offsetX,
      y: index * offsetY,
      scale: Math.max(1 - index * scaleStep, 0.72),
      opacity: Math.max(1 - index * opacityStep, 0.5),
      filter: `blur(${Math.min(index * blurStep, 0.9)}px)`,
      zIndex: 10 - index,
    };
  }

  getPreviewStackCollapseState(index: number, remainingCards = 1) {
    const anchorState =
      remainingCards > 1
        ? this.getPreviewStackTargetState(
            Math.min(remainingCards - 1, 2),
            remainingCards,
          )
        : { x: 0, y: 0, scale: 1, zIndex: 10 };

    return {
      x: Math.max(anchorState.x - 1, 0),
      y: anchorState.y + 10 + index * 8,
      scale: Math.max(anchorState.scale - 0.08 - index * 0.03, 0.74),
      opacity: 0,
      filter: `blur(${Math.min(8 + index * 1.5, 12)}px)`,
      zIndex: Math.max(anchorState.zIndex - index - 2, 1),
    };
  }

  createPreviewCard(preview: { mod: Mod; previewPath: string }) {
    const card = document.createElement('div');
    card.className = 'preview-stack-card';

    const img = document.createElement('img');
    card.appendChild(img);

    this.syncPreviewCard(card, preview, 0);

    return card;
  }

  syncPreviewCard(
    card: HTMLElement,
    preview: { mod: Mod; previewPath: string },
    index: number,
  ) {
    card.dataset.previewPath = preview.previewPath;
    card.dataset.modId = preview.mod.id;
    card.style.setProperty('--stack-index', String(index));

    if (index > 0) {
      card.setAttribute('data-stacked', 'true');
      card.onclick = null;
    } else {
      card.removeAttribute('data-stacked');
      card.onclick = () => this.openPreviewZoom(preview.previewPath);
    }

    const img = card.querySelector('img');
    if (img instanceof HTMLImageElement) {
      img.alt = preview.mod.name || 'Preview';
      if (img.src !== preview.previewPath) {
        img.src = preview.previewPath;
      }
    }
  }

  async getPreviewAreaHeight(previewArea: HTMLElement, previewPath: string) {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const previewImg = new Image();

        previewImg.onload = () => {
          resolve({
            width: previewImg.naturalWidth,
            height: previewImg.naturalHeight,
          });
        };

        previewImg.onerror = reject;
        previewImg.src = previewPath;
      },
    );

    const aspectRatio = dimensions.height / dimensions.width;
    const containerWidth = previewArea.offsetWidth;
    let optimalHeight = containerWidth * aspectRatio;

    optimalHeight = Math.max(150, Math.min(400, optimalHeight));

    return optimalHeight;
  }

  async selectMod(
    modId: string,
    forceUpdateOrOptions: boolean | SelectModOptions = false,
  ) {
    const mod = this.mods.find((candidate) => candidate.id === modId);
    if (!mod) return;

    const {
      forceUpdate = false,
      multi = false,
      range = false,
    } = this.normalizeSelectOptions(forceUpdateOrOptions);

    const currentSelection = this.getCurrentSelectedMods();
    let nextSelection: Mod[] = [];

    if (range) {
      const visibleMods = this.getVisibleModsInOrder();
      const anchorId = this.selectionAnchorId || this.selectedMod?.id || modId;
      const anchorIndex = visibleMods.findIndex((item) => item.id === anchorId);
      const targetIndex = visibleMods.findIndex((item) => item.id === modId);

      if (anchorIndex >= 0 && targetIndex >= 0) {
        const startIndex = Math.min(anchorIndex, targetIndex);
        const endIndex = Math.max(anchorIndex, targetIndex);
        nextSelection = this.prioritizeSelection(
          visibleMods.slice(startIndex, endIndex + 1),
          mod,
        );
      } else {
        nextSelection = this.prioritizeSelection([mod], mod);
      }
    } else if (multi) {
      const isAlreadySelected = currentSelection.some(
        (selectedMod) => selectedMod.id === modId,
      );

      if (isAlreadySelected) {
        const remainingSelection = currentSelection.filter(
          (selectedMod) => selectedMod.id !== modId,
        );
        const fallbackPrimary =
          remainingSelection.find(
            (selectedMod) => selectedMod.id === this.selectedMod?.id,
          ) || remainingSelection[0];

        nextSelection = fallbackPrimary
          ? this.prioritizeSelection(remainingSelection, fallbackPrimary)
          : [];
      } else {
        nextSelection = this.prioritizeSelection(
          [...currentSelection, mod],
          mod,
        );
      }
    } else {
      nextSelection = this.prioritizeSelection([mod], mod);
    }

    const nextPrimaryMod = nextSelection[0] || null;
    const nextSelectionSignature = this.getSelectionSignature(nextSelection);
    const currentSelectionSignature = this.getSelectionSignature(
      this.selectedMods,
    );
    const isSamePrimary = this.selectedMod?.id === nextPrimaryMod?.id;

    this.selectionAnchorId = nextPrimaryMod?.id || null;

    if (
      !forceUpdate &&
      isSamePrimary &&
      nextSelectionSignature === currentSelectionSignature
    ) {
      this.applySelectionClasses();
      return;
    }

    this.selectedMods = nextSelection;
    this.selectedMod = nextPrimaryMod;

    if (this.selectedMod) {
      localStorage.setItem('selectedModId', this.selectedMod.id);
    } else {
      localStorage.removeItem('selectedModId');
    }

    this.applySelectionClasses();

    const updateToken = ++this.selectionUpdateToken;
    await Promise.all([
      this.updateSelectionInfo(nextSelection, updateToken),
      this.updatePreview(nextSelection, updateToken),
    ]);
  }

  async updateSelectionInfo(selectedMods: Mod[], updateToken: number) {
    if (!window.modInfoManager) {
      return;
    }

    if (selectedMods.length === 0) {
      if (updateToken !== this.selectionUpdateToken) return;
      window.modInfoManager.clearModInfo();
      return;
    }

    if (selectedMods.length > 1) {
      if (updateToken !== this.selectionUpdateToken) return;
      window.modInfoManager.displaySelectionCount(selectedMods.length);
      return;
    }

    const mod = selectedMods[0];
    window.modInfoManager.showLoading();

    if (mod.path && window.electronAPI?.getModInfo) {
      try {
        console.log('Loading mod info for:', mod.path);
        const modInfo = await window.electronAPI.getModInfo(mod.path);

        if (updateToken !== this.selectionUpdateToken) return;

        console.log('Received mod info from main process:', modInfo);

        if (modInfo) {
          console.log('Displaying mod info:', modInfo);
          window.modInfoManager.displayModInfo(modInfo, mod.path);
          return;
        }

        const t = (key) => {
          return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        };

        window.modInfoManager.displayModInfo(
          {
            display_name: mod.name,
            description: t('tools.modInfo.noInfoToml'),
          },
          mod.path,
        );
        return;
      } catch (error) {
        console.error('Error loading mod info:', error);

        if (updateToken !== this.selectionUpdateToken) return;

        const t = (key) => {
          return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        };

        window.modInfoManager.showError(t('tools.modInfo.failedToLoad'));
        return;
      }
    }

    if (updateToken !== this.selectionUpdateToken) return;

    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    window.modInfoManager.displayModInfo(
      {
        display_name: mod.name,
        description: t('tools.modInfo.noDetailedInfo'),
      },
      null,
    );
  }

  async updatePreview(selectedMods: Mod[], updateToken: number) {
    const previewArea = document.querySelector<HTMLElement>('.preview-area');
    if (!previewArea) return;

    previewArea.classList.add('loading');

    if (selectedMods.length === 0) {
      if (updateToken !== this.selectionUpdateToken) return;
      this.clearPreviewArea(previewArea);
      previewArea.classList.remove('loading');
      return;
    }

    const previewCandidates = selectedMods.slice(0, 3);
    const previewResults = await Promise.all(
      previewCandidates.map(async (selectedMod) => {
        if (!selectedMod.path || !window.electronAPI?.getPreviewImage) {
          return null;
        }

        try {
          const previewPath = await window.electronAPI.getPreviewImage(
            selectedMod.path,
          );

          if (!previewPath) {
            return null;
          }

          return {
            mod: selectedMod,
            previewPath,
          };
        } catch (error) {
          console.error('Error loading preview:', error);
          return null;
        }
      }),
    );

    if (updateToken !== this.selectionUpdateToken) return;

    const availablePreviews = previewResults.filter(
      (
        preview,
      ): preview is {
        mod: Mod;
        previewPath: string;
      } => Boolean(preview),
    );

    if (availablePreviews.length === 0) {
      this.clearPreviewArea(previewArea, true);
      previewArea.classList.remove('loading');
      return;
    }

    try {
      const previewHeight = await this.getPreviewAreaHeight(
        previewArea,
        availablePreviews[0].previewPath,
      );

      if (updateToken !== this.selectionUpdateToken) return;

      previewArea.style.height = `${previewHeight}px`;
    } catch (error) {
      console.error('Error sizing preview:', error);
      previewArea.style.removeProperty('height');
    }

    this.renderPreviewStack(previewArea, availablePreviews);
    previewArea.classList.remove('loading');
  }

  renderPreviewStack(
    previewArea: HTMLElement,
    previews: Array<{ mod: Mod; previewPath: string }>,
  ) {
    if (this.previewTimeline?.kill) {
      this.previewTimeline.kill();
    }
    this.previewTimeline = null;

    const gsapRef = this.getGsapRuntime();
    const animationsDisabled = !gsapRef || this.arePreviewAnimationsDisabled();

    previewArea.classList.remove('no-preview');
    previewArea.classList.toggle('has-stacked-preview', previews.length > 1);
    previewArea.style.setProperty(
      '--preview-stack-visible-count',
      String(Math.max(previews.length, 1)),
    );

    let stack = previewArea.querySelector<HTMLElement>('.preview-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'preview-stack';
      previewArea.innerHTML = '';
      previewArea.appendChild(stack);
    }

    const existingCards = Array.from(
      stack.querySelectorAll<HTMLElement>('.preview-stack-card'),
    );
    const existingCardsByPath = new Map(
      existingCards.map((card) => [card.dataset.previewPath || '', card]),
    );
    const nextCards: HTMLElement[] = [];
    const newCards: HTMLElement[] = [];

    previews.forEach((preview, index) => {
      const existingCard = existingCardsByPath.get(preview.previewPath);
      const card = existingCard || this.createPreviewCard(preview);

      if (existingCard) {
        existingCardsByPath.delete(preview.previewPath);
      } else {
        newCards.push(card);
      }

      this.syncPreviewCard(card, preview, index);
      stack!.appendChild(card);
      nextCards.push(card);
    });

    const removedCards = Array.from(existingCardsByPath.values());

    if (animationsDisabled) {
      removedCards.forEach((card) => card.remove());
      if (stack.childElementCount === 0) {
        previewArea.innerHTML = '';
      }
      return;
    }

    gsapRef.set([...nextCards, ...removedCards], {
      transformOrigin: 'center top',
      willChange: 'transform, opacity, filter',
    });

    if (newCards.length > 0) {
      gsapRef.set(newCards, {
        x: -18,
        y: -24,
        scale: 0.88,
        opacity: 0,
        filter: 'blur(12px)',
      });
    }

    this.previewTimeline = gsapRef.timeline({
      defaults: {
        duration: 0.44,
        ease: 'power3.out',
      },
      onComplete: () => {
        removedCards.forEach((card) => card.remove());
        nextCards.forEach((card) => card.style.removeProperty('will-change'));
        if (stack && stack.childElementCount === 0) {
          previewArea.innerHTML = '';
        }
      },
    });

    if (removedCards.length > 0) {
      this.previewTimeline.to(
        removedCards,
        {
          x: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).x,
          y: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).y,
          scale: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).scale,
          opacity: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).opacity,
          filter: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).filter,
          zIndex: (index: number) =>
            this.getPreviewStackCollapseState(index, previews.length).zIndex,
          duration: 0.3,
          ease: 'power2.inOut',
          stagger: 0.03,
        },
        0,
      );
    }

    this.previewTimeline.to(
      nextCards,
      {
        x: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).x,
        y: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).y,
        scale: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).scale,
        opacity: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).opacity,
        filter: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).filter,
        zIndex: (index: number) =>
          this.getPreviewStackTargetState(index, previews.length).zIndex,
        stagger: 0.04,
        clearProps: 'willChange',
      },
      0,
    );
  }

  removeModFromSelection(modId: string) {
    if (!this.selectedMods.some((selectedMod) => selectedMod.id === modId)) {
      return;
    }

    const remainingSelection = this.selectedMods.filter(
      (selectedMod) => selectedMod.id !== modId,
    );
    const nextPrimaryMod =
      remainingSelection.find(
        (selectedMod) => selectedMod.id === this.selectedMod?.id,
      ) ||
      remainingSelection[0] ||
      null;

    this.selectedMods = nextPrimaryMod
      ? this.prioritizeSelection(remainingSelection, nextPrimaryMod)
      : [];
    this.selectedMod = nextPrimaryMod;
    this.selectionAnchorId = nextPrimaryMod?.id || null;

    if (this.selectedMod) {
      localStorage.setItem('selectedModId', this.selectedMod.id);
    } else {
      localStorage.removeItem('selectedModId');
    }

    this.applySelectionClasses();

    const updateToken = ++this.selectionUpdateToken;
    void this.updateSelectionInfo(this.selectedMods, updateToken);
    void this.updatePreview(this.selectedMods, updateToken);
  }

  loadExampleMods() {
    return this.loadMods([
      {
        id: '1',
        name: 'Fighter Pack v2',
        version: '2.1.0',
        author: 'FightMaster',
        description: 'Collection de nouveaux combattants',
        size: '15.2 MB',
        status: 'active',
        path: 'fighter_pack_v2',
      },
      {
        id: '2',
        name: 'Stage HD Remaster',
        version: '1.5.0',
        author: 'StageBuilder',
        description: 'Stages en haute définition',
        size: '8.7 MB',
        status: 'active',
        path: 'stage_hd_remaster',
      },
      {
        id: '3',
        name: 'Sound Pack Deluxe',
        version: '1.0.0',
        author: 'AudioMod',
        description: 'Sons et musiques améliorés',
        size: '22.4 MB',
        status: 'conflict',
        path: 'sound_pack_deluxe',
      },
      {
        id: '4',
        name: 'UI Enhancement',
        version: '3.2.1',
        author: 'UITeam',
        description: 'Interface utilisateur améliorée',
        size: '4.1 MB',
        status: 'disabled',
        path: 'ui_enhancement',
      },
      {
        id: '5',
        name: 'Custom Animations',
        version: '1.8.0',
        author: 'AnimPro',
        description: 'Nouvelles animations de combat',
        size: '12.6 MB',
        status: 'active',
        path: 'custom_animations',
      },
      {
        id: '6',
        name: 'Balance Patch',
        version: '2.0.0',
        author: 'BalanceTeam',
        description: 'Équilibrage des personnages',
        size: '0.8 MB',
        status: 'active',
        path: 'balance_patch',
      },
    ]);
  }

  async loadModsFromFolder(modsPath: string) {
    if (this.isBatchTestingLocked()) {
      console.log(
        '[ModManager] Skipping folder refresh while batch testing is active',
      );
      return;
    }

    if (!window.electronAPI || !window.electronAPI.readModsFolder) {
      console.error('Electron API not available');
      await this.loadExampleMods();
      return;
    }

    this.modsPath = modsPath;

    try {
      if (await this.isDirectHardwareLibraryUnavailable(modsPath)) {
        if (await this.renderHardwareCache(modsPath)) {
          return;
        }

        this.renderHardwareReconnectBlocker(modsPath);
        return;
      }

      this.setHardwareLibraryBlockedState(false);

      const result = await window.electronAPI.readModsFolder(modsPath);

      if (!result.success) {
        if (this.isDirectHardwareLibraryMode()) {
          this.renderHardwareReconnectBlocker(modsPath);
          return;
        }

        console.error('Error reading mods:', result.error);
        await this.loadExampleMods();
        return;
      }

      this.saveHardwareLibraryCache(modsPath, result);
      await this.refreshModsFromState(result);
    } catch (error) {
      if (this.isDirectHardwareLibraryMode()) {
        if (await this.renderHardwareCache(modsPath)) {
          return;
        }

        this.renderHardwareReconnectBlocker(modsPath);
        return;
      }

      console.error('Failed to load mods from folder:', error);
      await this.loadExampleMods();
      this.clearBatchTestingOverride();
    }
  }

  async setAllModsEnabled(enabled: boolean) {
    if (this.isBatchTestingLocked()) {
      if (window.toastManager) {
        window.toastManager.warning('toasts.batchTestingAlreadyRunning');
      }
      return;
    }

    const modsPath =
      this.modsPath || window.settingsManager?.getModsPath?.() || null;

    if (!modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.modsFolderNotConfigured');
      }
      return;
    }

    if (
      !window.electronAPI?.readModsFolder ||
      !window.electronAPI?.applyModBatchState
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.functionNotAvailable');
      }
      return;
    }

    this.modsPath = modsPath;

    try {
      const currentState = await window.electronAPI.readModsFolder(modsPath);

      if (!currentState.success) {
        throw new Error(currentState.error || 'Failed to read mods folder');
      }

      const enabledModNames = enabled
        ? [
            ...currentState.activeMods.map((mod) => mod.path || mod.name),
            ...currentState.disabledMods.map((mod) => mod.path || mod.name),
          ]
        : [];

      if (enabled && currentState.disabledMods.length === 0) {
        window.toastManager?.info('toasts.noDisabledModsToEnable');
        return;
      }

      if (!enabled && currentState.activeMods.length === 0) {
        window.toastManager?.info('toasts.noActiveModsToDisable');
        return;
      }

      const result = await window.electronAPI.applyModBatchState(
        modsPath,
        enabledModNames,
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to update mods');
      }

      await this.refreshModsFromState(result);

      window.toastManager?.success(
        enabled ? 'toasts.allModsEnabled' : 'toasts.allModsDisabled',
      );
    } catch (error) {
      console.error('Failed to apply bulk mod state:', error);
      window.toastManager?.error('toasts.failedToBulkToggleMods', 3000, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async loadCategoriesInBackground(mods: Mod[]) {
    for (const mod of mods) {
      try {
        const modInfo = await window.electronAPI.getModInfo(mod.path);

        if (modInfo && modInfo.category) {
          let category = modInfo.category;

          const categoryMap = {
            fighter: 'Fighter',
            fighters: 'Fighter',
            skin: 'Fighter',
            skins: 'Fighter',
            moveset: 'Movesets',
            movesets: 'Movesets',
            stage: 'stages',
            stages: 'stages',
            effect: 'effects',
            effects: 'effects',
            'final smash': 'final smash',
            finalsmash: 'final smash',
            ui: 'UI',
            param: 'Param',
            other: 'Other/misc',
            misc: 'Other/misc',
            'other/misc': 'Other/misc',
          };

          const normalizedCategory =
            categoryMap[category.toLowerCase()] || category;
          mod.category = normalizedCategory;
        }
      } catch (error) {}
    }

    this.updateVisibility();
  }

  async openSelectedModFolder() {
    if (!this.modsPath) {
      console.warn('No mods path set');
      return;
    }

    if (!window.electronAPI || !window.electronAPI.openFolder) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.openFolder(this.modsPath);
      if (!result.success) {
        console.error('Failed to open folder:', result.error);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  }

  async fetchMods() {
    if (this.isBatchTestingLocked()) {
      console.log('[ModManager] Ignoring fetch request during batch testing');
      return;
    }

    if (
      typeof window.settingsManager !== 'undefined' &&
      window.settingsManager
    ) {
      const modsPath = window.settingsManager.getModsPath();

      if (modsPath) {
        if (await this.isDirectHardwareLibraryUnavailable(modsPath)) {
          if (await this.renderHardwareCache(modsPath)) {
            return;
          }

          this.renderHardwareReconnectBlocker(modsPath);
          return;
        }

        this.setHardwareLibraryBlockedState(false);
        console.log('Loading mods from saved path:', modsPath);
        await this.loadModsFromFolder(modsPath);
        return;
      }

      if (this.isDirectHardwareLibraryMode()) {
        if (await this.renderHardwareCache(modsPath)) {
          return;
        }

        this.renderHardwareReconnectBlocker(modsPath);
        return;
      }
    }

    this.setHardwareLibraryBlockedState(false);
    console.log('Loading example mods');
    await this.loadExampleMods();
  }

  async checkConflicts(whitelistPatterns: string[] = []) {
    if (
      !this.modsPath ||
      !window.electronAPI ||
      !window.electronAPI.detectConflicts
    ) {
      return {
        success: false,
        error: 'Conflict detection not available',
      };
    }

    this.isCheckingConflicts = true;

    if (window.statusBarManager) {
      window.statusBarManager.updateCheckingConflictsStatus();
    }

    try {
      const ignoredConflictPaths =
        window.settingsManager?.settings.ignoredConflictPaths || [];
      const ignoredConflictPatterns = ignoredConflictPaths
        .filter((value): value is string => typeof value === 'string')
        .map((value) => this.createExactConflictPathPattern(value));
      const combinedPatterns = Array.from(
        new Set([...whitelistPatterns, ...ignoredConflictPatterns]),
      );

      const result = await window.electronAPI.detectConflicts(
        this.modsPath,
        combinedPatterns,
      );

      this.isCheckingConflicts = false;
      this.conflictGroups = (result.success && result.conflictGroups) || [];

      if (result.success) {
        const conflictModPaths = this.conflictGroups.reduce<Set<string>>(
          (paths, group) => {
            group.conflicts.forEach((conflict) => {
              conflict.mods.forEach((mod) => {
                paths.add(mod.path);
              });
            });

            return paths;
          },
          new Set(),
        );

        let statusesChanged = false;
        this.mods.forEach((mod) => {
          if (mod.status === 'disabled') {
            return;
          }

          const nextStatus = conflictModPaths.has(mod.path)
            ? 'conflict'
            : 'active';

          if (mod.status !== nextStatus) {
            mod.status = nextStatus;
            statusesChanged = true;
          }
        });

        if (statusesChanged) {
          this.renderModList(true);
        }
      }

      if (window.statusBarManager) {
        if (result.success && result.totalConflicts > 0) {
          // Collect unique mods from all conflict groups
          const modsWithConflicts = this.conflictGroups.reduce<Set<string>>(
            (mods, group) => {
              group.conflicts.forEach((conflict) => {
                conflict.mods.forEach((mod) => {
                  mods.add(mod.name);
                });
              });

              return mods;
            },
            new Set(),
          );

          window.statusBarManager.updateConflictStatus(
            result.totalConflicts,
            modsWithConflicts.size,
          );
        } else {
          const statusRight =
            document.querySelector<HTMLElement>('.bottom-text-right');
          if (statusRight) {
            statusRight.innerHTML = '';
          }
        }
        if (!window.statusBarManager.checkActiveDownloads()) {
          if (window.statusBarManager.currentTab) {
            window.statusBarManager.updateStatus(
              window.statusBarManager.currentTab,
            );
          } else {
            window.statusBarManager.updateStatus('tools');
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error checking conflicts:', error);
      this.isCheckingConflicts = false;
      if (window.statusBarManager) {
        const statusRight =
          document.querySelector<HTMLElement>('.bottom-text-right');
        if (statusRight) {
          statusRight.innerHTML = '';
        }
        if (!window.statusBarManager.checkActiveDownloads()) {
          if (window.statusBarManager.currentTab) {
            window.statusBarManager.updateStatus(
              window.statusBarManager.currentTab,
            );
          } else {
            window.statusBarManager.updateStatus('tools');
          }
        }
      }
      return { success: false, error: error.message };
    }
  }

  async checkNroLimit(limit = 64) {
    if (!this.modsPath || !window.electronAPI?.checkNroLimit) {
      return {
        success: false,
        error: 'NRO limit check not available',
      };
    }

    try {
      const result = await window.electronAPI.checkNroLimit(
        this.modsPath,
        limit,
      );

      if (result?.success && result.exceedsLimit) {
        this.showNroLimitWarningModal(result);
      }

      return result;
    } catch (error) {
      console.error('Failed to check NRO limit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  showNroLimitWarningModal(result) {
    if (!window.modalManager?.showCustomModal || !result) {
      return;
    }

    const limit = Number(result.limit || 64);
    const total = Number(result.totalNroFiles || 0);
    const overflow = Math.max(0, total - limit);
    const files = Array.isArray(result.files) ? result.files : [];
    const visibleFiles = files.slice(0, 12);
    const extraCount = Math.max(0, files.length - visibleFiles.length);

    const body = document.createElement('div');
    body.className = 'nro-limit-warning-modal';

    const summary = document.createElement('p');
    summary.style.cssText =
      'margin: 0 0 14px; color: var(--text-secondary); line-height: 1.6;';
    summary.textContent =
      window.i18n?.t?.('modals.nroLimit.message', {
        count: String(total),
        limit: String(limit),
        overflow: String(overflow),
      }) ||
      `${total} active .nro files detected. Limit: ${limit}. Disable or remove ${overflow} .nro file(s).`;
    body.appendChild(summary);

    if (visibleFiles.length > 0) {
      const list = document.createElement('div');
      list.style.cssText =
        'display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow: auto;';

      visibleFiles.forEach((file) => {
        const item = document.createElement('div');
        item.style.cssText =
          'padding: 10px 12px; border: 1px solid var(--border-hover); border-radius: 8px; background: var(--bg-primary);';

        const name = document.createElement('strong');
        name.style.cssText =
          'display: block; color: var(--text-primary); font-size: 13px; margin-bottom: 4px;';
        name.textContent = file.modName || 'Unknown mod';

        const nroPath = document.createElement('code');
        nroPath.style.cssText =
          'display: block; color: var(--text-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        nroPath.textContent = file.relativePath || '.nro';

        item.append(name, nroPath);
        list.appendChild(item);
      });

      body.appendChild(list);
    }

    if (extraCount > 0) {
      const extra = document.createElement('p');
      extra.style.cssText = 'margin: 12px 0 0; color: var(--text-muted);';
      extra.textContent =
        window.i18n?.t?.('modals.nroLimit.moreFiles', {
          count: String(extraCount),
        }) || `+${extraCount} more .nro file(s)`;
      body.appendChild(extra);
    }

    window.modalManager.showCustomModal({
      id: 'nro-limit-warning-modal',
      title:
        window.i18n?.t?.('modals.nroLimit.title') || 'NRO limit exceeded',
      body,
      size: 'normal',
      buttons: [
        {
          text: window.i18n?.t?.('common.ok') || 'OK',
          type: 'primary',
        },
      ],
    });
  }

  createExactConflictPathPattern(filePath: string) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const escapedPath = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `^${escapedPath}$`;
  }

  async askExportFormat() {
    return new Promise((resolve) => {
      const t = (key, params = {}) => {
        return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
      };

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'export-format-modal';
      modal.style.display = 'block';

      modal.innerHTML = `
        <div class="modal-header">
          <h3><i class="bi bi-file-earmark-text"></i> ${t('modals.exportFormat.title')}</h3>
          <button class="modal-close" id="export-format-close-btn">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>${t('modals.exportFormat.question')}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-cancel" id="export-format-cancel-btn">
            <i class="bi bi-x-lg"></i> ${t('common.cancel')}
          </button>
          <button class="modal-btn modal-btn-primary" id="export-format-txt-btn">
            <i class="bi bi-filetype-txt"></i> ${t('modals.exportFormat.txt')}
          </button>
          <button class="modal-btn modal-btn-primary" id="export-format-md-btn">
            <i class="bi bi-filetype-md"></i> ${t('modals.exportFormat.md')}
          </button>
        </div>
      `;

      document.body.appendChild(modal);
      if (window.modalManager) {
        window.modalManager.showOverlay();
      }

      const closeModal = (format: string | null = null) => {
        modal.style.display = 'none';
        modal.remove();
        if (window.modalManager) {
          window.modalManager.hideOverlay();
        }
        resolve(format);
      };

      document
        .querySelector<HTMLElement>('#export-format-close-btn')!
        .addEventListener('click', () => closeModal(null));
      document
        .querySelector<HTMLElement>('#export-format-cancel-btn')!
        .addEventListener('click', () => closeModal(null));
      document
        .querySelector<HTMLElement>('#export-format-txt-btn')!
        .addEventListener('click', () => closeModal('txt'));
      document
        .querySelector<HTMLElement>('#export-format-md-btn')!
        .addEventListener('click', () => closeModal('md'));
    });
  }

  async exportModsList() {
    if (
      !window.electronAPI ||
      !window.electronAPI.saveFileDialog ||
      !window.electronAPI.writeFile
    ) {
      console.error('Electron API not available for file operations');
      return;
    }

    // Get all enabled mods
    const enabledMods = this.mods.filter((mod) => mod.status === 'active');

    if (enabledMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.show(
          'warning',
          'toasts.noEnabledModsToExport',
          3000,
        );
      }
      return;
    }

    // Ask for export format
    const format = await this.askExportFormat();
    if (!format) {
      return; // User cancelled
    }

    // Group mods by character
    const modsByCharacter: Map<
      string,
      {
        name: string;
        url: string;
      }[]
    > = new Map();

    for (const mod of enabledMods) {
      if (!mod.path) {
        continue;
      }

      try {
        // Get mod info
        const modInfo = await window.electronAPI.getModInfo(mod.path);
        const modName = modInfo?.display_name || mod.name;
        const modUrl = modInfo?.url || '';

        // Scan for characters
        const scanModResult = await window.electronAPI.scanMod(mod.path);

        if (
          scanModResult.success &&
          scanModResult.data.fighterNames.length > 0
        ) {
          scanModResult.data.fighterNames.forEach((rawFighterId: string) => {
            const fighterId = window.resolveFolderName
              ? window.resolveFolderName(rawFighterId)
              : rawFighterId.toLowerCase();

            const charInfo = window.SSBU_CHARACTERS
              ? window.SSBU_CHARACTERS[fighterId]
              : null;

            const charName = charInfo ? charInfo.name : rawFighterId;

            if (!modsByCharacter.has(charName)) {
              modsByCharacter.set(charName, []);
            }

            modsByCharacter.get(charName)!.push({
              name: modName,
              url: modUrl,
            });
          });
        } else {
          // Mod doesn't have character folders, add to "Other" category
          if (!modsByCharacter.has('Other')) {
            modsByCharacter.set('Other', []);
          }

          modsByCharacter.get('Other')!.push({
            name: modName,
            url: modUrl,
          });
        }
      } catch (error) {
        console.error(`Error processing mod ${mod.name}:`, error);
      }
    }

    // Build the content based on format
    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    let content = '';
    const isMarkdown = format === 'md';

    if (isMarkdown) {
      content = `# ${t('modals.exportFormat.modsLoaded', { count: enabledMods.length })}\n\n`;
    } else {
      content = `${enabledMods.length} mods loaded\n\n`;
    }

    // Sort characters alphabetically
    const sortedCharacters = Array.from(modsByCharacter.keys()).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    // Write mods grouped by character
    for (const charName of sortedCharacters) {
      const mods = modsByCharacter.get(charName)!;

      // Format character name based on format
      if (isMarkdown) {
        content += `## ${charName}\n\n`;
      } else {
        content += `${charName}\n`;
      }

      // Remove duplicates (same mod name)
      const uniqueMods: {
        name: string;
        url: string;
      }[] = [];

      const seenNames: Set<string> = new Set();

      for (const mod of mods) {
        if (!seenNames.has(mod.name)) {
          seenNames.add(mod.name);
          uniqueMods.push(mod);
        }
      }

      uniqueMods.forEach((mod) => {
        if (mod.url) {
          if (isMarkdown) {
            content += `- ${mod.name} (${mod.url})\n`;
          } else {
            content += `${mod.name} (${mod.url}),\n`;
          }
        } else {
          if (isMarkdown) {
            content += `- ${mod.name}\n`;
          } else {
            content += `${mod.name},\n`;
          }
        }
      });

      content += '\n';
    }

    // Save to file
    try {
      const extension = format === 'md' ? 'md' : 'txt';
      const fileName = `mods_list.${extension}`;
      const filters =
        format === 'md'
          ? [
              { name: 'Markdown Files', extensions: ['md'] },
              { name: 'Text Files', extensions: ['txt'] },
              { name: 'All Files', extensions: ['*'] },
            ]
          : [
              { name: 'Text Files', extensions: ['txt'] },
              { name: 'Markdown Files', extensions: ['md'] },
              { name: 'All Files', extensions: ['*'] },
            ];

      const result = await window.electronAPI.saveFileDialog(fileName, filters);

      if (result.success && result.filePath) {
        await window.electronAPI.writeFile(result.filePath, content);
        if (window.toastManager) {
          window.toastManager.show(
            'success',
            'toasts.modListExportedSuccessfully',
            4000,
            { filePath: result.filePath },
          );
        }
      }
    } catch (error) {
      console.error('Error exporting mod list:', error);
      if (window.toastManager) {
        window.toastManager.show(
          'error',
          'toasts.failedToExportModList',
          4000,
          { error: error.message },
        );
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.modManager = new ModManager();
  console.log('Mod Manager initialized');
}

export { type ModManager };
