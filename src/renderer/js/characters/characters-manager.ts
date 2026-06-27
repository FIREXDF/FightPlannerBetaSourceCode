import { Mod } from '../../../main/mod-utils';

interface Character {
  id: string;
  info: { name: string; number: string };
  mods: { name: string; path: string; status: string; slots: string[] }[];
}

interface CharacterMovesetMod {
  name: string;
  path: string;
  status: 'active' | 'disabled';
  category: string;
  description: string;
  slots: string[];
}

interface CharacterMovesetGroup {
  id: string;
  info: { name: string; number: string };
  mods: CharacterMovesetMod[];
}

interface CharacterCssEntry {
  id: string;
  nameId: string;
  displayName: string;
  number: string;
  imageUrl: string | null;
  order: number;
  hidden: boolean;
  canSelect: boolean;
  isRandom: boolean;
  uiSeriesId: string;
  fighterKind: string;
  fighterKindCorps: string;
  altCharaId: string;
  fighterType: string;
  exhibitYear: string;
  colorNum: string;
  colorStartIndex: string;
  isMii: boolean;
  isBoss: boolean;
  isHiddenBoss: boolean;
  slots: CharacterCssSlot[];
}

interface CharacterCssSlot {
  slotIndex: number;
  cxxIndex: string;
  nxxIndex: string;
  characallLabel: string;
  namChr0: string;
  namChr1: string;
  namChr2: string;
  namChr3: string;
  namStageName: string;
}

class CharactersManager {
  characters: Map<string, Character>;
  movesetCharacters: Map<string, CharacterMovesetGroup>;
  allCharacters: any[];
  searchQuery: string;
  initialized: boolean;
  cssVisibleCharacters: CharacterCssEntry[];
  cssHiddenCharacters: CharacterCssEntry[];
  cssRenamedCharacters: Map<string, string>;
  cssDraggedCharacterId: string | null;
  cssLoaded: boolean;
  cssDirty: boolean;
  cssSaving: boolean;
  cssSelectedCharacterId: string | null;
  cssPanelMode: 'prc' | 'msbt';
  cssSelectedSlotIndex: number;
  cssCharacterUpdates: Map<string, any>;
  cssPrefetchedLayout: any | null;
  cssPrefetchPromise: Promise<void> | null;
  cssSourcePrcPath: string | null;
  cssSourceLayoutPath: string | null;
  cssSourceMsbtPath: string | null;
  cssSourceImporting: boolean;

  constructor() {
    this.characters = new Map();
    this.movesetCharacters = new Map();
    this.allCharacters = [];
    this.searchQuery = '';
    this.initialized = false;
    this.cssVisibleCharacters = [];
    this.cssHiddenCharacters = [];
    this.cssRenamedCharacters = new Map();
    this.cssDraggedCharacterId = null;
    this.cssLoaded = false;
    this.cssDirty = false;
    this.cssSaving = false;
    this.cssSelectedCharacterId = null;
    this.cssPanelMode = 'prc';
    this.cssSelectedSlotIndex = 0;
    this.cssCharacterUpdates = new Map();
    this.cssPrefetchedLayout = null;
    this.cssPrefetchPromise = null;
    this.cssSourcePrcPath = null;
    this.cssSourceLayoutPath = null;
    this.cssSourceMsbtPath = null;
    this.cssSourceImporting = false;

    console.log('Characters Manager created');
  }

  preloadCssLayout() {
    if (this.cssLoaded || this.cssPrefetchedLayout || this.cssPrefetchPromise) {
      return this.cssPrefetchPromise || Promise.resolve();
    }

    this.cssPrefetchPromise = (async () => {
      try {
        if (!window.electronAPI?.getCharacterCssLayout) {
          return;
        }
        const result = await window.electronAPI.getCharacterCssLayout();
        if (result?.success) {
          this.cssPrefetchedLayout = result;
        }
      } catch (error) {
        console.warn('[CharactersManager] CSS preload failed:', error);
      } finally {
        this.cssPrefetchPromise = null;
      }
    })();

    return this.cssPrefetchPromise;
  }

  closeCharacterModal(
    modal: HTMLElement,
    escapeHandler?: (e: KeyboardEvent) => void,
  ) {
    if (!modal || modal.classList.contains('closing')) {
      return;
    }

    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
    }

    const isNoAnimations = document.body.classList.contains('no-animations');
    const modalContent = modal.querySelector<HTMLElement>('.character-modal');

    if (isNoAnimations) {
      modal.remove();
      return;
    }

    modal.classList.add('closing');
    modalContent?.classList.add('closing');

    window.setTimeout(() => {
      modal.remove();
    }, 300);
  }

  bindBackdropClose(modal: HTMLElement, onClose: () => void) {
    let pointerStartedOnBackdrop = false;
    modal.addEventListener('pointerdown', (event) => {
      pointerStartedOnBackdrop = event.target === modal;
    });
    modal.addEventListener('click', (event) => {
      const shouldClose = pointerStartedOnBackdrop && event.target === modal;
      pointerStartedOnBackdrop = false;
      if (shouldClose) {
        onClose();
      }
    });
  }

  async initialize() {
    if (this.initialized) {
      console.log('Characters already initialized, skipping refresh.');
      this.setupEventListeners();
      this.renderCharacters();
      return;
    }

    console.log('Initializing Characters Manager...');
    this.showLoading();
    await this.scanMods();
    this.setupEventListeners();
    this.renderCharacters();
    this.initialized = true;
  }

  setupEventListeners() {
    const searchInput =
      document.querySelector<HTMLInputElement>('#characters-search');

    if (searchInput) {
      const replacement = searchInput.cloneNode(true) as HTMLInputElement;
      searchInput.parentNode?.replaceChild(replacement, searchInput);
      replacement.value = this.searchQuery;
      replacement.addEventListener('input', () => {
        this.searchQuery = replacement.value.toLowerCase();
        this.filterCharacters();
      });
    }

    const editCssButton = document.querySelector<HTMLButtonElement>(
      '#edit-character-css-btn',
    );
    if (editCssButton) {
      const replacement = editCssButton.cloneNode(true) as HTMLButtonElement;
      editCssButton.parentNode?.replaceChild(replacement, editCssButton);
      replacement.addEventListener('click', () => {
        void this.openCssEditor();
      });
    }

    const movesetsButton = document.querySelector<HTMLButtonElement>(
      '#character-movesets-btn',
    );
    if (movesetsButton) {
      const replacement = movesetsButton.cloneNode(true) as HTMLButtonElement;
      movesetsButton.parentNode?.replaceChild(replacement, movesetsButton);
      replacement.addEventListener('click', () => {
        this.openMovesetTracker();
      });
    }

    const movesetsBackButton = document.querySelector<HTMLButtonElement>(
      '#character-movesets-back-btn',
    );
    if (movesetsBackButton) {
      const replacement = movesetsBackButton.cloneNode(
        true,
      ) as HTMLButtonElement;
      movesetsBackButton.parentNode?.replaceChild(
        replacement,
        movesetsBackButton,
      );
      replacement.addEventListener('click', () => {
        this.closeMovesetTracker();
      });
    }

    const backButton = document.querySelector<HTMLButtonElement>(
      '#character-css-back-btn',
    );
    if (backButton) {
      const replacement = backButton.cloneNode(true) as HTMLButtonElement;
      backButton.parentNode?.replaceChild(replacement, backButton);
      replacement.addEventListener('click', () => {
        this.closeCssEditor();
      });
    }

    const hiddenButton = document.querySelector<HTMLButtonElement>(
      '#character-css-hidden-btn',
    );
    if (hiddenButton) {
      const replacement = hiddenButton.cloneNode(true) as HTMLButtonElement;
      hiddenButton.parentNode?.replaceChild(replacement, hiddenButton);
      replacement.addEventListener('click', () => {
        this.openHiddenCssCharactersModal();
      });
    }

    const changeSourceButton = document.querySelector<HTMLButtonElement>(
      '#character-css-change-source-btn',
    );
    if (changeSourceButton) {
      const replacement = changeSourceButton.cloneNode(true) as HTMLButtonElement;
      changeSourceButton.parentNode?.replaceChild(replacement, changeSourceButton);
      replacement.addEventListener('click', () => {
        this.openCharacterCssSourceImport();
      });
    }

    const saveButton = document.querySelector<HTMLButtonElement>(
      '#character-css-save-btn',
    );
    if (saveButton) {
      const replacement = saveButton.cloneNode(true) as HTMLButtonElement;
      saveButton.parentNode?.replaceChild(replacement, saveButton);
      replacement.addEventListener('click', () => {
        void this.saveCssLayout();
      });
    }

    const randomizeButton = document.querySelector<HTMLButtonElement>(
      '#character-css-randomize-btn',
    );
    if (randomizeButton) {
      const replacement = randomizeButton.cloneNode(true) as HTMLButtonElement;
      randomizeButton.parentNode?.replaceChild(replacement, randomizeButton);
      replacement.addEventListener('click', () => {
        this.randomizeCssLayout();
      });
    }

    const previewButton = document.querySelector<HTMLButtonElement>(
      '#character-css-preview-btn',
    );
    if (previewButton) {
      const replacement = previewButton.cloneNode(true) as HTMLButtonElement;
      previewButton.parentNode?.replaceChild(replacement, previewButton);
      replacement.addEventListener('click', () => {
        this.openCssPreviewModal();
      });
    }

    const cssGrid = document.querySelector<HTMLElement>('#character-css-grid');
    if (cssGrid && cssGrid.dataset.listenersBound !== 'true') {
      cssGrid.dataset.listenersBound = 'true';
      cssGrid.addEventListener('dragstart', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        if (!cell?.dataset.characterId) return;
        this.cssDraggedCharacterId = cell.dataset.characterId;
        cell.classList.add('is-dragging');
        event.dataTransfer?.setData('text/plain', cell.dataset.characterId);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
        }
      });
      cssGrid.addEventListener('dragend', () => {
        cssGrid
          .querySelectorAll('.is-dragging, .is-drop-target')
          .forEach((node) =>
            node.classList.remove('is-dragging', 'is-drop-target'),
          );
        this.cssDraggedCharacterId = null;
      });
      cssGrid.addEventListener('dragover', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        if (!cell || !this.cssDraggedCharacterId) return;
        event.preventDefault();
        cell.classList.add('is-drop-target');
      });
      cssGrid.addEventListener('dragleave', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        const relatedTarget = event.relatedTarget as Node | null;
        if (cell && (!relatedTarget || !cell.contains(relatedTarget))) {
          cell.classList.remove('is-drop-target');
        }
      });
      cssGrid.addEventListener('drop', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        if (!cell?.dataset.characterId || !this.cssDraggedCharacterId) return;
        event.preventDefault();
        this.moveCssCharacter(
          this.cssDraggedCharacterId,
          cell.dataset.characterId,
        );
      });
      cssGrid.addEventListener('contextmenu', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        if (!cell?.dataset.characterId) return;
        event.preventDefault();
        this.hideCssCharacter(cell.dataset.characterId);
      });
      cssGrid.addEventListener('click', (event) => {
        const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '.character-css-cell',
        );
        if (!cell?.dataset.characterId) return;
        this.selectCssCharacter(cell.dataset.characterId);
      });
    }
  }

  t(key: string, fallback: string, params: Record<string, string> = {}) {
    const translated = window.i18n?.t?.(key, params);
    return translated && translated !== key ? translated : fallback;
  }

  gameBananaLink() {
    return '<a href="#" onclick="window.electronAPI.openUrl(\'https://gamebanana.com/games/6498\'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>';
  }

  filterCharacters() {
    if (!this.searchQuery) {
      this.renderCharacters();
      return;
    }

    const filtered = this.allCharacters.filter((char) =>
      char.info.name.toLowerCase().includes(this.searchQuery),
    );

    this.renderFilteredCharacters(filtered);
  }

  renderFilteredCharacters(characters) {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) return;

    if (characters.length === 0) {
      container.innerHTML = `
<div class="characters-empty-state">
<i class="bi bi-search"></i>
<h3>${this.t('characters.noSearchResults', 'No characters found')}</h3>
<p>${this.t('characters.tryDifferentSearch', 'Try a different search term')}</p>
</div>
`;
      this.updateCharacterCount(0);
      return;
    }

    container.innerHTML = '';
    characters.forEach((char) => {
      const card = this.createCharacterCard(char);
      container.appendChild(card);
    });

    this.updateCharacterCount(characters.length);
  }

  async scanMods() {
    console.log('Scanning mods for character data...');

    if (!window.settingsManager || !window.settingsManager.hasModsPath()) {
      console.warn('No mods path configured');
      this.renderEmptyState();
      return;
    }

    const modsPath = window.settingsManager.getModsPath();
    if (!modsPath) {
      console.warn('Mods path is null');
      this.renderEmptyState();
      return;
    }

    if (!window.electronAPI || !window.electronAPI.readModsFolder) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.readModsFolder(modsPath);

      if (!result.success) {
        console.error('Error reading mods:', result.error);
        return;
      }

      this.characters.clear();
      this.movesetCharacters.clear();

      const allMods = [
        ...result.activeMods.map((m) => ({
          mod: m,
          status: 'active' as const,
        })),
        ...result.disabledMods.map((m) => ({
          mod: m,
          status: 'disabled' as const,
        })),
      ];

      let scannedCount = 0;
      const scanConcurrency = Math.min(
        6,
        Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
      );

      await this.runWithConcurrency(
        allMods,
        scanConcurrency,
        async ({ mod, status }) => {
          this.updateLoadingStatus(
            `Scanning ${mod.name} (${scannedCount + 1}/${allMods.length})...`,
          );
          await this.scanModForCharacters(mod, status);
          scannedCount += 1;
          this.updateLoadingStatus(
            `Scanned ${scannedCount}/${allMods.length} mods...`,
          );
        },
      );

      console.log(`Found ${this.characters.size} characters with mods`);
    } catch (error) {
      console.error('Failed to scan mods:', error);
    }
  }

  async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>,
  ) {
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await worker(items[currentIndex], currentIndex);
        }
      }),
    );
  }

  async scanModForCharacters(mod: Mod, status: 'active' | 'disabled') {
    if (!window.electronAPI || !window.electronAPI.scanMod) {
      return;
    }

    try {
      const [scanModResult, modInfo] = await Promise.all([
        window.electronAPI.scanMod(mod.path),
        this.getModInfo(mod),
      ]);

      if (scanModResult.success && scanModResult.data.fighterNames.length > 0) {
        const resolvedIds = new Set<string>();
        const isMovesetMod = this.isMovesetModInfo(modInfo, mod.name);
        const movesetMod: CharacterMovesetMod = {
          name: modInfo?.display_name || mod.name,
          path: mod.path,
          status,
          category: modInfo?.category || '',
          description: modInfo?.description || '',
          slots: [],
        };
        const slotsByFighterId = this.getSlotsByResolvedFighterId(
          scanModResult.data.pathData,
        );

        scanModResult.data.fighterNames.forEach((rawFighterId: string) => {
          const fighterId = window.resolveFolderName
            ? window.resolveFolderName(rawFighterId)
            : rawFighterId.toLowerCase();

          if (resolvedIds.has(fighterId)) {
            return;
          }
          resolvedIds.add(fighterId);

          if (!this.characters.has(fighterId)) {
            const charInfo = window.SSBU_CHARACTERS[fighterId];

            if (charInfo) {
              this.characters.set(fighterId, {
                id: fighterId,
                info: charInfo,
                mods: [],
              });
            } else {
              console.warn(
                `Unknown fighter: ${rawFighterId} (resolved to: ${fighterId})`,
              );
            }
          }

          const char = this.characters.get(fighterId);
          if (char) {
            char.mods.push({
              name: mod.name,
              path: mod.path,
              status: status,
              slots: slotsByFighterId.get(fighterId) || [],
            });
          }

          if (isMovesetMod) {
            this.addMovesetModForCharacter(fighterId, {
              ...movesetMod,
              slots: slotsByFighterId.get(fighterId) || [],
            });
          }
        });
      }
    } catch (error) {
      console.error(`Error scanning mod ${mod.name}:`, error);
    }
  }

  async getModInfo(mod: Mod) {
    if (!window.electronAPI?.getModInfo || !mod.path) {
      return null;
    }

    try {
      return await window.electronAPI.getModInfo(mod.path);
    } catch (error) {
      console.warn(`Failed to read info.toml for ${mod.name}:`, error);
      return null;
    }
  }

  isMovesetModInfo(modInfo: any, fallbackName: string) {
    if (!modInfo) {
      return false;
    }

    const searchableInfo = [
      modInfo.category,
      modInfo.display_name,
      modInfo.s_name,
      modInfo.description,
      fallbackName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return /\bmovesets?\b/.test(searchableInfo);
  }

  getSlotsByResolvedFighterId(pathData: Record<string, Record<string, any>>) {
    const slotsByFighterId = new Map<string, string[]>();

    Object.entries(pathData || {}).forEach(([rawFighterId, slots]) => {
      const fighterId = window.resolveFolderName
        ? window.resolveFolderName(rawFighterId)
        : rawFighterId.toLowerCase();
      const detectedSlots = Object.keys(slots || {})
        .filter((slot) => slot !== 'unknown')
        .sort((a, b) => {
          const numA = parseInt(a.replace(/^c/i, ''), 10);
          const numB = parseInt(b.replace(/^c/i, ''), 10);
          return numA - numB;
        });

      slotsByFighterId.set(fighterId, detectedSlots);
    });

    return slotsByFighterId;
  }

  addMovesetModForCharacter(fighterId: string, mod: CharacterMovesetMod) {
    const charInfo = window.SSBU_CHARACTERS?.[fighterId];
    if (!charInfo) {
      return;
    }

    if (!this.movesetCharacters.has(fighterId)) {
      this.movesetCharacters.set(fighterId, {
        id: fighterId,
        info: charInfo,
        mods: [],
      });
    }

    const group = this.movesetCharacters.get(fighterId);
    if (!group) {
      return;
    }

    if (!group.mods.some((entry) => entry.path === mod.path)) {
      group.mods.push(mod);
    }
  }

  renderCharacters() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) {
      console.warn('Characters grid container not found');
      return;
    }

    if (this.characters.size === 0) {
      this.renderEmptyState();
      return;
    }

    container.innerHTML = '';

    this.allCharacters = Array.from(this.characters.values()).sort((a, b) => {
      const numA = parseFloat(a.info.number.replace('ε', '.5'));
      const numB = parseFloat(b.info.number.replace('ε', '.5'));
      return numA - numB;
    });

    this.allCharacters.forEach((char) => {
      const card = this.createCharacterCard(char);
      container.appendChild(card);
    });

    this.updateCharacterCount(this.allCharacters.length);
  }

  updateCharacterCount(count) {
    const countEl = document.querySelector<HTMLElement>('#characters-count');
    if (countEl) {
      countEl.textContent = `${count} character${count !== 1 ? 's' : ''}`;
    }
  }

  renderCharacterSlotBadges(slots: string[], unknownLabel = 'Slot unknown') {
    if (!slots || slots.length === 0) {
      return `<span class="character-moveset-slot is-unknown">${this.escapeHtml(unknownLabel)}</span>`;
    }

    return slots
      .map(
        (slot) =>
          `<span class="character-moveset-slot">${this.escapeHtml(slot)}</span>`,
      )
      .join('');
  }

  createCharacterCard(char) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.characterId = char.id;

    const imageUrl =
      window.CHARACTER_IMAGES[char.id] ||
      'https://www.smashbros.com/assets_v2/img/fighter/mario/main.png';
    const escapedName = this.escapeHtml(char.info.name);

    card.innerHTML = `
<div class="character-card-header">
<img src="${imageUrl}" alt="${escapedName}" class="character-image"
onerror="this.style.display='none'; this.nextElementSibling.classList.add('show-placeholder');">
<div class="character-image-placeholder">
<i class="bi bi-person-circle"></i>
<span class="character-placeholder-text">${escapedName}</span>
</div>
<div class="character-overlay">
<span class="character-number">#${char.info.number}</span>
</div>
</div>
<div class="character-card-body">
<h3 class="character-name">${this.escapeHtml(char.info.name)}</h3>
<div class="character-mod-count">
<i class="bi bi-file-earmark-code"></i>
<span>${char.mods.length} mod${char.mods.length > 1 ? 's' : ''}</span>
</div>
<div class="character-mods-list">
${char.mods
  .map(
    (mod) => `
<div class="character-mod-item ${mod.status}" data-mod-path="${this.escapeHtml(mod.path)}">
<span class="mod-status-dot"></span>
<span class="mod-name">${this.escapeHtml(mod.name)}</span>
<span class="character-mod-slots" aria-label="Detected character slots">
${this.renderCharacterSlotBadges(mod.slots, 'Unknown')}
</span>
</div>
`,
  )
  .join('')}
</div>
</div>
`;

    const modItems = card.querySelectorAll<HTMLElement>('.character-mod-item');
    modItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const modPath = item.dataset.modPath;
        this.openModInToolsTab(modPath);
      });
    });

    card.addEventListener('click', () => {
      this.showCharacterDetails(char);
    });

    return card;
  }

  showCharacterDetails(char) {
    const existingModal = document.querySelector<HTMLElement>(
      '.character-modal-overlay',
    );
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'character-modal-overlay';
    modal.innerHTML = `
<div class="character-modal">
<div class="character-modal-header">
<h2>${this.escapeHtml(char.info.name)}</h2>
<button class="character-modal-close">
<i class="bi bi-x-lg"></i>
</button>
</div>
<div class="character-modal-body">
<p class="character-modal-count">${char.mods.length} mod${char.mods.length > 1 ? 's' : ''} for this character</p>
<div class="character-modal-mods">
${char.mods
  .map(
    (mod) => `
<div class="character-modal-mod-item ${mod.status}" data-mod-path="${this.escapeHtml(mod.path)}">
<span class="mod-status-indicator ${mod.status}"></span>
<span class="character-modal-mod-main">
<span class="mod-name">${this.escapeHtml(mod.name)}</span>
<span class="character-modal-mod-slots" aria-label="Detected character slots">
${this.renderCharacterSlotBadges(mod.slots, 'Slot unknown')}
</span>
</span>
<i class="bi bi-arrow-right-circle"></i>
</div>
`,
  )
  .join('')}
</div>
</div>
</div>
`;

    document.body.appendChild(modal);

    const isNoAnimations = document.body.classList.contains('no-animations');
    if (isNoAnimations) {
      const overlay = modal;
      const modalContent = modal.querySelector<HTMLElement>('.character-modal');
      if (overlay) {
        overlay.style.opacity = '1';
        overlay.style.animation = 'none';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
      }
      if (modalContent) {
        modalContent.style.opacity = '1';
        modalContent.style.transform =
          'translate(-50%, -50%) scale(1) translateY(0)';
        modalContent.style.filter = 'blur(0px)';
        modalContent.style.animation = 'none';
        modalContent.style.position = 'absolute';
        modalContent.style.left = '50%';
        modalContent.style.top = '50%';
        modalContent.style.margin = '0';
      }
    }

    const closeBtn = modal.querySelector<HTMLElement>('.character-modal-close');
    let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

    closeBtn!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeCharacterModal(modal, escapeHandler || undefined);
    });

    this.bindBackdropClose(modal, () => {
      this.closeCharacterModal(modal, escapeHandler || undefined);
    });

    const modalContent = modal.querySelector<HTMLElement>('.character-modal');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    const modItems = modal.querySelectorAll<HTMLElement>(
      '.character-modal-mod-item',
    );
    modItems.forEach((item) => {
      item.addEventListener('click', () => {
        const modPath = item.dataset.modPath;
        this.closeCharacterModal(modal, escapeHandler || undefined);
        this.openModInToolsTab(modPath);
      });
    });

    escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeCharacterModal(modal, escapeHandler || undefined);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  openModInToolsTab(modPath) {
    console.log('Opening mod in tools tab:', modPath);

    const toolsBtn = document.querySelector<HTMLElement>('[data-tab="tools"]');
    if (toolsBtn) {
      toolsBtn.click();
    }

    setTimeout(() => {
      if (window.modManager && window.modManager.mods) {
        const mod = window.modManager.mods.find((m) => m.path === modPath);

        if (mod) {
          window.modManager.selectMod(mod.id);

          setTimeout(() => {
            const modElement = document.querySelector<HTMLElement>(
              `.mod-item[data-mod-id="${mod.id}"]`,
            );
            if (modElement) {
              modElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
              });

              modElement.style.animation = 'highlightMod 1.5s ease';
              setTimeout(() => {
                modElement.style.animation = '';
              }, 1500);
            }
          }, 100);
        }
      }
    }, 300);
  }

  openMovesetTracker() {
    const browserView = document.querySelector<HTMLElement>(
      '#characters-browser-view',
    );
    const movesetsView = document.querySelector<HTMLElement>(
      '#character-movesets-view',
    );

    if (!browserView || !movesetsView) {
      return;
    }

    this.renderMovesetTracker();
    this.switchCharacterView(
      this.getActiveCharacterSubview(),
      movesetsView,
      'forward',
    );
  }

  closeMovesetTracker() {
    const browserView = document.querySelector<HTMLElement>(
      '#characters-browser-view',
    );
    const movesetsView = document.querySelector<HTMLElement>(
      '#character-movesets-view',
    );

    if (!browserView || !movesetsView) {
      return;
    }

    this.switchCharacterView(movesetsView, browserView, 'back');
  }

  switchCharacterView(
    fromView: HTMLElement | null,
    toView: HTMLElement,
    direction: 'forward' | 'back',
  ) {
    if (fromView === toView) {
      toView.hidden = false;
      return;
    }

    document
      .querySelectorAll<HTMLElement>(
        '#characters-browser-view, #character-movesets-view, #character-css-editor',
      )
      .forEach((view) => {
        if (view !== fromView && view !== toView) {
          view.hidden = true;
          view.classList.remove(
            'characters-view-enter-from-left',
            'characters-view-enter-from-right',
            'characters-view-exit-left',
            'characters-view-exit-right',
          );
        }
      });

    const isNoAnimations = document.body.classList.contains('no-animations');
    const animClasses = [
      'characters-view-enter-from-left',
      'characters-view-enter-from-right',
      'characters-view-exit-left',
      'characters-view-exit-right',
    ];
    fromView?.classList.remove(...animClasses);
    toView.classList.remove(...animClasses);

    if (isNoAnimations) {
      if (fromView) {
        fromView.hidden = true;
      }
      toView.hidden = false;
      return;
    }

    if (fromView) {
      fromView.classList.add(
        direction === 'forward'
          ? 'characters-view-exit-left'
          : 'characters-view-exit-right',
      );
      window.setTimeout(() => {
        fromView.hidden = true;
        fromView.classList.remove(
          'characters-view-exit-left',
          'characters-view-exit-right',
        );
      }, 320);
    }

    toView.hidden = false;
    void toView.offsetWidth;
    toView.classList.add(
      direction === 'forward'
        ? 'characters-view-enter-from-right'
        : 'characters-view-enter-from-left',
    );
    window.setTimeout(() => {
      toView.classList.remove(
        'characters-view-enter-from-right',
        'characters-view-enter-from-left',
      );
    }, 320);
  }

  getActiveCharacterSubview() {
    return (
      document.querySelector<HTMLElement>(
        '#characters-browser-view:not([hidden]), #character-movesets-view:not([hidden]), #character-css-editor:not([hidden])',
      ) || null
    );
  }

  renderMovesetTracker() {
    const list = document.querySelector<HTMLElement>(
      '#character-movesets-list',
    );
    const count = document.querySelector<HTMLElement>(
      '#character-movesets-count',
    );
    if (!list) {
      return;
    }

    const movesetGroups = Array.from(this.movesetCharacters.values()).sort(
      (a, b) => {
        const numA = parseFloat(a.info.number.replace('ε', '.5'));
        const numB = parseFloat(b.info.number.replace('ε', '.5'));
        return numA - numB;
      },
    );
    const totalMovesets = movesetGroups.reduce(
      (total, character) => total + character.mods.length,
      0,
    );

    if (count) {
      count.textContent = `${totalMovesets} moveset mod${totalMovesets !== 1 ? 's' : ''}`;
    }

    if (movesetGroups.length === 0) {
      list.innerHTML = `
<div class="characters-empty-state character-movesets-empty">
<i class="bi bi-controller"></i>
<h3>No moveset mods found</h3>
<p>Moveset mods show here when a character mod's info.toml says moveset.</p>
</div>
`;
      return;
    }

    list.innerHTML = movesetGroups
      .map((character) => this.renderMovesetCharacterGroup(character))
      .join('');

    list.querySelectorAll<HTMLElement>('[data-mod-path]').forEach((item) => {
      item.addEventListener('click', () => {
        this.openModInToolsTab(item.dataset.modPath);
      });
    });

    list
      .querySelectorAll<HTMLButtonElement>('[data-add-moveset-css]')
      .forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const characterId = button.dataset.addMovesetCss;
          if (!characterId) {
            return;
          }
          void this.openAddMovesetToCssFlow(characterId);
        });
      });
  }

  renderMovesetCharacterGroup(character: CharacterMovesetGroup) {
    const imageUrl =
      window.CHARACTER_IMAGES[character.id] ||
      'https://www.smashbros.com/assets_v2/img/fighter/mario/main.png';
    const escapedName = this.escapeHtml(character.info.name);

    return `
<section class="character-moveset-group">
<div class="character-moveset-character">
<div class="character-moveset-image-frame">
<img src="${imageUrl}" alt="${escapedName}" onerror="this.hidden=true; this.nextElementSibling.hidden=false;">
<i class="bi bi-person-circle" hidden></i>
</div>
<div>
<strong>${escapedName}</strong>
<span>#${this.escapeHtml(character.info.number)} · ${character.mods.length} moveset mod${character.mods.length !== 1 ? 's' : ''}</span>
</div>
<button class="input-btn character-moveset-add-css-btn" type="button" data-add-moveset-css="${this.escapeHtml(character.id)}">
<i class="bi bi-plus-square"></i>
<span>Add to CSS</span>
</button>
</div>
<div class="character-moveset-mods">
${character.mods.map((mod) => this.renderMovesetModRow(mod)).join('')}
</div>
</section>
`;
  }

  renderMovesetModRow(mod: CharacterMovesetMod) {
    const description = mod.description
      ? `<span class="character-moveset-description">${this.escapeHtml(mod.description)}</span>`
      : '';
    const category = mod.category
      ? `<span class="character-moveset-category">${this.escapeHtml(mod.category)}</span>`
      : '';
    const slotBadges =
      mod.slots.length > 0
        ? mod.slots
            .map(
              (slot) =>
                `<span class="character-moveset-slot">${this.escapeHtml(slot)}</span>`,
            )
            .join('')
        : '<span class="character-moveset-slot is-unknown">Slot unknown</span>';

    return `
<button class="character-moveset-mod ${mod.status}" type="button" data-mod-path="${this.escapeHtml(mod.path)}">
<span class="mod-status-dot"></span>
<span class="character-moveset-mod-main">
<strong>${this.escapeHtml(mod.name)}</strong>
${description}
</span>
<span class="character-moveset-slots" aria-label="Detected moveset slots">
${slotBadges}
</span>
${category}
<i class="bi bi-arrow-right-circle"></i>
</button>
`;
  }

  async openAddMovesetToCssFlow(characterId: string) {
    if (this.cssSaving) {
      return;
    }

    if (!this.cssLoaded) {
      await this.loadCssLayout();
    }

    if (!this.cssLoaded) {
      return;
    }

    const movesetCharacter = this.movesetCharacters.get(characterId);
    if (!movesetCharacter) {
      return;
    }

    const duplicateOptions =
      await this.openAddMovesetToCssModal(movesetCharacter);
    if (!duplicateOptions) {
      return;
    }

    this.cssSaving = true;
    this.renderCssEditor();

    try {
      const result = await window.electronAPI.duplicateCharacterCssEntry({
        sourceCharacterId: duplicateOptions.sourceCharacterId,
        newUiCharaId: duplicateOptions.newUiCharaId,
        newNameId: duplicateOptions.newNameId,
        newDisplayName: duplicateOptions.newDisplayName,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add moveset to CSS');
      }

      this.cssVisibleCharacters = result.visibleCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssHiddenCharacters = result.hiddenCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssSelectedCharacterId = duplicateOptions.newUiCharaId;
      this.cssSelectedSlotIndex = 0;
      this.cssPanelMode = 'msbt';
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      this.cssDirty = true;
      window.toastManager?.success?.(
        'Moveset character added to CSS. Edit slots, then Apply Layout.',
        4500,
      );
      await this.openCssEditor();
    } catch (error) {
      console.error('[CharactersManager] Failed to add moveset to CSS:', error);
      window.toastManager?.error(
        `Failed to add moveset to CSS: ${error.message || 'Unknown error'}`,
        5000,
      );
    } finally {
      this.cssSaving = false;
      this.renderCssEditor();
    }
  }

  openAddMovesetToCssModal(movesetCharacter: CharacterMovesetGroup): Promise<{
    sourceCharacterId: string;
    newUiCharaId: string;
    newNameId: string;
    newDisplayName: string;
  } | null> {
    return new Promise((resolve) => {
      const existingModal = document.querySelector<HTMLElement>(
        '.character-css-add-moveset-modal-overlay',
      );
      existingModal?.remove();

      const cssCharacters = [
        ...this.cssVisibleCharacters,
        ...this.cssHiddenCharacters,
      ].filter((character) => !character.isRandom);
      const preferredSource =
        cssCharacters.find(
          (character) =>
            character.nameId === movesetCharacter.id ||
            character.id === `ui_chara_${movesetCharacter.id}`,
        ) || cssCharacters[0];
      const suggestedNameId = this.getUniqueCssNameId(
        `${movesetCharacter.id}_moveset`,
      );
      const sourceOptions = cssCharacters
        .map(
          (character) => `
<option value="${this.escapeHtml(character.id)}" ${character.id === preferredSource?.id ? 'selected' : ''}>
${this.escapeHtml(character.displayName)} (${this.escapeHtml(character.id)})
</option>`,
        )
        .join('');

      const modal = document.createElement('div');
      modal.className =
        'character-modal-overlay character-css-add-moveset-modal-overlay';
      modal.innerHTML = `
<div class="character-modal character-css-duplicate-modal">
<div class="character-modal-header">
<h2>Add ${this.escapeHtml(movesetCharacter.info.name)} to CSS</h2>
<button class="character-modal-close" type="button">
<i class="bi bi-x-lg"></i>
</button>
</div>
<form class="character-modal-body character-css-duplicate-form">
<label class="character-css-field">
<span>Duplicate CSS Character</span>
<select name="sourceCharacterId">${sourceOptions}</select>
</label>
<label class="character-css-field">
<span>New Character ID</span>
<input name="newUiCharaId" value="ui_chara_${this.escapeHtml(suggestedNameId)}" autocomplete="off">
</label>
<label class="character-css-field">
<span>New Name ID</span>
<input name="newNameId" value="${this.escapeHtml(suggestedNameId)}" autocomplete="off">
</label>
<label class="character-css-field">
<span>Display Name</span>
<input name="newDisplayName" value="${this.escapeHtml(movesetCharacter.info.name)}" autocomplete="off">
</label>
<div class="character-css-duplicate-error" hidden></div>
<div class="character-css-duplicate-actions">
<button class="input-btn" type="button" data-action="cancel">Cancel</button>
<button class="input-btn character-css-save-btn" type="submit">
<i class="bi bi-plus-square"></i>
Add to CSS
</button>
</div>
</form>
</div>
`;

      document.body.appendChild(modal);

      const form = modal.querySelector<HTMLFormElement>(
        '.character-css-duplicate-form',
      )!;
      const errorEl = modal.querySelector<HTMLElement>(
        '.character-css-duplicate-error',
      )!;
      const close = (
        value: {
          sourceCharacterId: string;
          newUiCharaId: string;
          newNameId: string;
          newDisplayName: string;
        } | null,
      ) => {
        this.closeCharacterModal(modal);
        resolve(value);
      };

      modal
        .querySelector<HTMLElement>('.character-modal-close')
        ?.addEventListener('click', () => close(null));
      modal
        .querySelector<HTMLElement>('[data-action="cancel"]')
        ?.addEventListener('click', () => close(null));
      this.bindBackdropClose(modal, () => close(null));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const sourceCharacterId = String(
          data.get('sourceCharacterId') || '',
        ).trim();
        const newUiCharaId = String(data.get('newUiCharaId') || '').trim();
        const newNameId = String(data.get('newNameId') || '').trim();
        const newDisplayName = String(data.get('newDisplayName') || '').trim();

        if (!sourceCharacterId) {
          errorEl.textContent = 'Choose the CSS character to duplicate.';
          errorEl.hidden = false;
          return;
        }

        if (!newUiCharaId.startsWith('ui_chara_')) {
          errorEl.textContent = 'Character ID must start with ui_chara_.';
          errorEl.hidden = false;
          return;
        }

        if (!newNameId) {
          errorEl.textContent = 'Name ID cannot be empty.';
          errorEl.hidden = false;
          return;
        }

        close({
          sourceCharacterId,
          newUiCharaId,
          newNameId,
          newDisplayName: newDisplayName || newNameId,
        });
      });

      form
        .querySelector<HTMLSelectElement>('select[name="sourceCharacterId"]')
        ?.focus();
    });
  }

  getUniqueCssNameId(baseNameId: string) {
    const usedIds = new Set(
      [...this.cssVisibleCharacters, ...this.cssHiddenCharacters].flatMap(
        (character) => [
          character.nameId,
          character.id.replace(/^ui_chara_/, ''),
        ],
      ),
    );
    const normalizedBase =
      baseNameId
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'moveset';

    let candidate = normalizedBase;
    let suffix = 2;
    while (usedIds.has(candidate) || usedIds.has(`ui_chara_${candidate}`)) {
      candidate = `${normalizedBase}_${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async openCssEditor() {
    const browserView = document.querySelector<HTMLElement>(
      '#characters-browser-view',
    );
    const cssEditor = document.querySelector<HTMLElement>(
      '#character-css-editor',
    );

    if (!browserView || !cssEditor) {
      return;
    }

    this.switchCharacterView(
      this.getActiveCharacterSubview(),
      cssEditor,
      'forward',
    );

    if (!this.cssLoaded) {
      await this.loadCssLayout();
      return;
    }

    this.renderCssEditor();
  }

  closeCssEditor() {
    const browserView = document.querySelector<HTMLElement>(
      '#characters-browser-view',
    );
    const cssEditor = document.querySelector<HTMLElement>(
      '#character-css-editor',
    );

    if (browserView && cssEditor) {
      this.switchCharacterView(cssEditor, browserView, 'back');
    }
  }

  async loadCssLayout() {
    const grid = document.querySelector<HTMLElement>('#character-css-grid');
    if (grid) {
      grid.innerHTML = `<div class="characters-empty-state">Loading CSS layout...</div>`;
    }

    try {
      if (this.cssPrefetchPromise) {
        await this.cssPrefetchPromise;
      }

      let result = this.cssPrefetchedLayout;
      if (result) {
        this.cssPrefetchedLayout = null;
      } else {
        result = await window.electronAPI.getCharacterCssLayout();
      }
      if (!result.success) {
        throw new Error(result.error || 'Failed to load character CSS layout');
      }

      this.cssVisibleCharacters = result.visibleCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssHiddenCharacters = result.hiddenCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      this.cssSelectedCharacterId =
        this.cssVisibleCharacters.find((character) => !character.isRandom)
          ?.id ||
        this.cssVisibleCharacters[0]?.id ||
        null;
      this.cssLoaded = true;
      this.cssDirty = false;
      this.renderCssEditor();
    } catch (error) {
      console.error('[CharactersManager] Failed to load CSS layout:', error);
      if (grid) {
        const message = error.message || 'Failed to load CSS layout';
        if (message.includes('ui_chara_db.json') || message.includes('msg_name')) {
          grid.innerHTML = '';
          this.renderCharacterCssSourceImport();
          return;
        } else {
          grid.innerHTML = `<div class="characters-empty-state is-error">${this.escapeHtml(message)}</div>`;
        }
      }
      window.toastManager?.error('toasts.failedToLoadCharacters', 4000, {
        error: error.message || 'Unknown error',
      });
    }
  }

  renderCharacterCssSourceImport() {
    const grid = document.querySelector<HTMLElement>('#character-css-grid');
    const inspector = document.querySelector<HTMLElement>('#character-css-inspector');
    const saveButton = document.querySelector<HTMLButtonElement>('#character-css-save-btn');
    const hiddenButton = document.querySelector<HTMLButtonElement>('#character-css-hidden-btn');
    const changeSourceButton = document.querySelector<HTMLButtonElement>('#character-css-change-source-btn');
    const randomizeButton = document.querySelector<HTMLButtonElement>('#character-css-randomize-btn');
    const previewButton = document.querySelector<HTMLButtonElement>('#character-css-preview-btn');
    const prcName = this.cssSourcePrcPath
      ? this.cssSourcePrcPath.split(/[\\/]/).pop()
      : this.t('characters.cssSourceMissing', 'Not selected');
    const layoutName = this.cssSourceLayoutPath
      ? this.cssSourceLayoutPath.split(/[\\/]/).pop()
      : this.t('characters.cssSourceMissing', 'Not selected');
    const msbtName = this.cssSourceMsbtPath
      ? this.cssSourceMsbtPath.split(/[\\/]/).pop()
      : this.t('characters.cssSourceMissing', 'Not selected');
    const canImport =
      Boolean(
        this.cssSourcePrcPath &&
          this.cssSourceLayoutPath &&
          this.cssSourceMsbtPath,
      ) &&
      !this.cssSourceImporting;

    if (grid) {
      grid.innerHTML = `
<div class="characters-empty-state character-css-source-import">
  <i class="bi bi-folder2-open"></i>
  <h3>${this.escapeHtml(this.t('characters.cssSourceRequiredTitle', 'Character CSS source required'))}</h3>
  <div class="character-css-source-row">
    <span>PRC</span>
    <code>${this.escapeHtml(prcName || '')}</code>
    <button type="button" class="input-btn" data-css-source="prc">
      <i class="bi bi-file-earmark-code"></i>
      <span>${this.escapeHtml(this.t('characters.selectCssPrc', 'Select ui_chara_db.prc'))}</span>
    </button>
  </div>
  <div class="character-css-source-row">
    <span>LAYOUT</span>
    <code>${this.escapeHtml(layoutName || '')}</code>
    <button type="button" class="input-btn" data-css-source="layout">
      <i class="bi bi-file-earmark-code"></i>
      <span>${this.escapeHtml(this.t('characters.selectCssLayoutPrc', 'Select ui_layout_db.prc'))}</span>
    </button>
  </div>
  <div class="character-css-source-row">
    <span>MSBT</span>
    <code>${this.escapeHtml(msbtName || '')}</code>
    <button type="button" class="input-btn" data-css-source="msbt">
      <i class="bi bi-file-earmark-text"></i>
      <span>${this.escapeHtml(this.t('characters.selectCssMsbt', 'Select msg_name.msbt'))}</span>
    </button>
  </div>
  <button type="button" class="input-btn character-css-save-btn" id="character-css-import-source-btn" ${canImport ? '' : 'disabled'}>
    <i class="bi bi-check2-circle"></i>
    <span>${this.escapeHtml(this.cssSourceImporting ? this.t('characters.importingCssSource', 'Importing...') : this.t('characters.importCssSource', 'Import source files'))}</span>
  </button>
</div>
`;
      grid
        .querySelectorAll<HTMLButtonElement>('[data-css-source]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            const sourceKind = button.dataset.cssSource;
            void this.selectCharacterCssSourceFile(
              sourceKind === 'msbt'
                ? 'msbt'
                : sourceKind === 'layout'
                  ? 'layout'
                  : 'prc',
            );
          });
        });
      grid
        .querySelector<HTMLButtonElement>('#character-css-import-source-btn')
        ?.addEventListener('click', () => {
          void this.importCharacterCssSourceFiles();
        });
    }

    if (inspector) {
      inspector.innerHTML = `
<div class="character-css-inspector-empty">
  <i class="bi bi-file-earmark-code"></i>
  <span>${this.escapeHtml(this.t('characters.cssSourceInspectorHint', 'Select PRC and MSBT to edit CSS.'))}</span>
</div>
`;
    }
    if (saveButton) saveButton.disabled = true;
    if (hiddenButton) hiddenButton.disabled = true;
    if (changeSourceButton) changeSourceButton.disabled = this.cssSourceImporting;
    if (randomizeButton) randomizeButton.disabled = true;
    if (previewButton) previewButton.disabled = true;
  }

  openCharacterCssSourceImport() {
    if (this.cssSaving || this.cssSourceImporting) {
      return;
    }

    if (this.cssDirty) {
      const confirmed = window.confirm(
        this.t(
          'characters.changeCssSourceConfirm',
          'Replace the current Character CSS source files? Unsaved layout changes will be lost.',
        ),
      );
      if (!confirmed) {
        return;
      }
    }

    this.cssPrefetchedLayout = null;
    this.cssVisibleCharacters = [];
    this.cssHiddenCharacters = [];
    this.cssRenamedCharacters.clear();
    this.cssCharacterUpdates.clear();
    this.cssSelectedCharacterId = null;
    this.cssSelectedSlotIndex = 0;
    this.cssLoaded = false;
    this.cssDirty = false;
    this.cssSourcePrcPath = null;
    this.cssSourceLayoutPath = null;
    this.cssSourceMsbtPath = null;
    this.renderCharacterCssSourceImport();
  }

  async selectCharacterCssSourceFile(sourceKind: 'prc' | 'layout' | 'msbt') {
    try {
      const result = await window.electronAPI.selectCharacterCssSourceFile(sourceKind);
      if (!result.success) {
        return;
      }

      if (sourceKind === 'prc') {
        this.cssSourcePrcPath = result.filePath;
      } else if (sourceKind === 'layout') {
        this.cssSourceLayoutPath = result.filePath;
      } else {
        this.cssSourceMsbtPath = result.filePath;
      }
      this.renderCharacterCssSourceImport();
    } catch (error) {
      window.toastManager?.error('toasts.failedToSelectFile', 3000);
    }
  }

  async importCharacterCssSourceFiles() {
    if (
      !this.cssSourcePrcPath ||
      !this.cssSourceLayoutPath ||
      !this.cssSourceMsbtPath ||
      this.cssSourceImporting
    ) {
      return;
    }

    this.cssSourceImporting = true;
    this.renderCharacterCssSourceImport();

    try {
      const result = await window.electronAPI.importCharacterCssSourceFiles({
        prcPath: this.cssSourcePrcPath,
        layoutPrcPath: this.cssSourceLayoutPath,
        msgNamePath: this.cssSourceMsbtPath,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to import Character CSS source files');
      }

      this.cssPrefetchedLayout = null;
      this.cssVisibleCharacters = result.visibleCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssHiddenCharacters = result.hiddenCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      this.cssSelectedCharacterId =
        this.cssVisibleCharacters.find((character) => !character.isRandom)
          ?.id ||
        this.cssVisibleCharacters[0]?.id ||
        null;
      this.cssLoaded = true;
      this.cssDirty = false;
      this.cssSourcePrcPath = null;
      this.cssSourceLayoutPath = null;
      this.cssSourceMsbtPath = null;
      this.cssSourceImporting = false;
      this.renderCssEditor();
      window.toastManager?.success('toasts.characterCssSourceImported', 3000);
    } catch (error) {
      window.toastManager?.error('toasts.failedToLoadCharacters', 4000, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.cssSourceImporting = false;
      if (!this.cssLoaded) {
        this.renderCharacterCssSourceImport();
      }
    }
  }

  hydrateCssCharacter(character: CharacterCssEntry) {
    const info = window.SSBU_CHARACTERS?.[character.nameId];
    return {
      ...character,
      displayName: character.displayName || info?.name || character.nameId,
      number: info?.number || character.number || '',
      imageUrl: this.getCssCharacterImage(character.nameId),
    };
  }

  getCssCharacterImage(nameId: string) {
    const knownCssImageIds = new Set([
      ...Object.keys(window.SSBU_CHARACTERS || {}),
      'random',
      'miiall',
    ]);
    const imageNameMap: Record<string, string> = {
      eflame: 'eflame_first',
      elight: 'elight_first',
    };
    if (!knownCssImageIds.has(nameId)) {
      return null;
    }

    const imageName = imageNameMap[nameId] || nameId;
    return `../../assets/images/character-css/chara_7_${imageName}_00.png`;
  }

  renderCssEditor() {
    const grid = document.querySelector<HTMLElement>('#character-css-grid');
    if (!grid) {
      return;
    }

    grid.innerHTML = '';
    this.cssVisibleCharacters.forEach((character) => {
      grid.appendChild(this.createCssCharacterCell(character));
    });
    this.renderCssInspector();

    const visibleCount = document.querySelector<HTMLElement>(
      '#character-css-visible-count',
    );
    const hiddenCount = document.querySelector<HTMLElement>(
      '#character-css-hidden-count',
    );
    const hiddenButton = document.querySelector<HTMLButtonElement>(
      '#character-css-hidden-btn',
    );
    const changeSourceButton = document.querySelector<HTMLButtonElement>(
      '#character-css-change-source-btn',
    );
    const randomizeButton = document.querySelector<HTMLButtonElement>(
      '#character-css-randomize-btn',
    );
    const previewButton = document.querySelector<HTMLButtonElement>(
      '#character-css-preview-btn',
    );
    const saveButton = document.querySelector<HTMLButtonElement>(
      '#character-css-save-btn',
    );

    if (visibleCount) {
      visibleCount.textContent = String(this.cssVisibleCharacters.length);
    }
    if (hiddenCount) {
      hiddenCount.textContent = `${this.cssHiddenCharacters.length} hidden`;
    }
    if (hiddenButton) {
      hiddenButton.disabled =
        this.cssHiddenCharacters.length === 0 || this.cssSaving;
    }
    if (changeSourceButton) {
      changeSourceButton.disabled = this.cssSaving || this.cssSourceImporting;
    }
    if (randomizeButton) {
      randomizeButton.disabled = this.cssSaving;
    }
    if (previewButton) {
      previewButton.disabled =
        this.cssSaving || this.cssVisibleCharacters.length === 0;
    }
    if (saveButton) {
      saveButton.disabled = this.cssSaving;
      saveButton.classList.toggle('is-loading', this.cssSaving);
      const label = saveButton.querySelector('span');
      if (label) {
        label.textContent = this.cssSaving ? 'Applying...' : 'Apply Layout';
      }
    }
  }

  createCssCharacterCell(character: CharacterCssEntry) {
    const cell = document.createElement('div');
    cell.className = 'character-css-cell';
    if (character.id === this.cssSelectedCharacterId) {
      cell.classList.add('is-selected');
    }
    cell.draggable = true;
    cell.dataset.characterId = character.id;

    const escapedName = this.escapeHtml(character.displayName);
    const imageMarkup = character.imageUrl
      ? `<img src="${character.imageUrl}" alt="${escapedName}" class="character-css-image" onerror="this.hidden=true; this.nextElementSibling.hidden=false;">`
      : '';

    cell.innerHTML = `
<div class="character-css-image-frame">
${imageMarkup}
<div class="character-css-placeholder" ${character.imageUrl ? 'hidden' : ''}>
<i class="bi bi-person-circle"></i>
</div>
</div>
<div class="character-css-name">${escapedName}</div>
${character.number ? `<span class="character-css-number">#${this.escapeHtml(character.number)}</span>` : ''}
<button class="character-css-hide-btn" type="button" title="Hide">
<i class="bi bi-eye-slash"></i>
</button>
`;

    const hideButton = cell.querySelector<HTMLButtonElement>(
      '.character-css-hide-btn',
    );
    hideButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hideCssCharacter(character.id);
    });

    return cell;
  }

  selectCssCharacter(characterId: string) {
    if (!this.findCssCharacter(characterId)) {
      return;
    }

    this.cssSelectedCharacterId = characterId;
    this.cssSelectedSlotIndex = 0;
    this.renderCssEditor();
  }

  renderCssInspector() {
    const inspector = document.querySelector<HTMLElement>(
      '#character-css-inspector',
    );
    if (!inspector) {
      return;
    }

    const character = this.cssSelectedCharacterId
      ? this.findCssCharacter(this.cssSelectedCharacterId)
      : null;

    if (!character) {
      inspector.innerHTML = `
<div class="character-css-inspector-empty">
<i class="bi bi-cursor"></i>
<strong>Select a character</strong>
<span>Edit PRC data, names and slot labels from here.</span>
</div>
`;
      return;
    }

    const slot =
      character.slots[this.cssSelectedSlotIndex] || character.slots[0];
    const escapedName = this.escapeHtml(character.displayName);
    const tabButton = (mode: 'prc' | 'msbt', label: string) => `
<button class="character-css-tab ${this.cssPanelMode === mode ? 'is-active' : ''}" type="button" data-css-panel-mode="${mode}">
${label}
</button>`;

    inspector.innerHTML = `
<div class="character-css-inspector-header">
<div class="character-css-inspector-thumb">
${character.imageUrl ? `<img src="${character.imageUrl}" alt="${escapedName}">` : '<i class="bi bi-person-circle"></i>'}
</div>
<div>
<strong>${escapedName}</strong>
<span>${this.escapeHtml(character.id)}</span>
</div>
</div>
<div class="character-css-inspector-actions">
<button class="input-btn" type="button" data-css-action="duplicate-character">
<i class="bi bi-copy"></i>
Duplicate
</button>
<button class="input-btn character-css-danger-btn" type="button" data-css-action="remove-character">
<i class="bi bi-trash3"></i>
Remove
</button>
</div>
<div class="character-css-tabs">
${tabButton('prc', 'PRC Data')}
${tabButton('msbt', 'MSBT Names')}
</div>
${this.cssPanelMode === 'prc' ? this.renderCssPrcPanel(character) : this.renderCssMsbtPanel(character, slot)}
`;

    inspector
      .querySelectorAll<HTMLButtonElement>('[data-css-panel-mode]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          this.cssPanelMode = button.dataset.cssPanelMode as 'prc' | 'msbt';
          this.renderCssInspector();
        });
      });

    inspector
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('[data-css-field]')
      .forEach((field) => {
        field.addEventListener('input', () => {
          this.updateSelectedCssCharacterFromInspector(field);
        });
        field.addEventListener('change', () => {
          this.updateSelectedCssCharacterFromInspector(field);
        });
      });

    inspector
      .querySelector<HTMLButtonElement>(
        '[data-css-action="duplicate-character"]',
      )
      ?.addEventListener('click', () => {
        void this.duplicateSelectedCssCharacter();
      });
    inspector
      .querySelector<HTMLButtonElement>('[data-css-action="remove-character"]')
      ?.addEventListener('click', () => {
        void this.removeSelectedCssCharacter();
      });
  }

  renderCssPrcPanel(character: CharacterCssEntry) {
    const field = (
      label: string,
      key: string,
      value: string,
      type = 'text',
    ) => `
<label class="character-css-field">
<span>${label}</span>
<input type="${type}" data-css-field="${key}" value="${this.escapeHtml(value)}">
</label>`;
    const checkbox = (label: string, key: string, value: boolean) => `
<label class="character-css-check">
<input type="checkbox" data-css-field="${key}" ${value ? 'checked' : ''}>
<span>${label}</span>
</label>`;

    return `
<div class="character-css-form">
${field('Character ID', 'uiCharaId', character.id)}
${field('CSS Display Name', 'displayName', character.displayName)}
${field('Series ID', 'uiSeriesId', character.uiSeriesId)}
${field('Name ID', 'nameId', character.nameId)}
${field('Fighter Kind', 'fighterKind', character.fighterKind)}
${field('Fighter Kind Corps', 'fighterKindCorps', character.fighterKindCorps)}
${field('Echo Fighter', 'altCharaId', character.altCharaId)}
${field('Fighter Type', 'fighterType', character.fighterType)}
<div class="character-css-form-grid">
${field('Exhibit Year', 'exhibitYear', character.exhibitYear, 'number')}
${field('Colors', 'colorNum', character.colorNum, 'number')}
${field('Color Start', 'colorStartIndex', character.colorStartIndex, 'number')}
</div>
<div class="character-css-check-grid">
${checkbox('Can Select', 'canSelect', character.canSelect)}
${checkbox('Is Mii', 'isMii', character.isMii)}
${checkbox('Is Boss', 'isBoss', character.isBoss)}
${checkbox('Hidden Boss', 'isHiddenBoss', character.isHiddenBoss)}
</div>
</div>
`;
  }

  renderCssMsbtPanel(character: CharacterCssEntry, slot: CharacterCssSlot) {
    const slotOptions = character.slots
      .map(
        (entry) =>
          `<option value="${entry.slotIndex}" ${entry.slotIndex === slot.slotIndex ? 'selected' : ''}>Slot ${entry.slotIndex + 1}</option>`,
      )
      .join('');
    const field = (
      label: string,
      key: string,
      value: string,
      multiline = false,
    ) => `
<label class="character-css-field">
<span>${label}</span>
${
  multiline
    ? `<textarea data-css-field="${key}" rows="3">${this.escapeHtml(value)}</textarea>`
    : `<input type="text" data-css-field="${key}" value="${this.escapeHtml(value)}">`
}
</label>`;

    return `
<div class="character-css-form">
<label class="character-css-field">
<span>Selected Slot</span>
<select data-css-field="selectedSlot">${slotOptions}</select>
</label>
<div class="character-css-form-grid">
${field('cXX Index', 'cxxIndex', slot.cxxIndex)}
${field('nXX Index', 'nxxIndex', slot.nxxIndex)}
</div>
${field('characall_label', 'characallLabel', slot.characallLabel)}
${field('nam_chr0', 'namChr0', slot.namChr0, true)}
${field('nam_chr1', 'namChr1', slot.namChr1 || character.displayName, true)}
${field('nam_chr2', 'namChr2', slot.namChr2, true)}
${field('nam_chr3', 'namChr3', slot.namChr3, true)}
${field('nam_stage_name', 'namStageName', slot.namStageName, true)}
</div>
`;
  }

  findCssCharacter(characterId: string) {
    return (
      this.cssVisibleCharacters.find(
        (character) => character.id === characterId,
      ) ||
      this.cssHiddenCharacters.find(
        (character) => character.id === characterId,
      ) ||
      null
    );
  }

  setCssCharacterUpdate(characterId: string, key: string, value: any) {
    const currentUpdate = this.cssCharacterUpdates.get(characterId) || {};
    this.cssCharacterUpdates.set(characterId, {
      ...currentUpdate,
      [key]: value,
    });
    this.cssDirty = true;
  }

  setCssSlotUpdate(
    characterId: string,
    slotIndex: number,
    key: string,
    value: string,
  ) {
    const currentUpdate = this.cssCharacterUpdates.get(characterId) || {};
    const currentSlots = currentUpdate.slots || {};
    this.cssCharacterUpdates.set(characterId, {
      ...currentUpdate,
      slots: {
        ...currentSlots,
        [slotIndex]: {
          ...(currentSlots[slotIndex] || {}),
          [key]: value,
        },
      },
    });
    this.cssDirty = true;
  }

  updateSelectedCssCharacterFromInspector(
    field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) {
    if (!this.cssSelectedCharacterId) {
      return;
    }

    const character = this.findCssCharacter(this.cssSelectedCharacterId);
    if (!character) {
      return;
    }

    const key = field.dataset.cssField;
    if (!key) {
      return;
    }

    if (key === 'selectedSlot') {
      this.cssSelectedSlotIndex = Number(field.value);
      this.renderCssInspector();
      return;
    }

    const value =
      field instanceof HTMLInputElement && field.type === 'checkbox'
        ? field.checked
        : field.value;

    if (this.cssPanelMode === 'msbt') {
      const slot = character.slots[this.cssSelectedSlotIndex];
      if (!slot) {
        return;
      }

      (slot as any)[key] = String(value);
      this.setCssSlotUpdate(
        character.id,
        this.cssSelectedSlotIndex,
        key,
        String(value),
      );
      return;
    }

    if (key === 'displayName') {
      character.displayName = String(value);
      this.cssRenamedCharacters.set(character.nameId, String(value));
      this.cssDirty = true;
      return;
    }

    if (key === 'nameId') {
      character.nameId = String(value);
    } else if (key in character) {
      (character as any)[key] = value;
    }

    if (key === 'nameId' || key === 'uiCharaId') {
      this.setCssCharacterUpdate(character.id, key, String(value));
    } else {
      this.setCssCharacterUpdate(character.id, key, value);
    }
  }

  randomizeCssLayout() {
    if (this.cssSaving) {
      return;
    }

    const fixedCharacters = this.cssVisibleCharacters.filter(
      (character) => character.isRandom,
    );
    const shuffledCharacters = this.cssVisibleCharacters
      .filter((character) => !character.isRandom)
      .sort(() => Math.random() - 0.5);

    this.cssVisibleCharacters = [...fixedCharacters, ...shuffledCharacters];
    this.cssDirty = true;
    this.renderCssEditor();
  }

  async duplicateSelectedCssCharacter() {
    if (!this.cssSelectedCharacterId || this.cssSaving) {
      return;
    }

    const character = this.findCssCharacter(this.cssSelectedCharacterId);
    if (!character) {
      return;
    }

    const suggestedNameId = `${character.nameId}_copy`;
    const duplicateOptions = await this.openDuplicateCssCharacterModal(
      character,
      suggestedNameId,
    );
    if (!duplicateOptions) {
      return;
    }

    this.cssSaving = true;
    this.renderCssEditor();

    try {
      const result = await window.electronAPI.duplicateCharacterCssEntry({
        sourceCharacterId: character.id,
        newUiCharaId: duplicateOptions.newUiCharaId,
        newNameId: duplicateOptions.newNameId,
        newDisplayName: duplicateOptions.newDisplayName,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to duplicate character');
      }

      this.cssVisibleCharacters = result.visibleCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssHiddenCharacters = result.hiddenCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssSelectedCharacterId = duplicateOptions.newUiCharaId;
      this.cssSelectedSlotIndex = 0;
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      this.cssDirty = true;
      window.toastManager?.success?.(
        'Character duplicated. Apply Layout to generate the mod.',
        4000,
      );
    } catch (error) {
      console.error(
        '[CharactersManager] Failed to duplicate CSS character:',
        error,
      );
      window.toastManager?.error(
        `Failed to duplicate character: ${error.message || 'Unknown error'}`,
        5000,
      );
    } finally {
      this.cssSaving = false;
      this.renderCssEditor();
    }
  }

  openDuplicateCssCharacterModal(
    character: CharacterCssEntry,
    suggestedNameId: string,
  ): Promise<{
    newUiCharaId: string;
    newNameId: string;
    newDisplayName: string;
  } | null> {
    return new Promise((resolve) => {
      const existingModal = document.querySelector<HTMLElement>(
        '.character-css-duplicate-modal-overlay',
      );
      existingModal?.remove();

      const modal = document.createElement('div');
      modal.className =
        'character-modal-overlay character-css-duplicate-modal-overlay';
      modal.innerHTML = `
<div class="character-modal character-css-duplicate-modal">
<div class="character-modal-header">
<h2>Duplicate ${this.escapeHtml(character.displayName)}</h2>
<button class="character-modal-close" type="button">
<i class="bi bi-x-lg"></i>
</button>
</div>
<form class="character-modal-body character-css-duplicate-form">
<label class="character-css-field">
<span>New Character ID</span>
<input name="newUiCharaId" value="ui_chara_${this.escapeHtml(suggestedNameId)}" autocomplete="off">
</label>
<label class="character-css-field">
<span>New Name ID</span>
<input name="newNameId" value="${this.escapeHtml(suggestedNameId)}" autocomplete="off">
</label>
<label class="character-css-field">
<span>Display Name</span>
<input name="newDisplayName" value="${this.escapeHtml(`${character.displayName} Copy`)}" autocomplete="off">
</label>
<div class="character-css-duplicate-error" hidden></div>
<div class="character-css-duplicate-actions">
<button class="input-btn" type="button" data-action="cancel">Cancel</button>
<button class="input-btn character-css-save-btn" type="submit">
<i class="bi bi-copy"></i>
Duplicate
</button>
</div>
</form>
</div>
`;

      document.body.appendChild(modal);

      const form = modal.querySelector<HTMLFormElement>(
        '.character-css-duplicate-form',
      )!;
      const errorEl = modal.querySelector<HTMLElement>(
        '.character-css-duplicate-error',
      )!;
      const close = (
        value: {
          newUiCharaId: string;
          newNameId: string;
          newDisplayName: string;
        } | null,
      ) => {
        this.closeCharacterModal(modal);
        resolve(value);
      };

      modal
        .querySelector<HTMLElement>('.character-modal-close')
        ?.addEventListener('click', () => close(null));
      modal
        .querySelector<HTMLElement>('[data-action="cancel"]')
        ?.addEventListener('click', () => close(null));
      this.bindBackdropClose(modal, () => close(null));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const newUiCharaId = String(data.get('newUiCharaId') || '').trim();
        const newNameId = String(data.get('newNameId') || '').trim();
        const newDisplayName = String(data.get('newDisplayName') || '').trim();

        if (!newUiCharaId.startsWith('ui_chara_')) {
          errorEl.textContent = 'Character ID must start with ui_chara_.';
          errorEl.hidden = false;
          return;
        }

        if (!newNameId) {
          errorEl.textContent = 'Name ID cannot be empty.';
          errorEl.hidden = false;
          return;
        }

        close({
          newUiCharaId,
          newNameId,
          newDisplayName: newDisplayName || newNameId,
        });
      });

      form
        .querySelector<HTMLInputElement>('input[name="newUiCharaId"]')
        ?.focus();
    });
  }

  async removeSelectedCssCharacter() {
    if (!this.cssSelectedCharacterId || this.cssSaving) {
      return;
    }

    const character = this.findCssCharacter(this.cssSelectedCharacterId);
    if (!character) {
      return;
    }

    const confirmed = await this.openRemoveCssCharacterModal(character);
    if (!confirmed) {
      return;
    }

    this.cssSaving = true;
    this.renderCssEditor();

    try {
      const result = await window.electronAPI.removeCharacterCssEntry({
        characterId: character.id,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove character');
      }

      this.cssVisibleCharacters = result.visibleCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssHiddenCharacters = result.hiddenCharacters.map((entry) =>
        this.hydrateCssCharacter(entry),
      );
      this.cssSelectedCharacterId =
        this.cssVisibleCharacters[0]?.id ||
        this.cssHiddenCharacters[0]?.id ||
        null;
      this.cssSelectedSlotIndex = 0;
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      this.cssDirty = true;
      window.toastManager?.success?.(
        'Character removed. Apply Layout to generate the mod.',
        4000,
      );
    } catch (error) {
      console.error(
        '[CharactersManager] Failed to remove CSS character:',
        error,
      );
      window.toastManager?.error(
        `Failed to remove character: ${error.message || 'Unknown error'}`,
        5000,
      );
    } finally {
      this.cssSaving = false;
      this.renderCssEditor();
    }
  }

  openRemoveCssCharacterModal(character: CharacterCssEntry): Promise<boolean> {
    return new Promise((resolve) => {
      const existingModal = document.querySelector<HTMLElement>(
        '.character-css-remove-modal-overlay',
      );
      existingModal?.remove();

      const modal = document.createElement('div');
      modal.className =
        'character-modal-overlay character-css-remove-modal-overlay';
      modal.innerHTML = `
<div class="character-modal character-css-remove-modal">
<div class="character-modal-header">
<h2>Remove Character</h2>
<button class="character-modal-close" type="button">
<i class="bi bi-x-lg"></i>
</button>
</div>
<div class="character-modal-body character-css-remove-body">
<div class="character-css-remove-preview">
<div class="character-css-hidden-thumb">
${character.imageUrl ? `<img src="${character.imageUrl}" alt="${this.escapeHtml(character.displayName)}">` : '<i class="bi bi-person-circle"></i>'}
</div>
<div>
<strong>${this.escapeHtml(character.displayName)}</strong>
<span>${this.escapeHtml(character.id)}</span>
</div>
</div>
<p>This removes the entry from the generated Character CSS data. Apply Layout after removing to rebuild the mod.</p>
<div class="character-css-duplicate-actions">
<button class="input-btn" type="button" data-action="cancel">Cancel</button>
<button class="input-btn character-css-danger-btn" type="button" data-action="confirm-remove">
<i class="bi bi-trash3"></i>
Remove
</button>
</div>
</div>
</div>
`;

      document.body.appendChild(modal);

      const close = (value: boolean) => {
        this.closeCharacterModal(modal);
        resolve(value);
      };

      modal
        .querySelector<HTMLElement>('.character-modal-close')
        ?.addEventListener('click', () => close(false));
      modal
        .querySelector<HTMLElement>('[data-action="cancel"]')
        ?.addEventListener('click', () => close(false));
      modal
        .querySelector<HTMLElement>('[data-action="confirm-remove"]')
        ?.addEventListener('click', () => close(true));
      this.bindBackdropClose(modal, () => close(false));
    });
  }

  moveCssCharacter(sourceId: string, targetId: string) {
    if (sourceId === targetId || this.cssSaving) {
      return;
    }

    const sourceIndex = this.cssVisibleCharacters.findIndex(
      (character) => character.id === sourceId,
    );
    const targetIndex = this.cssVisibleCharacters.findIndex(
      (character) => character.id === targetId,
    );

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const [character] = this.cssVisibleCharacters.splice(sourceIndex, 1);
    this.cssVisibleCharacters.splice(targetIndex, 0, character);
    this.cssSelectedCharacterId = character.id;
    this.cssDirty = true;
    this.renderCssEditor();
  }

  hideCssCharacter(characterId: string) {
    if (this.cssSaving) {
      return;
    }

    const index = this.cssVisibleCharacters.findIndex(
      (character) => character.id === characterId,
    );
    if (index < 0) {
      return;
    }

    const [character] = this.cssVisibleCharacters.splice(index, 1);
    if (this.cssSelectedCharacterId === character.id) {
      this.cssSelectedCharacterId = this.cssVisibleCharacters[0]?.id || null;
    }
    this.cssHiddenCharacters = [...this.cssHiddenCharacters, character].sort(
      (left, right) => left.displayName.localeCompare(right.displayName),
    );
    this.cssDirty = true;
    this.renderCssEditor();
  }

  unhideCssCharacter(characterId: string) {
    if (this.cssSaving) {
      return;
    }

    const index = this.cssHiddenCharacters.findIndex(
      (character) => character.id === characterId,
    );
    if (index < 0) {
      return;
    }

    const [character] = this.cssHiddenCharacters.splice(index, 1);
    this.cssVisibleCharacters = [...this.cssVisibleCharacters, character];
    this.cssSelectedCharacterId = character.id;
    this.cssDirty = true;
    this.renderCssEditor();
  }

  openHiddenCssCharactersModal() {
    const existingModal = document.querySelector<HTMLElement>(
      '.character-css-hidden-modal-overlay',
    );
    existingModal?.remove();

    const modal = document.createElement('div');
    modal.className =
      'character-modal-overlay character-css-hidden-modal-overlay';
    modal.innerHTML = `
<div class="character-modal character-css-hidden-modal">
<div class="character-modal-header">
<h2>Hidden CSS Characters</h2>
<button class="character-modal-close" type="button">
<i class="bi bi-x-lg"></i>
</button>
</div>
<div class="character-modal-body">
<div class="character-css-hidden-list">
${
  this.cssHiddenCharacters
    .map((character) => {
      const imageUrl = character.imageUrl || '';
      return `
<div class="character-css-hidden-row" data-character-id="${this.escapeHtml(character.id)}">
<div class="character-css-hidden-thumb">
${imageUrl ? `<img src="${imageUrl}" alt="${this.escapeHtml(character.displayName)}">` : '<i class="bi bi-person-circle"></i>'}
</div>
<span>${this.escapeHtml(character.displayName)}</span>
<button class="input-btn" type="button" data-action="unhide-character">
<i class="bi bi-eye"></i>
Unhide
</button>
</div>
`;
    })
    .join('') ||
  '<div class="characters-empty-state">No hidden characters</div>'
}
</div>
</div>
</div>
`;

    document.body.appendChild(modal);

    const close = () => this.closeCharacterModal(modal);
    modal
      .querySelector<HTMLElement>('.character-modal-close')
      ?.addEventListener('click', close);
    this.bindBackdropClose(modal, close);
    modal
      .querySelectorAll<HTMLElement>('[data-action="unhide-character"]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const row = button.closest<HTMLElement>('.character-css-hidden-row');
          if (!row?.dataset.characterId) return;
          this.unhideCssCharacter(row.dataset.characterId);
          close();
        });
      });
  }

  openCssPreviewModal() {
    const existingModal = document.querySelector<HTMLElement>(
      '.character-css-preview-overlay',
    );
    existingModal?.remove();

    const modal = document.createElement('div');
    modal.className = 'character-css-preview-overlay';
    const visibleCharacters = this.cssVisibleCharacters;

    modal.innerHTML = `
<div class="character-css-preview-stage is-layout-only">
<button class="character-css-preview-close" type="button" title="Close">
<i class="bi bi-x-lg"></i>
</button>
<div class="character-css-preview-grid">
${visibleCharacters
  .map((character) => this.renderCssPreviewTile(character))
  .join('')}
</div>
</div>
`;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal
      .querySelector<HTMLElement>('.character-css-preview-close')
      ?.addEventListener('click', close);
    this.bindBackdropClose(modal, close);
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', escapeHandler);
        close();
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  renderCssPreviewTile(character: CharacterCssEntry) {
    const escapedName = this.escapeHtml(character.displayName);
    const image = character.imageUrl
      ? `<img src="${character.imageUrl}" alt="${escapedName}" onerror="this.hidden=true; this.nextElementSibling.hidden=false;">`
      : '';

    return `
<div class="character-css-preview-tile">
${image}
<div class="character-css-preview-placeholder" ${character.imageUrl ? 'hidden' : ''}>
<i class="bi bi-person-fill"></i>
</div>
<span class="character-css-preview-name">${escapedName.toUpperCase()}</span>
</div>
`;
  }

  async saveCssLayout() {
    if (this.cssSaving) {
      return;
    }

    this.cssSaving = true;
    this.renderCssEditor();

    try {
      const renamedCharacters = Object.fromEntries(this.cssRenamedCharacters);
      const result = await window.electronAPI.saveCharacterCssLayout({
        visibleCharacterIds: this.cssVisibleCharacters.map(
          (character) => character.id,
        ),
        hiddenCharacterIds: this.cssHiddenCharacters.map(
          (character) => character.id,
        ),
        renamedCharacters,
        characterUpdates: Object.fromEntries(this.cssCharacterUpdates),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save character CSS layout');
      }

      this.cssDirty = false;
      this.cssRenamedCharacters.clear();
      this.cssCharacterUpdates.clear();
      window.toastManager?.success?.('Character CSS Layout saved.', 3500);
      if (result.stderr?.includes('MSBT changes')) {
        window.toastManager?.warning?.(
          'Layout saved, but MSBT names need dotnet to be regenerated.',
          6000,
        );
      }
    } catch (error) {
      console.error('[CharactersManager] Failed to save CSS layout:', error);
      window.toastManager?.error(
        `Failed to save Character CSS Layout: ${error.message || 'Unknown error'}`,
        6000,
      );
    } finally {
      this.cssSaving = false;
      this.renderCssEditor();
    }
  }

  renderEmptyState() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) return;

    const gameBananaLink = this.gameBananaLink();

    container.innerHTML = `
<div class="characters-empty-state">
<i class="bi bi-people-fill"></i>
<h3>${this.t('characters.noCharacterMods', 'No Character Mods Found')}</h3>
<p>${this.t('characters.configureModsFolder', 'Configure your mods folder in Settings to see characters with mods.')}</p>
<span style="font-size: 13px; margin-top: 10px; color: var(--text-muted);">${this.t('characters.downloadOnGameBanana', `Go download some on ${gameBananaLink}!`, { site: gameBananaLink })}</span>
</div>
`;
  }

  async refresh() {
    console.log('Refreshing characters...');
    this.showLoading();
    this.characters.clear();
    this.movesetCharacters.clear();
    await this.scanMods();
    this.renderCharacters();
    this.renderMovesetTracker();
  }

  updateLoadingStatus(text: string) {
    const el = document.getElementById('characters-loading-status');
    if (el) {
      el.textContent = text;
    }
  }

  showLoading() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (container) {
      container.innerHTML = `
<div class="characters-loading">
<div id="characters-loading-lottie" style="width: 100px; height: 100px;"></div>
<p>Loading characters...</p>
<p id="characters-loading-status" style="font-size: 13px; color: var(--text-muted); margin-top: 8px;"></p>
</div>
`;
      const lottieContainer = document.getElementById(
        'characters-loading-lottie',
      );
      if (lottieContainer && window.lottie) {
        window.lottie.loadAnimation({
          container: lottieContainer,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '../../assets/images/loading.json',
        });
      }
    }
    this.updateCharacterCount(0);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.charactersManager = new CharactersManager();
  console.log('Characters Manager initialized globally');
}

export { type CharactersManager };
