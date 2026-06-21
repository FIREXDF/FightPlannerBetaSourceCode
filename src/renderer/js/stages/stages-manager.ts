type StageEntry = {
  xmlName: string;
  displayName: string;
  imageUrl: string | null;
  canonicalOrder: number;
  isRandom: boolean;
};

type StageLayoutPresetSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

type StageLayoutState = {
  visibleStageNames: string[];
  hiddenStageNames: string[];
};

class StagesManager {
  root: HTMLElement | null;
  grid: HTMLElement | null;
  gridPanel: HTMLElement | null;
  hiddenButton: HTMLButtonElement | null;
  hiddenCount: HTMLElement | null;
  saveButton: HTMLButtonElement | null;
  presetButton: HTMLButtonElement | null;
  presetButtonLabel: HTMLElement | null;
  summaryValue: HTMLElement | null;
  summaryMeta: HTMLElement | null;
  footerNote: HTMLElement | null;
  movableStages: StageEntry[];
  hiddenStages: StageEntry[];
  randomStages: StageEntry[];
  presets: StageLayoutPresetSummary[];
  canonicalStageNames: string[];
  loadedBaselineLayoutState: StageLayoutState;
  fixedOffsetCells: number;
  fixedRandomCells: number;
  gridColumns: number;
  gridRows: number;
  actualGridRows: number;
  overflowCells: number;
  source: 'saved' | 'canonical' | 'preset';
  currentPresetId: string | null;
  basePresetLabel: string;
  isLoading: boolean;
  isSaving: boolean;
  isPresetSaving: boolean;
  isDirty: boolean;
  hasStageSourceMissing: boolean;
  draggedStageName: string | null;
  stageThumbObserver: IntersectionObserver | null;
  contextMenuInitialized: boolean;
  thumbObserverSetupFrame: number | null;
  thumbObserverSetupTimeout: number | null;
  thumbBatchFrame: number | null;
  activationFrame: number | null;
  activationTimeout: number | null;
  boundGridElement: HTMLElement | null;
  prefetchedLayout: any | null;
  prefetchPromise: Promise<void> | null;

  constructor() {
    this.root = null;
    this.grid = null;
    this.gridPanel = null;
    this.hiddenButton = null;
    this.hiddenCount = null;
    this.saveButton = null;
    this.presetButton = null;
    this.presetButtonLabel = null;
    this.summaryValue = null;
    this.summaryMeta = null;
    this.footerNote = null;
    this.movableStages = [];
    this.hiddenStages = [];
    this.randomStages = [];
    this.presets = [];
    this.canonicalStageNames = [];
    this.loadedBaselineLayoutState = {
      visibleStageNames: [],
      hiddenStageNames: [],
    };
    this.fixedOffsetCells = 0;
    this.fixedRandomCells = 3;
    this.gridColumns = 11;
    this.gridRows = 11;
    this.actualGridRows = 11;
    this.overflowCells = 0;
    this.source = 'canonical';
    this.currentPresetId = null;
    this.basePresetLabel = 'Default Layout';
    this.isLoading = false;
    this.isSaving = false;
    this.isPresetSaving = false;
    this.isDirty = false;
    this.hasStageSourceMissing = false;
    this.draggedStageName = null;
    this.stageThumbObserver = null;
    this.contextMenuInitialized = false;
    this.thumbObserverSetupFrame = null;
    this.thumbObserverSetupTimeout = null;
    this.thumbBatchFrame = null;
    this.activationFrame = null;
    this.activationTimeout = null;
    this.boundGridElement = null;
    this.prefetchedLayout = null;
    this.prefetchPromise = null;

    this.setupContextMenu();
  }

  preloadLayout() {
    if (this.prefetchedLayout || this.prefetchPromise || this.movableStages.length > 0) {
      return this.prefetchPromise || Promise.resolve();
    }

    this.prefetchPromise = (async () => {
      try {
        if (!window.electronAPI?.getStageLayout) {
          return;
        }
        const result = await window.electronAPI.getStageLayout();
        if (result?.success) {
          this.prefetchedLayout = result;
        }
      } catch (error) {
        console.warn('[StagesManager] Preload failed:', error);
      } finally {
        this.prefetchPromise = null;
      }
    })();

    return this.prefetchPromise;
  }

  t(key: string, fallback: string, params: Record<string, string | number> = {}) {
    if (!window.i18n?.t) {
      return fallback;
    }

    const normalizedParams = Object.fromEntries(
      Object.entries(params).map(([paramKey, value]) => [paramKey, String(value)]),
    );

    return window.i18n.t(key, normalizedParams) || fallback;
  }

  getTotalCellCount() {
    const requiredCells =
      this.fixedOffsetCells + this.fixedRandomCells + this.movableStages.length;
    return Math.max(this.gridColumns * this.gridRows, requiredCells);
  }

  getCurrentLayoutState() {
    return {
      visibleStageNames: this.movableStages.map((stage) => stage.xmlName),
      hiddenStageNames: this.hiddenStages.map((stage) => stage.xmlName),
    } satisfies StageLayoutState;
  }

  getMovableStageAtGridIndex(gridIndex: number) {
    const movableIndex = gridIndex - this.fixedOffsetCells - this.fixedRandomCells;
    if (movableIndex < 0 || movableIndex >= this.movableStages.length) {
      return null;
    }

    return {
      stage: this.movableStages[movableIndex],
      movableIndex,
    };
  }

  findStage(stageName: string) {
    return this.movableStages.find((stage) => stage.xmlName === stageName)
      || this.hiddenStages.find((stage) => stage.xmlName === stageName)
      || null;
  }

  areStageOrdersEqual(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((stageName, index) => stageName === right[index]);
  }

  areLayoutStatesEqual(left: StageLayoutState, right: StageLayoutState) {
    return (
      this.areStageOrdersEqual(left.visibleStageNames, right.visibleStageNames)
      && this.areStageOrdersEqual(left.hiddenStageNames, right.hiddenStageNames)
    );
  }

  updateDirtyState() {
    this.isDirty = !this.areLayoutStatesEqual(
      this.getCurrentLayoutState(),
      this.loadedBaselineLayoutState,
    );
  }

  getDefaultPresetLabel() {
    return this.t('stages.defaultPresetName', 'Default Layout');
  }

  getCurrentLayoutLabel() {
    return this.t('stages.currentLayoutName', 'Current Layout');
  }

  getNewPresetLabel() {
    return this.t('stages.newPresetName', 'New Layout');
  }

  getPresetDisplayName() {
    const presetLabel = this.basePresetLabel || this.getDefaultPresetLabel();
    return this.isDirty ? `${presetLabel} *` : presetLabel;
  }

  bindDom() {
    this.root = document.querySelector<HTMLElement>('#stages-root');
    this.grid = document.querySelector<HTMLElement>('#stages-grid');
    this.gridPanel = document.querySelector<HTMLElement>('.stages-grid-panel');
    this.hiddenCount = document.querySelector<HTMLElement>('#stages-hidden-count');
    this.summaryValue = document.querySelector<HTMLElement>('#stages-summary-value');
    this.summaryMeta = document.querySelector<HTMLElement>('#stages-summary-meta');
    this.footerNote = document.querySelector<HTMLElement>('#stages-footer-note');

    const hiddenButton = document.querySelector<HTMLButtonElement>('#stages-hidden-btn');
    if (hiddenButton && hiddenButton !== this.hiddenButton) {
      const replacement = hiddenButton.cloneNode(true) as HTMLButtonElement;
      hiddenButton.parentNode?.replaceChild(replacement, hiddenButton);
      replacement.addEventListener('click', () => {
        this.openHiddenStagesModal();
      });
      this.hiddenButton = replacement;
      this.hiddenCount = replacement.querySelector<HTMLElement>('#stages-hidden-count');
    } else if (!hiddenButton) {
      this.hiddenButton = null;
    }

    const presetButton = document.querySelector<HTMLButtonElement>('#stages-preset-btn');
    if (presetButton && presetButton !== this.presetButton) {
      const replacement = presetButton.cloneNode(true) as HTMLButtonElement;
      presetButton.parentNode?.replaceChild(replacement, presetButton);
      replacement.addEventListener('click', () => {
        this.openPresetChooser();
      });
      this.presetButton = replacement;
    } else if (!presetButton) {
      this.presetButton = null;
    }

    const saveButton = document.querySelector<HTMLButtonElement>('#stages-save-btn');
    if (saveButton && saveButton !== this.saveButton) {
      const replacement = saveButton.cloneNode(true) as HTMLButtonElement;
      saveButton.parentNode?.replaceChild(replacement, saveButton);
      replacement.addEventListener('click', () => {
        void this.saveLayout();
      });
      this.saveButton = replacement;
    } else if (!saveButton) {
      this.saveButton = null;
    }

    this.presetButtonLabel = document.querySelector<HTMLElement>('#stages-preset-btn-label');
    this.bindGridInteractions();
  }

  bindGridInteractions() {
    if (!this.grid || this.boundGridElement === this.grid) {
      return;
    }

    this.boundGridElement = this.grid;

    this.grid.addEventListener('dragstart', (event) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>('.stages-grid-cell.is-stage') || null;
      const stageName = cell?.dataset.stageName || null;

      if (!cell || !stageName) {
        return;
      }

      this.handleDragStart(event, stageName, cell);
    });

    this.grid.addEventListener('dragend', () => {
      this.handleDragEnd();
    });

    this.grid.addEventListener('dragover', (event) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>('.stages-grid-cell.is-stage') || null;
      const targetIndex = Number(cell?.dataset.stageIndex);

      if (!cell || Number.isNaN(targetIndex)) {
        return;
      }

      this.handleDragOver(event, targetIndex, cell);
    });

    this.grid.addEventListener('drop', (event) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>('.stages-grid-cell.is-stage') || null;
      const targetIndex = Number(cell?.dataset.stageIndex);

      if (!cell || Number.isNaN(targetIndex)) {
        return;
      }

      this.handleDrop(event, targetIndex, cell);
    });

    this.grid.addEventListener('dragleave', (event) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>('.stages-grid-cell.is-drop-target') || null;
      const relatedTarget = event.relatedTarget as Node | null;

      if (!cell || (relatedTarget && cell.contains(relatedTarget))) {
        return;
      }

      cell.classList.remove('is-drop-target');
    });

    this.grid.addEventListener('contextmenu', (event) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>('.stages-grid-cell.is-stage') || null;
      const stageName = cell?.dataset.stageName || null;
      const stage = stageName ? this.findStage(stageName) : null;

      if (!cell || !stage) {
        return;
      }

      this.showStageContextMenu(event, stage, 'hide');
    });
  }

  applyLayoutResult(result: {
    source: 'saved' | 'canonical' | 'preset';
    fixedOffsetCells: number;
    fixedRandomCells: number;
    gridColumns: number;
    gridRows: number;
    actualGridRows: number;
    overflowCells: number;
    randomStages: StageEntry[];
    movableStages: StageEntry[];
    hiddenStages: StageEntry[];
    activePreset: StageLayoutPresetSummary | null;
    presets: StageLayoutPresetSummary[];
    canonicalStageNames: string[];
  }) {
    this.source = result.source;
    this.fixedOffsetCells = result.fixedOffsetCells;
    this.fixedRandomCells = result.fixedRandomCells;
    this.gridColumns = result.gridColumns;
    this.gridRows = result.gridRows;
    this.actualGridRows = result.actualGridRows;
    this.overflowCells = result.overflowCells;
    this.randomStages = result.randomStages;
    this.movableStages = result.movableStages;
    this.hiddenStages = result.hiddenStages;
    this.presets = result.presets;
    this.canonicalStageNames = result.canonicalStageNames;
    this.currentPresetId = result.activePreset?.id || null;
    this.basePresetLabel = result.activePreset?.name
      || (result.source === 'saved'
        ? this.getCurrentLayoutLabel()
        : this.getDefaultPresetLabel());
    this.loadedBaselineLayoutState = this.getCurrentLayoutState();
    this.isDirty = false;
  }

  setupContextMenu() {
    if (this.contextMenuInitialized) {
      return;
    }

    this.contextMenuInitialized = true;

    document.addEventListener('click', (event) => {
      const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
      const target = event.target as HTMLElement | null;

      if (
        contextMenu
        && target
        && !contextMenu.contains(target)
        && contextMenu.style.display !== 'none'
      ) {
        this.closeStageContextMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeStageContextMenu();
      }
    });

    document.addEventListener('scroll', () => {
      this.closeStageContextMenu();
    }, true);

    document.addEventListener('click', (event) => {
      const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
      const target = event.target as HTMLElement | null;
      const item = target?.closest('.context-menu-item') as HTMLElement | null;

      if (!contextMenu || !item || !contextMenu.contains(item)) {
        return;
      }

      if (item.dataset.action !== 'toggle-stage-visibility') {
        return;
      }

      const stageName = contextMenu.dataset.stageName;
      const action = contextMenu.dataset.visibilityAction;
      if (!stageName || !action) {
        this.closeStageContextMenu();
        return;
      }

      this.closeStageContextMenu();

      if (action === 'hide') {
        this.hideStage(stageName);
      } else if (action === 'unhide') {
        this.unhideStage(stageName);
      }
    });
  }

  closeStageContextMenu() {
    const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
    if (!contextMenu) {
      return;
    }

    contextMenu.style.display = 'none';
    contextMenu.removeAttribute('data-stage-name');
    contextMenu.removeAttribute('data-visibility-action');
  }

  showStageContextMenu(event: MouseEvent, stage: StageEntry, action: 'hide' | 'unhide') {
    event.preventDefault();

    const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
    if (!contextMenu) {
      return;
    }

    const icon = contextMenu.querySelector<HTMLElement>('#stage-context-icon');
    const text = contextMenu.querySelector<HTMLElement>('#stage-context-text');
    const stageName = contextMenu.querySelector<HTMLElement>('#stage-context-stage');

    if (icon) {
      icon.className = action === 'hide' ? 'bi bi-eye-slash' : 'bi bi-eye';
    }

    if (stageName) {
      stageName.textContent = stage.displayName;
    }

    if (text) {
      text.textContent = action === 'hide'
        ? this.t('stages.hide', 'Hide')
        : this.t('stages.unhide', 'Unhide');
    }

    contextMenu.dataset.stageName = stage.xmlName;
    contextMenu.dataset.visibilityAction = action;
    contextMenu.style.visibility = 'hidden';
    contextMenu.style.display = 'block';

    void contextMenu.offsetWidth;

    const rectWidth = contextMenu.offsetWidth;
    const rectHeight = contextMenu.offsetHeight;

    contextMenu.style.display = 'none';
    contextMenu.style.visibility = '';

    const viewportInset = 12;
    const menuGap = 10;
    const stageCell = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : null;
    const stageRect = stageCell?.getBoundingClientRect() || null;

    let left = event.clientX + menuGap;
    let top = event.clientY + menuGap;

    if (stageRect) {
      const hasRoomOnRight =
        stageRect.right + menuGap + rectWidth <= window.innerWidth - viewportInset;
      const hasRoomOnLeft =
        stageRect.left - menuGap - rectWidth >= viewportInset;
      const hasRoomBelow =
        stageRect.top + rectHeight <= window.innerHeight - viewportInset;
      const hasRoomAbove =
        stageRect.bottom - rectHeight >= viewportInset;

      if (hasRoomOnRight || (!hasRoomOnLeft && window.innerWidth - stageRect.right >= stageRect.left)) {
        left = stageRect.right + menuGap;
      } else if (hasRoomOnLeft) {
        left = stageRect.left - rectWidth - menuGap;
      }

      if (hasRoomBelow) {
        top = stageRect.top;
      } else if (hasRoomAbove) {
        top = stageRect.bottom - rectHeight;
      }
    }

    left = Math.max(viewportInset, Math.min(left, window.innerWidth - rectWidth - viewportInset));
    top = Math.max(viewportInset, Math.min(top, window.innerHeight - rectHeight - viewportInset));

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
    contextMenu.style.display = 'block';
  }

  hideStage(stageName: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const stageIndex = this.movableStages.findIndex((stage) => stage.xmlName === stageName);
    if (stageIndex < 0) {
      return;
    }

    const [stage] = this.movableStages.splice(stageIndex, 1);
    this.hiddenStages = [...this.hiddenStages, stage].sort(
      (left, right) => left.canonicalOrder - right.canonicalOrder,
    );
    this.render();
  }

  unhideStage(stageName: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const stageIndex = this.hiddenStages.findIndex((stage) => stage.xmlName === stageName);
    if (stageIndex < 0) {
      return;
    }

    const [stage] = this.hiddenStages.splice(stageIndex, 1);
    this.movableStages = [...this.movableStages, stage];
    this.render();
  }

  async initialize() {
    this.bindDom();

    if (!this.root || !this.grid) {
      return;
    }

    this.beginTabActivation();

    if (this.movableStages.length === 0 && this.hiddenStages.length === 0 && !this.isLoading) {
      await this.loadLayout();
      return;
    }

    this.render();
  }

  async loadLayout() {
    if (this.isLoading) {
      return;
    }

    this.bindDom();
    if (!this.grid) {
      return;
    }

    this.isLoading = true;
    this.updateMeta();
    this.disconnectThumbObserver();
    this.grid.innerHTML = `<div class="stages-empty-state">${this.t('stages.loading', 'Loading stages...')}</div>`;

    try {
      if (this.prefetchPromise) {
        await this.prefetchPromise;
      }

      let result = this.prefetchedLayout;
      if (result) {
        this.prefetchedLayout = null;
      } else {
        result = await window.electronAPI.getStageLayout();
      }
      if (!result.success) {
        throw new Error(result.error || this.t('stages.loadFailed', 'Failed to load stage layout'));
      }

      this.hasStageSourceMissing = false;
      this.applyLayoutResult(result);
      this.render();
    } catch (error) {
      console.error('[StagesManager] Failed to load layout:', error);
      if (this.grid) {
        const message = error.message || this.t('stages.loadFailed', 'Failed to load stage layout');
        if (message.includes('ui_stage_db.xml')) {
          this.hasStageSourceMissing = true;
          this.renderStageSourceRequired(message);
          return;
        } else {
          this.grid.innerHTML = `<div class="stages-empty-state is-error">${this.escapeHtml(message)}</div>`;
        }
      }
      window.toastManager?.error('toasts.failedToLoadStages', 4000, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isLoading = false;
      this.updateMeta();
    }
  }

  renderStageSourceRequired(message: string) {
    if (!this.grid) {
      return;
    }

    this.grid.innerHTML = `
<div class="stages-empty-state">
  <i class="bi bi-filetype-xml"></i>
  <h3>${this.escapeHtml(this.t('stages.sourceRequiredTitle', 'Stage source required'))}</h3>
  <p>${this.escapeHtml(this.t('stages.sourceRequiredMessage', 'Choose your own ui_stage_db.xml before editing the stage layout.'))}</p>
  <button type="button" class="input-btn" id="stages-import-source-btn">
    <i class="bi bi-folder2-open"></i>
    <span>${this.escapeHtml(this.t('stages.importSource', 'Import ui_stage_db.xml'))}</span>
  </button>
</div>
`;

    this.grid
      .querySelector<HTMLButtonElement>('#stages-import-source-btn')
      ?.addEventListener('click', () => {
        void this.importStageSource();
      });
  }

  async importStageSource() {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    try {
      const result = await window.electronAPI.importStageLayoutSource();
      if (!result.success) {
        throw new Error(result.error || 'Failed to import ui_stage_db.xml');
      }

      this.prefetchedLayout = null;
      this.hasStageSourceMissing = false;
      this.applyLayoutResult(result);
      this.render();
      window.toastManager?.success('toasts.stageSourceImported', 3000);
    } catch (error) {
      window.toastManager?.error('toasts.failedToLoadStages', 4000, {
        error: error.message || 'Unknown error',
      });
    }
  }

  updateMeta() {
    this.updateDirtyState();

    if (this.summaryValue) {
      this.summaryValue.textContent = `${this.movableStages.length}`;
    }

    if (this.summaryMeta) {
      this.summaryMeta.textContent = this.t(
        'stages.statsMeta',
        '{{hidden}} hidden - {{random}} fixed random - {{rows}} rows',
        {
          hidden: this.hiddenStages.length,
          random: this.fixedRandomCells,
          rows: this.actualGridRows,
        },
      );
    }

    if (this.hiddenCount) {
      this.hiddenCount.textContent = `${this.hiddenStages.length}`;
    }

    if (this.hiddenButton) {
      this.hiddenButton.hidden = this.hiddenStages.length === 0;
      this.hiddenButton.disabled =
        this.hiddenStages.length === 0
        || this.isSaving
        || this.isLoading
        || this.isPresetSaving;
    }

    if (this.footerNote) {
      this.footerNote.textContent =
        this.overflowCells > 0
          ? this.t(
              'stages.noteOverflow',
              'Current embedded stage data needs {{rows}} rows to display every stage.',
              { rows: this.actualGridRows },
            )
          : this.t(
              'stages.instructions',
              'Drag any visible stage after the Random cells, or right-click a stage to hide it. Right-click a hidden stage to restore it.',
            );
    }

    if (this.presetButton) {
      this.presetButton.disabled =
        this.isSaving
        || this.isLoading
        || this.isPresetSaving
        || this.hasStageSourceMissing;
      this.presetButton.classList.toggle(
        'is-loading',
        this.isLoading || this.isPresetSaving,
      );
    }

    if (this.presetButtonLabel) {
      this.presetButtonLabel.textContent = this.getPresetDisplayName();
    }

    if (this.saveButton) {
      this.saveButton.disabled =
        this.isSaving
        || this.isLoading
        || this.isPresetSaving
        || this.hasStageSourceMissing;
      this.saveButton.classList.toggle('is-loading', this.isSaving);
    }
  }

  render() {
    this.bindDom();
    if (!this.grid) {
      return;
    }

    this.updateMeta();

    const totalCellCount = this.getTotalCellCount();
    this.grid.style.setProperty('--stages-grid-columns', String(this.gridColumns));
    this.grid.style.setProperty('--stages-grid-rows', String(this.actualGridRows));

    const fragment = document.createDocumentFragment();

    for (let gridIndex = 0; gridIndex < totalCellCount; gridIndex += 1) {
      fragment.appendChild(this.createGridCell(gridIndex));
    }

    this.grid.replaceChildren(fragment);
    this.queueThumbObserverSetup();
  }

  openHiddenStagesModal() {
    if (!window.modalManager || this.hiddenStages.length === 0) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'stages-hidden-modal';

    const copy = document.createElement('p');
    copy.className = 'stages-preset-modal-copy';
    copy.textContent = this.t(
      'stages.hiddenModalHint',
      'Use the restore button under a hidden stage to show it again.',
    );
    body.appendChild(copy);

    const list = document.createElement('div');
    list.className = 'stages-hidden-list';
    body.appendChild(list);

    let modal: HTMLElement | null = null;

    const renderList = () => {
      const fragment = document.createDocumentFragment();

      this.hiddenStages.forEach((stage) => {
        const card = document.createElement('div');
        card.className = 'stages-hidden-card';
        card.dataset.stageName = stage.xmlName;
        card.title = stage.displayName;

        const thumbFrame = document.createElement('div');
        thumbFrame.className = 'stages-hidden-thumb-frame';

        const thumb = this.createStageThumb(stage);
        const orderChip = document.createElement('span');
        orderChip.className = 'stages-order-chip stages-hidden-order-chip';
        orderChip.textContent = String(stage.canonicalOrder);

        const copyGroup = document.createElement('div');
        copyGroup.className = 'stages-hidden-card-copy';

        const label = document.createElement('span');
        label.className = 'stages-hidden-stage-name';
        label.textContent = stage.displayName;

        const meta = document.createElement('span');
        meta.className = 'stages-hidden-stage-meta';
        meta.textContent = this.t(
          'stages.hiddenCardMeta',
          'Hidden from layout',
        );

        const actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'input-btn stages-hidden-action';
        actionButton.setAttribute(
          'aria-label',
          this.t('stages.unhideStageAria', 'Restore {{stage}}', {
            stage: stage.displayName,
          }),
        );

        const actionIcon = document.createElement('i');
        actionIcon.className = 'bi bi-eye';

        const actionLabel = document.createElement('span');
        actionLabel.textContent = this.t('stages.unhide', 'Unhide');

        actionButton.addEventListener('click', () => {
          this.unhideStage(stage.xmlName);

          if (this.hiddenStages.length === 0 && modal) {
            this.closeDynamicModal(modal);
            return;
          }

          renderList();
        });

        thumbFrame.appendChild(orderChip);
        thumbFrame.appendChild(thumb);
        copyGroup.appendChild(label);
        copyGroup.appendChild(meta);
        actionButton.appendChild(actionIcon);
        actionButton.appendChild(actionLabel);

        card.appendChild(thumbFrame);
        card.appendChild(copyGroup);
        card.appendChild(actionButton);
        fragment.appendChild(card);
      });

      list.replaceChildren(fragment);
      this.loadThumbImagesWithin(list);
    };

    renderList();

    modal = window.modalManager.showCustomModal({
      title: this.t('stages.hiddenTitle', 'Hidden stages'),
      body,
      size: 'large',
      buttons: [
        {
          text: this.t('common.cancel', 'Close'),
          type: 'secondary',
        },
      ],
    });
  }

  createStageThumb(stage: StageEntry) {
    const thumb = document.createElement('div');
    thumb.className = 'stages-stage-thumb';

    if (stage.imageUrl) {
      const image = document.createElement('img');
      image.className = 'stages-stage-thumb-image';
      image.alt = stage.displayName;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.dataset.imageUrl = stage.imageUrl;
      image.addEventListener('error', () => {
        this.applyThumbFallback(thumb, stage.displayName);
      });
      thumb.appendChild(image);
    } else {
      this.applyThumbFallback(thumb, stage.displayName);
    }

    return thumb;
  }

  applyThumbFallback(thumb: HTMLElement, displayName: string) {
    thumb.replaceChildren();
    thumb.classList.add('is-fallback');
    thumb.textContent = displayName.slice(0, 1).toUpperCase();
  }

  createGridCell(gridIndex: number) {
    const cell = document.createElement('div');
    cell.className = 'stages-grid-cell';

    if (gridIndex < this.fixedOffsetCells) {
      cell.classList.add('is-offset');
      return cell;
    }

    const randomIndex = gridIndex - this.fixedOffsetCells;
    if (randomIndex >= 0 && randomIndex < this.fixedRandomCells) {
      cell.classList.add('is-random');
      cell.title = this.randomStages[randomIndex]?.displayName || 'Random';
      cell.appendChild(this.createRandomArt(randomIndex));
      return cell;
    }

    const movableStageEntry = this.getMovableStageAtGridIndex(gridIndex);
    if (!movableStageEntry) {
      cell.classList.add('is-trailing');
      return cell;
    }

    const { stage, movableIndex } = movableStageEntry;

    cell.classList.add('is-stage');
    cell.draggable = true;
    cell.dataset.stageName = stage.xmlName;
    cell.dataset.stageIndex = String(movableIndex);
    cell.title = stage.displayName;

    const thumb = this.createStageThumb(stage);

    const order = document.createElement('span');
    order.className = 'stages-order-chip';
    order.textContent = String(movableIndex + 1);

    const label = document.createElement('span');
    label.className = 'stages-stage-label';
    label.textContent = stage.displayName;

    cell.appendChild(thumb);
    cell.appendChild(order);
    cell.appendChild(label);

    return cell;
  }

  createRandomArt(randomIndex: number) {
    const art = document.createElement('div');
    art.className = 'stages-random-art';

    const icon = document.createElement('i');
    icon.className = randomIndex === 0 ? 'bi bi-shuffle' : 'bi bi-dice-5';

    art.appendChild(icon);
    return art;
  }

  closeDynamicModal(modal: HTMLElement, onClosed?: () => void) {
    window.modalManager.closeModal(modal, {
      onModalClosed: () => {
        modal.remove();
        onClosed?.();
      },
    });
  }

  formatPresetUpdatedAt(updatedAt: string) {
    try {
      return new Date(updatedAt).toLocaleString();
    } catch {
      return updatedAt;
    }
  }

  openPresetChooser() {
    if (!window.modalManager) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'stages-preset-modal';

    const copy = document.createElement('p');
    copy.className = 'stages-preset-modal-copy';
    copy.textContent = this.t(
      'stages.presetChooserHint',
      'Load a saved stage layout preset, start a fresh one, or save your current arrangement.',
    );
    body.appendChild(copy);

    let chooserModal: HTMLElement | null = null;

    if (this.presets.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'stages-preset-empty';
      emptyState.textContent = this.t(
        'stages.presetEmpty',
        'No saved stage layout presets yet.',
      );
      body.appendChild(emptyState);
    } else {
      const presetList = document.createElement('div');
      presetList.className = 'stages-preset-list';

      this.presets.forEach((preset) => {
        const presetCard = document.createElement('button');
        presetCard.type = 'button';
        presetCard.className = 'stages-preset-card';
        if (preset.id === this.currentPresetId) {
          presetCard.classList.add('is-active');
        }

        const header = document.createElement('div');
        header.className = 'stages-preset-card-header';

        const title = document.createElement('span');
        title.className = 'stages-preset-card-title';
        title.textContent = preset.name;

        header.appendChild(title);

        if (preset.id === this.currentPresetId) {
          const badge = document.createElement('span');
          badge.className = 'stages-preset-card-badge';
          badge.textContent = this.t('stages.presetCurrent', 'Current');
          header.appendChild(badge);
        }

        const meta = document.createElement('div');
        meta.className = 'stages-preset-card-meta';
        meta.textContent = this.t(
          'stages.presetUpdatedAt',
          'Updated {{date}}',
          { date: this.formatPresetUpdatedAt(preset.updatedAt) },
        );

        presetCard.appendChild(header);
        presetCard.appendChild(meta);
        presetCard.addEventListener('click', async () => {
          if (this.isLoading || this.isSaving || this.isPresetSaving) {
            return;
          }

          const loaded = await this.loadPreset(preset.id);
          if (loaded && chooserModal) {
            this.closeDynamicModal(chooserModal);
          }
        });

        presetList.appendChild(presetCard);
      });

      body.appendChild(presetList);
    }

    chooserModal = window.modalManager.showCustomModal({
      title: this.t('stages.presetChooserTitle', 'Stage Layout Presets'),
      body,
      buttons: [
        {
          text: this.t('common.cancel', 'Cancel'),
          type: 'secondary',
        },
        {
          text: this.t('stages.presetNew', 'New'),
          type: 'secondary',
          closeOnClick: false,
          onClick: () => {
            if (!chooserModal) {
              return false;
            }

            this.closeDynamicModal(chooserModal, () => {
              this.resetToNewLayout();
            });
            return false;
          },
        },
        {
          text: this.t('stages.presetSave', 'Save'),
          type: 'primary',
          closeOnClick: false,
          onClick: () => {
            if (!chooserModal) {
              return false;
            }

            this.closeDynamicModal(chooserModal, () => {
              void this.promptAndSavePreset();
            });
            return false;
          },
        },
      ],
    });
  }

  async promptAndSavePreset() {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const presetName = await this.promptForPresetName(
      this.currentPresetId ? this.basePresetLabel : '',
    );
    if (!presetName) {
      return;
    }

    this.isPresetSaving = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.saveStageLayoutPreset(
        presetName,
        this.getCurrentLayoutState(),
        this.currentPresetId,
      );

      if (!result.success) {
        throw new Error(result.error || this.t('stages.presetSaveFailed', 'Failed to save preset'));
      }

      this.currentPresetId = result.preset.id;
      this.basePresetLabel = result.preset.name;
      this.presets = result.presets;
      this.loadedBaselineLayoutState = this.getCurrentLayoutState();
      this.isDirty = false;
      this.render();

      window.toastManager?.success('toasts.stagePresetSaved', 3500);
    } catch (error) {
      console.error('[StagesManager] Failed to save preset:', error);
      window.toastManager?.error('toasts.failedToSaveStages', 4500, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isPresetSaving = false;
      this.updateMeta();
    }
  }

  promptForPresetName(initialName: string) {
    return new Promise<string | null>((resolve) => {
      if (!window.modalManager) {
        resolve(null);
        return;
      }

      let resolved = false;
      const finish = (value: string | null) => {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve(value);
      };

      const form = document.createElement('div');
      form.className = 'stages-preset-form';

      const inputId = `stage-preset-name-input-${Date.now()}`;

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.htmlFor = inputId;
      label.textContent = this.t('stages.presetNameLabel', 'Preset name');

      const input = document.createElement('input');
      input.id = inputId;
      input.type = 'text';
      input.className = 'modal-input';
      input.placeholder = this.t(
        'stages.presetNamePlaceholder',
        'Enter a name for this layout',
      );
      input.value = initialName;

      const errorText = document.createElement('p');
      errorText.className = 'stages-preset-form-error';

      form.appendChild(label);
      form.appendChild(input);
      form.appendChild(errorText);

      let nameModal: HTMLElement | null = null;

      const submit = () => {
        const presetName = input.value.trim().replace(/\s+/g, ' ');
        if (!presetName) {
          errorText.textContent = this.t(
            'stages.presetNameEmpty',
            'Preset name cannot be empty.',
          );
          input.focus();
          return;
        }

        finish(presetName);
        if (nameModal) {
          this.closeDynamicModal(nameModal);
        }
      };

      input.addEventListener('input', () => {
        errorText.textContent = '';
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      nameModal = window.modalManager.showCustomModal({
        title: this.t('stages.presetNameTitle', 'Save Stage Layout Preset'),
        body: form,
        onClose: () => finish(null),
        buttons: [
          {
            text: this.t('common.cancel', 'Cancel'),
            type: 'secondary',
            onClick: () => {
              finish(null);
            },
          },
          {
            text: this.t('common.save', 'Save'),
            type: 'primary',
            closeOnClick: false,
            onClick: () => {
              submit();
              return false;
            },
          },
        ],
      });

      setTimeout(() => {
        input.focus();
        input.select();
      }, 60);
    });
  }

  async loadPreset(presetId: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return false;
    }

    this.isLoading = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.loadStageLayoutPreset(presetId);
      if (!result.success) {
        throw new Error(result.error || this.t('stages.loadFailed', 'Failed to load stage layout'));
      }

      this.applyLayoutResult(result);
      this.render();
      window.toastManager?.success('toasts.stagePresetLoaded', 3000);
      return true;
    } catch (error) {
      console.error('[StagesManager] Failed to load preset:', error);
      window.toastManager?.error('toasts.failedToLoadStages', 4000, {
        error: error.message || 'Unknown error',
      });
      return false;
    } finally {
      this.isLoading = false;
      this.updateMeta();
    }
  }

  resetToNewLayout() {
    const stagesByName = new Map(
      [...this.movableStages, ...this.hiddenStages].map((stage) => [stage.xmlName, stage]),
    );

    this.movableStages = this.canonicalStageNames
      .map((stageName) => stagesByName.get(stageName) || null)
      .filter((stage): stage is StageEntry => stage !== null);
    this.hiddenStages = [];

    this.currentPresetId = null;
    this.basePresetLabel = this.getNewPresetLabel();
    this.loadedBaselineLayoutState = this.getCurrentLayoutState();
    this.isDirty = false;
    this.render();
  }

  disconnectThumbObserver() {
    if (this.stageThumbObserver) {
      this.stageThumbObserver.disconnect();
      this.stageThumbObserver = null;
    }

    if (this.thumbObserverSetupFrame !== null) {
      window.cancelAnimationFrame(this.thumbObserverSetupFrame);
      this.thumbObserverSetupFrame = null;
    }

    if (this.thumbObserverSetupTimeout !== null) {
      window.clearTimeout(this.thumbObserverSetupTimeout);
      this.thumbObserverSetupTimeout = null;
    }

    if (this.thumbBatchFrame !== null) {
      window.cancelAnimationFrame(this.thumbBatchFrame);
      this.thumbBatchFrame = null;
    }
  }

  loadThumbImage(image: HTMLImageElement) {
    const imageUrl = image.dataset.imageUrl;
    if (!imageUrl || image.dataset.loaded === 'true') {
      return;
    }

    image.src = imageUrl;
    image.dataset.loaded = 'true';
    image.removeAttribute('data-image-url');
    this.stageThumbObserver?.unobserve(image);
  }

  loadThumbImagesWithin(container: ParentNode) {
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('.stages-stage-thumb-image[data-image-url]'),
    );

    this.loadThumbImagesInBatches(images, 10);
  }

  beginTabActivation() {
    if (!this.root) {
      return;
    }

    this.root.classList.add('is-activating');
    const prefersReducedMotion =
      document.body.classList.contains('no-animations')
      || document.body.classList.contains('reduced-animations');

    if (this.activationFrame !== null) {
      window.cancelAnimationFrame(this.activationFrame);
      this.activationFrame = null;
    }

    if (this.activationTimeout !== null) {
      window.clearTimeout(this.activationTimeout);
      this.activationTimeout = null;
    }

    if (prefersReducedMotion) {
      this.activationFrame = window.requestAnimationFrame(() => {
        this.activationFrame = window.requestAnimationFrame(() => {
          this.activationFrame = null;
          this.root?.classList.remove('is-activating');
        });
      });
      return;
    }

    this.activationTimeout = window.setTimeout(() => {
      this.activationTimeout = null;
      this.root?.classList.remove('is-activating');
    }, 260);
  }

  queueThumbObserverSetup() {
    if (!this.root) {
      return;
    }

    if (this.thumbObserverSetupFrame !== null) {
      window.cancelAnimationFrame(this.thumbObserverSetupFrame);
    }

    if (this.thumbObserverSetupTimeout !== null) {
      window.clearTimeout(this.thumbObserverSetupTimeout);
      this.thumbObserverSetupTimeout = null;
    }

    const setup = () => {
      this.thumbObserverSetupFrame = window.requestAnimationFrame(() => {
        this.thumbObserverSetupFrame = null;
        this.setupThumbObserver();
      });
    };

    const shouldDelaySetup =
      this.root.classList.contains('is-activating')
      && !document.body.classList.contains('no-animations')
      && !document.body.classList.contains('reduced-animations');

    if (shouldDelaySetup) {
      this.thumbObserverSetupTimeout = window.setTimeout(() => {
        this.thumbObserverSetupTimeout = null;
        setup();
      }, 140);
      return;
    }

    setup();
  }

  loadThumbImagesInBatches(images: HTMLImageElement[], batchSize: number) {
    if (images.length === 0) {
      return;
    }

    if (this.thumbBatchFrame !== null) {
      window.cancelAnimationFrame(this.thumbBatchFrame);
      this.thumbBatchFrame = null;
    }

    let index = 0;

    const flushBatch = () => {
      const end = Math.min(index + batchSize, images.length);

      for (let currentIndex = index; currentIndex < end; currentIndex += 1) {
        this.loadThumbImage(images[currentIndex]);
      }

      index = end;

      if (index < images.length) {
        this.thumbBatchFrame = window.requestAnimationFrame(flushBatch);
      } else {
        this.thumbBatchFrame = null;
      }
    };

    flushBatch();
  }

  setupThumbObserver() {
    this.disconnectThumbObserver();

    if (!this.root) {
      return;
    }

    const stageImages = Array.from(
      this.root.querySelectorAll<HTMLImageElement>('.stages-stage-thumb-image[data-image-url]'),
    );
    if (stageImages.length === 0) {
      return;
    }

    const eagerImageCount = Math.min(
      stageImages.length,
      Math.max(this.gridColumns * 2, 12),
    );
    this.loadThumbImagesInBatches(stageImages.slice(0, eagerImageCount), 6);

    const deferredImages = stageImages.slice(eagerImageCount);
    if (deferredImages.length === 0) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      this.loadThumbImagesInBatches(deferredImages, 8);
      return;
    }

    this.stageThumbObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          this.loadThumbImage(entry.target as HTMLImageElement);
        });
      },
      {
        root: this.gridPanel,
        threshold: 0.01,
        rootMargin: '240px 0px',
      },
    );

    deferredImages.forEach((image) => {
      this.stageThumbObserver?.observe(image);
    });
  }

  handleDragStart(event: DragEvent, stageName: string, cell?: HTMLElement | null) {
    this.draggedStageName = stageName;
    event.dataTransfer?.setData('text/plain', stageName);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    cell?.classList.add('is-dragging');
  }

  handleDragEnd() {
    this.draggedStageName = null;
    document
      .querySelectorAll<HTMLElement>('.stages-grid-cell.is-dragging, .stages-grid-cell.is-drop-target')
      .forEach((element) => {
        element.classList.remove('is-dragging', 'is-drop-target');
      });
  }

  handleDragOver(event: DragEvent, targetIndex: number, cell?: HTMLElement | null) {
    if (!this.draggedStageName) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    cell?.classList.add('is-drop-target');
  }

  handleDrop(event: DragEvent, targetIndex: number, cell?: HTMLElement | null) {
    event.preventDefault();
    cell?.classList.remove('is-drop-target');

    const stageName =
      this.draggedStageName || event.dataTransfer?.getData('text/plain') || null;
    if (!stageName) {
      return;
    }

    const sourceIndex = this.movableStages.findIndex(
      (stage) => stage.xmlName === stageName,
    );
    if (sourceIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const reorderedStages = [...this.movableStages];
    const [movedStage] = reorderedStages.splice(sourceIndex, 1);
    reorderedStages.splice(targetIndex, 0, movedStage);
    this.movableStages = reorderedStages;

    this.render();
  }

  async saveLayout() {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.saveStageLayout(
        this.getCurrentLayoutState(),
      );

      if (!result.success) {
        throw new Error(result.error || this.t('stages.saveFailed', 'Failed to save stage layout'));
      }

      this.source = 'saved';
      this.overflowCells = result.overflowCells;
      this.actualGridRows = result.actualGridRows;
      this.loadedBaselineLayoutState = this.getCurrentLayoutState();
      this.isDirty = false;
      this.render();

      window.toastManager?.success('toasts.stagesLayoutSaved', 4500);
      if (window.modManager?.fetchMods) {
        void window.modManager.fetchMods();
      }
    } catch (error) {
      console.error('[StagesManager] Failed to save layout:', error);
      window.toastManager?.error('toasts.failedToSaveStages', 4500, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isSaving = false;
      this.updateMeta();
    }
  }

  escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  (window as any).stagesManager = new StagesManager();
}

export { StagesManager };










