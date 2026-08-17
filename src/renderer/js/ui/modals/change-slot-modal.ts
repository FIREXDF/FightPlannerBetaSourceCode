export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[change-slot-modal] ModalManagerClass not found'); return; }

  function slotStringToNumber(slot: string): number {
  return parseInt(slot.substring(1));
}

function slotNumberToString(slotNumber: number): string {
  return `c${slotNumber.toString().padStart(2, '0')}`;
}

function normalizeSlotInput(value: string): string | null {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^c?(\d{1,3})$/);
  if (!match) return null;

  const slotNumber = Number(match[1]);
  return slotNumber <= 255 ? slotNumberToString(slotNumber) : null;
}

function updateChangeSlotApplyState() {
  const modal = document.querySelector('#change-slot-modal');
  const applyButton = modal?.querySelector<HTMLButtonElement>(
    '#confirm-change-slots',
  );
  const hasInvalidInput = Boolean(
    modal?.querySelector(
      '.slot-item-content:not(.deleted) .slot-input[aria-invalid="true"]',
    ),
  );

  if (applyButton) applyButton.disabled = hasInvalidInput;
}

function translate(key: string, params: Record<string, unknown> = {}): string {
  return window.i18n?.t
    ? window.i18n.t(key, params as Record<string, string>)
    : key;
}

function countAffectedEntries(pathData, fighters: string[], slot: string): number {
  const entries = new Set<string>();

  for (const fighter of fighters) {
    const slotData = pathData?.[fighter]?.[slot];
    if (!slotData) continue;

    for (const entry of [
      ...(slotData.pathsToBeModified || []),
      ...(slotData.filesToBeModified || []),
    ]) {
      entries.add(`${entry.type}:${entry.original}`);
    }
  }

  return entries.size;
}

const MULTI_CHAR_FIGHTER_GROUPS: Record<
  string,
  { members: string[]; displayName: string }
> = {
  'ptrainer-group': {
    members: ['ptrainer', 'pzenigame', 'pfushigisou', 'plizardon'],
    displayName: 'Pokemon Trainer',
  },

  'element-group': {
    members: [
      'element',
      'eflame',
      'elight',
      'flame_first',
      'light_first',
      'flame_only',
      'light_only',
    ],
    displayName: 'Pyra/Mythra',
  },
};

function getFighterGroupId(fighterName: string): string | null {
  for (const [groupId, group] of Object.entries(MULTI_CHAR_FIGHTER_GROUPS)) {
    if (group.members.includes(fighterName)) {
      return groupId;
    }
  }

  return null;
}

function groupFighterNames(rawNames: string[]): string[] {
  const result: string[] = [];
  const groups = new Set<string>();

  for (const name of rawNames) {
    const groupId = getFighterGroupId(name);

    if (groupId) {
      if (!groups.has(groupId)) {
        groups.add(groupId);
        result.push(groupId);
      }
    } else {
      result.push(name);
    }
  }

  return result;
}

function getActualFighterNames(
  displayName: string,
  allRawNames: string[],
): string[] {
  const group = MULTI_CHAR_FIGHTER_GROUPS[displayName];

  if (group) {
    return allRawNames.filter((name) => group.members.includes(name));
  }

  return [displayName];
}

function getFighterDisplayName(fighterNameOrGroup: string): string {
  const group = MULTI_CHAR_FIGHTER_GROUPS[fighterNameOrGroup];

  if (group) {
    return group.displayName;
  }

  const resolvedFighterId = window.resolveFolderName
    ? window.resolveFolderName(fighterNameOrGroup)
    : fighterNameOrGroup.toLowerCase();

  const characterInfo = window.SSBU_CHARACTERS?.[resolvedFighterId];
  return characterInfo?.name || fighterNameOrGroup;
}

M.prototype.openChangeSlotModal = function (mod, modData, callback) {
  // Every opening is a new editing session. Do not carry deletions or slot
  // usage state over from the previously opened mod.
  this.deletedSlots = new Map();
  this.slotUsageByFighter = null;
  this.selectedFighterName = null;
  this.currentMod = mod;
  this.changeSlotCallback = callback;

  if (modData.fighterNames.length === 0) {
    throw new Error(
      'Cannot change slots for mods with no detected fighters.',
    );
  }

  this.rawFighterNames = modData.fighterNames;
  this.fighterNames = groupFighterNames(modData.fighterNames);

  this.slotAssignments = new Map();

  for (const fighterName of modData.fighterNames) {
    const fighterSlots = Object.keys(modData.pathData[fighterName] || {});
    const assignments = new Map();

    for (const slot of fighterSlots) {
      assignments.set(slot, slot);
    }

    this.slotAssignments.set(fighterName, assignments);
  }

  this.pathData = modData.pathData;

  const modal = document.querySelector<HTMLElement>('#change-slot-modal');
  const container = document.querySelector<HTMLElement>('#slot-list-container');

  if (modal && container) {
    modal.classList.remove('closing');

    const modalHeader = modal.querySelector<HTMLElement>('.modal-header');
    const modalTitle = modalHeader?.querySelector<HTMLElement>('h3');

    if (modalTitle && modalHeader) {
      modalTitle.textContent = mod.name;

      const existingSubtitle = modalHeader.querySelector('.modal-subtitle');
      if (existingSubtitle) {
        existingSubtitle.remove();
      }

      let contentDiv = modalHeader.querySelector<HTMLElement>(
        '.modal-header-content',
      );

      if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.className = 'modal-header-content';

        const closeButton = modalHeader.querySelector('.modal-close');
        if (closeButton) {
          modalHeader.insertBefore(contentDiv, closeButton);
        } else {
          modalHeader.appendChild(contentDiv);
        }

        contentDiv.appendChild(modalTitle);
      }
    }

    this.selectedFighterName = this.fighterNames[0];

    this._renderFighterTabs();
    this._renderSlotList();

    this._renderSlotUsageLoading();

    this._scanAllModsSlotUsage().then(() => {
      this._renderSlotUsageForSelectedFighter();
      this._updateFighterTabConflicts();
    });

    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }
  }
};

M.prototype.closeChangeSlotModal = function () {
  this.closeModal('change-slot-modal');

  const modal = document.querySelector<HTMLElement>('#change-slot-modal');
  if (modal) {
    modal.inert = false;
    modal.removeAttribute('aria-hidden');
  }
  const modalHeader = modal?.querySelector<HTMLElement>('.modal-header');
  const contentDiv = modalHeader?.querySelector<HTMLElement>(
    '.modal-header-content',
  );
  const modalTitle = modalHeader?.querySelector<HTMLElement>('h3');

  if (modalTitle) {
    modalTitle.textContent = 'Change Character Slot';
  }

  if (contentDiv && modalTitle && modalHeader) {
    modalHeader.insertBefore(modalTitle, contentDiv);
    contentDiv.remove();
  }

  document.querySelectorAll('.slot-usage-tooltip').forEach((tooltip) => {
    tooltip.remove();
  });

  const slotUsageHint = document.querySelector('#slot-usage-hint');
  const slotUsageOverview = document.querySelector('#slot-usage-overview');
  const fighterTabs = document.querySelector('#fighter-tabs-wrapper');

  if (slotUsageHint) slotUsageHint.remove();
  if (slotUsageOverview) slotUsageOverview.remove();
  if (fighterTabs) fighterTabs.remove();

  this.changeSlotCallback = null;
  this.slotAssignments = new Map();
  this.deletedSlots = new Map();
  this.fighterNames = [];
  this.rawFighterNames = [];
  this.selectedFighterName = null;
  this.slotUsageByFighter = null;
  this.currentMod = null;
  this.pathData = {};
};

M.prototype._renderSlotUsageLoading = function () {
  const modalBody = document.querySelector('#change-slot-modal .modal-body');
  const hintParagraph = document.querySelector('#slot-modal-hint');

  if (!modalBody || !hintParagraph) return;

  const slotUsageHint = document.createElement('p');
  slotUsageHint.id = 'slot-usage-hint';
  slotUsageHint.className = 'modal-hint';
  slotUsageHint.textContent = 'Slot Usage:';
  modalBody.insertBefore(slotUsageHint, hintParagraph);

  const loadingContainer = document.createElement('div');
  loadingContainer.id = 'slot-usage-overview';
  loadingContainer.className = 'slot-usage-overview slot-usage-loading';

  const spinner = document.createElement('div');
  spinner.className = 'slot-usage-spinner';
  spinner.innerHTML = '<i class="bi bi-arrow-repeat"></i>';

  loadingContainer.appendChild(spinner);
  modalBody.insertBefore(loadingContainer, hintParagraph);
};

M.prototype._renderFighterTabs = function () {
  const modalBody = document.querySelector('#change-slot-modal .modal-body');
  if (!modalBody) return;

  const existingTabs = document.querySelector('#fighter-tabs-wrapper');
  if (existingTabs) existingTabs.remove();

  const tabsWrapper = document.createElement('div');
  tabsWrapper.id = 'fighter-tabs-wrapper';
  tabsWrapper.className = 'slot-usage-fighter-tabs-wrapper';

  const tabsContainer = document.createElement('div');
  tabsContainer.id = 'fighter-tabs';
  tabsContainer.className = 'slot-usage-fighter-tabs';

  this.fighterNames.forEach((fighterName) => {
    const characterName = getFighterDisplayName(fighterName);

    const tab = document.createElement('button');
    tab.className = 'slot-usage-fighter-tab';
    tab.textContent = characterName;
    tab.dataset.fighter = fighterName;

    if (fighterName === this.selectedFighterName) {
      tab.classList.add('active');
    }

    tab.addEventListener('click', () => {
      this._selectFighter(fighterName);
    });

    tabsContainer.appendChild(tab);
  });

  tabsWrapper.appendChild(tabsContainer);

  const updateFadeMasks = () => {
    const { scrollLeft, scrollWidth, clientWidth } = tabsContainer;
    const canScrollLeft = scrollLeft > 1;
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

    tabsWrapper.classList.toggle('fade-left', canScrollLeft);
    tabsWrapper.classList.toggle('fade-right', canScrollRight);
  };

  tabsContainer.addEventListener('scroll', updateFadeMasks);
  requestAnimationFrame(updateFadeMasks);

  modalBody.insertBefore(tabsWrapper, modalBody.firstChild);

  let scrollVelocity = 0;
  let scrollAnimationId: number | null = null;

  const animateScroll = () => {
    tabsContainer.scrollLeft += scrollVelocity;
    scrollVelocity *= 0.85;

    if (Math.abs(scrollVelocity) > 0.5) {
      scrollAnimationId = requestAnimationFrame(animateScroll);
    } else {
      scrollVelocity = 0;
      scrollAnimationId = null;
    }
  };

  tabsContainer.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        scrollVelocity += e.deltaY * 0.5;

        if (scrollAnimationId === null) {
          scrollAnimationId = requestAnimationFrame(animateScroll);
        }
      }
    },
    { passive: false },
  );
};

M.prototype._selectFighter = function (fighterName) {
  this.selectedFighterName = fighterName;

  const tabsContainer = document.querySelector('#fighter-tabs');

  if (tabsContainer) {
    tabsContainer
      .querySelectorAll<HTMLElement>('.slot-usage-fighter-tab')
      .forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.fighter === fighterName);
      });
  }

  document.querySelectorAll('.slot-usage-tooltip').forEach((tooltip) => {
    tooltip.remove();
  });

  if (this.slotUsageByFighter) {
    this._renderSlotUsageForSelectedFighter();
  }

  this._renderSlotList();
};

M.prototype._renderSlotUsageForSelectedFighter = function () {
  if (
    !this.slotUsageByFighter ||
    !this.selectedFighterName ||
    !this.currentMod
  ) {
    return;
  }

  const fighterGroup = getActualFighterNames(
    this.selectedFighterName,
    this.rawFighterNames,
  );

  const mergedSlotUsage = new Map();

  for (const fighter of fighterGroup) {
    const fighterUsage = this.slotUsageByFighter.get(fighter);

    if (!fighterUsage) continue;

    for (const [slot, usage] of fighterUsage) {
      if (!mergedSlotUsage.has(slot)) {
        mergedSlotUsage.set(slot, { mods: [] });
      }

      const existing = mergedSlotUsage.get(slot)!;

      for (const mod of usage.mods) {
        const existingMod = existing.mods.find((m) => m.path === mod.path);

        if (existingMod) {
          for (const file of mod.files) {
            if (!existingMod.files.includes(file)) {
              existingMod.files.push(file);
            }
          }
        } else {
          existing.mods.push({ ...mod, files: [...mod.files] });
        }
      }
    }
  }

  this._renderSlotUsageOverview(mergedSlotUsage, this.currentMod.path);
};

M.prototype._updateFighterTabConflicts = function () {
  if (!this.slotUsageByFighter || !this.currentMod) return;

  const currentModPath = this.currentMod.path;
  const tabs = document.querySelectorAll<HTMLElement>(
    '.slot-usage-fighter-tab',
  );

  for (const tab of tabs) {
    const fighterName = tab.dataset.fighter;
    if (!fighterName) continue;

    const actualFighters = getActualFighterNames(
      fighterName,
      this.rawFighterNames,
    );

    let hasConflict = false;

    for (const fighter of actualFighters) {
      const fighterUsage = this.slotUsageByFighter.get(fighter);
      if (!fighterUsage) continue;

      for (const [, usage] of fighterUsage) {
        if (usage.mods.length < 2) continue;

        const currentModFiles = usage.mods
          .filter((m) => m.path === currentModPath)
          .flatMap((m) => m.files);

        if (currentModFiles.length === 0) continue;

        const currentFileSet = new Set(currentModFiles);
        const otherMods = usage.mods.filter((m) => m.path !== currentModPath);

        for (const other of otherMods) {
          if (other.files.some((f) => currentFileSet.has(f))) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) break;
      }

      if (hasConflict) break;
    }

    tab.classList.toggle('tab-conflict', hasConflict);
  }
};

M.prototype._scanAllModsSlotUsage = async function () {
  this.slotUsageByFighter = new Map();

  for (const fighterName of this.rawFighterNames) {
    this.slotUsageByFighter.set(fighterName, new Map());
  }

  if (!window.modManager || !window.modManager.mods) {
    return;
  }

  // Conflict-status mods are still installed and occupy their slots.
  const activeMods = window.modManager.mods.filter(
    (m) => m.status !== 'disabled' && m.path,
  );

  for (const mod of activeMods) {
    if (!mod.path || !window.electronAPI?.scanMod) continue;

    try {
      const scanResult = await window.electronAPI.scanMod(mod.path);
      if (!scanResult.success) continue;

      const modEntry = { name: mod.name, path: mod.path };

      for (const fighterName of this.rawFighterNames) {
        // Item folder names may use different casing between mods. Match their
        // scanner keys case-insensitively so slot usage still aggregates them.
        const scannedName = scanResult.data.fighterNames.find(
          (name) => name.toLowerCase() === fighterName.toLowerCase(),
        );

        if (!scannedName) continue;

        const fighterData = scanResult.data.pathData[scannedName] || {};
        const fighterSlots = Object.keys(fighterData);

        const fighterUsage = this.slotUsageByFighter.get(fighterName)!;

        for (const slot of fighterSlots) {
          if (!fighterUsage.has(slot)) {
            fighterUsage.set(slot, { mods: [] });
          }

          const slotData = fighterData[slot];

          const files = (slotData?.filesToBeModified || []).map(
            (f) => f.original,
          );

          fighterUsage.get(slot)!.mods.push({
            ...modEntry,
            files,
          });
        }
      }
    } catch (error) {
      console.warn(`[_scanAllModsSlotUsage] Failed to scan mod ${mod.name}:`, error);
    }
  }
};

M.prototype._renderSlotUsageOverview = function (slotUsage, currentModPath) {
  const modalBody = document.querySelector('#change-slot-modal .modal-body');
  const hintParagraph = document.querySelector('#slot-modal-hint');

  if (!modalBody || !hintParagraph) return;

  let overviewContainer = document.querySelector<HTMLElement>(
    '#slot-usage-overview',
  );

  if (!overviewContainer) {
    overviewContainer = document.createElement('div');
    overviewContainer.id = 'slot-usage-overview';
    overviewContainer.className = 'slot-usage-overview';
    modalBody.insertBefore(overviewContainer, hintParagraph);
  }

  overviewContainer.classList.remove('slot-usage-loading');
  overviewContainer.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'slot-usage-grid';

  const slotsToShow = 16;

  for (let i = 0; i < slotsToShow; i++) {
    const slotString = slotNumberToString(i);
    const usage = slotUsage.get(slotString);
    const isUsed = usage && usage.mods.length > 0;

    let hasCurrentModConflict = false;
    let hasOtherModsConflict = false;
    if (usage && usage.mods.length > 1) {
      const currentModFiles = usage.mods
        .filter((m) => m.path === currentModPath)
        .flatMap((m) => m.files);
      const currentModFileSet = new Set(currentModFiles);

      const otherMods = usage.mods.filter((m) => m.path !== currentModPath);

      if (currentModFileSet.size > 0) {
        for (const other of otherMods) {
          if (other.files.some((f) => currentModFileSet.has(f))) {
            hasCurrentModConflict = true;
            break;
          }
        }
      }

      if (otherMods.length > 1) {
        const otherFileSets = otherMods.map((m) => new Set(m.files));
        outer: for (let a = 0; a < otherFileSets.length; a++) {
          for (let b = a + 1; b < otherFileSets.length; b++) {
            for (const file of otherFileSets[a]) {
              if (otherFileSets[b].has(file)) {
                hasOtherModsConflict = true;
                break outer;
              }
            }
          }
        }
      }
    }

    const isCurrentModConflict = hasCurrentModConflict;
    const isOtherModsConflict =
      hasOtherModsConflict && !hasCurrentModConflict;

    const slotItem = document.createElement('div');
    slotItem.className = 'slot-usage-item';

    if (isUsed) {
      slotItem.classList.add('slot-used');
    }

    if (isCurrentModConflict) {
      slotItem.classList.add('slot-conflict-current');
    } else if (isOtherModsConflict) {
      slotItem.classList.add('slot-conflict-other');
    }

    slotItem.textContent = slotString;

    if (isUsed && usage) {
      slotItem.title = usage.mods.map((m) => m.name).join('\n');

      const tooltip = document.createElement('div');
      tooltip.className = 'slot-usage-tooltip';
      tooltip.style.display = 'none';
      tooltip.style.position = 'fixed';

      const tooltipTitle = document.createElement('div');
      tooltipTitle.className = 'slot-usage-tooltip-title';
      tooltipTitle.textContent = `Slot ${slotString}`;
      tooltip.appendChild(tooltipTitle);

      usage.mods.forEach((mod) => {
        const modItem = document.createElement('div');
        modItem.className = 'slot-usage-tooltip-mod';
        modItem.innerHTML = `<i class="bi bi-folder-fill"></i> ${mod.name}`;
        tooltip.appendChild(modItem);
      });

      document.body.appendChild(tooltip);

      slotItem.addEventListener('mouseenter', () => {
        const rect = slotItem.getBoundingClientRect();

        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 8}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
        tooltip.style.display = 'block';
      });

      slotItem.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });

      slotItem.dataset.tooltipId = `tooltip-${slotString}`;
    }

    grid.appendChild(slotItem);
  }

  overviewContainer.appendChild(grid);

  const legend = document.createElement('div');
  legend.className = 'slot-usage-legend';
  legend.innerHTML = `
    <div class="slot-usage-legend-item">
      <span class="slot-usage-legend-box"></span>
      <span>Available</span>
    </div>
    <div class="slot-usage-legend-item">
      <span class="slot-usage-legend-box slot-used"></span>
      <span>In Use</span>
    </div>
    <div class="slot-usage-legend-item">
      <span class="slot-usage-legend-box slot-conflict-other"></span>
      <span>Conflict (Other Mods)</span>
    </div>
    <div class="slot-usage-legend-item">
      <span class="slot-usage-legend-box slot-conflict-current"></span>
      <span>Conflict (Current Mod)</span>
    </div>
  `;

  overviewContainer.appendChild(legend);
};

M.prototype._renderSlotList = function () {
  const container = document.querySelector<HTMLElement>(
    '#slot-list-container',
  );

  if (!container || !this.slotAssignments || !this.selectedFighterName)
    return;

  const t = (key, params = {}) => {
    return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
  };

  container.innerHTML = '';
  updateChangeSlotApplyState();

  const actualFighters = getActualFighterNames(
    this.selectedFighterName,
    this.rawFighterNames,
  );

  const mergedAssignments = new Map();

  for (const fighter of actualFighters) {
    const assignments = this.slotAssignments.get(fighter);

    if (!assignments) continue;

    for (const [slot, target] of assignments) {
      if (!mergedAssignments.has(slot)) {
        mergedAssignments.set(slot, target);
      }
    }
  }

  const sortedAssignments = Array.from(mergedAssignments).sort(
    ([a], [b]) => slotStringToNumber(a) - slotStringToNumber(b),
  );

  for (const [
    index,
    [originalSlotString, selectedSlotString],
  ] of sortedAssignments.entries()) {
    const slotItem = document.createElement('div');

    slotItem.className = 'slot-item';
    slotItem.dataset.index = `${index}`;

    const content = document.createElement('div');
    content.className = 'slot-item-content';

    const isSlotDeleted = actualFighters.some((fighter) => {
      const fighterDeleted = this.deletedSlots.get(fighter);
      return fighterDeleted && fighterDeleted.has(originalSlotString);
    });

    if (isSlotDeleted) {
      content.classList.add('deleted');
    }

    const info = document.createElement('div');
    info.className = 'slot-item-info';

    const label = document.createElement('span');

    label.className = 'slot-item-label';
    label.textContent = t('modals.changeSlot.currentSlot', {
      slot: originalSlotString,
    });

    const arrow = document.createElement('i');
    arrow.className = 'bi bi-arrow-right slot-arrow';

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'slot-input-wrapper';

    const slotSelect = document.createElement('select');
    slotSelect.className = 'slot-select';
    slotSelect.setAttribute(
      'aria-label',
      t('modals.changeSlot.newSlotLabel', { slot: originalSlotString }),
    );

    for (let slotNumber = 0; slotNumber <= 16; slotNumber++) {
      const slotString = slotNumberToString(slotNumber);
      const option = document.createElement('option');
      option.value = slotString;
      option.textContent = slotString;
      slotSelect.appendChild(option);
    }

    const extendedOption = document.createElement('option');
    extendedOption.value = 'extended';
    extendedOption.textContent = t('modals.changeSlot.extendedSlotsOption');
    slotSelect.appendChild(extendedOption);

    const selectedSlotNumber = slotStringToNumber(selectedSlotString);
    const usesExtendedSlot = selectedSlotNumber > 16;
    slotSelect.value = usesExtendedSlot ? 'extended' : selectedSlotString;
    inputWrapper.classList.toggle('has-extended-input', usesExtendedSlot);

    const slotInput = document.createElement('input');
    slotInput.className = 'slot-input';
    slotInput.type = 'text';
    slotInput.value = usesExtendedSlot ? selectedSlotString : '';
    slotInput.placeholder = 'c17';
    slotInput.maxLength = 4;
    slotInput.autocomplete = 'off';
    slotInput.spellcheck = false;
    slotInput.hidden = !usesExtendedSlot;
    slotInput.setAttribute('aria-invalid', 'false');
    slotInput.setAttribute(
      'aria-label',
      t('modals.changeSlot.newSlotLabel', { slot: originalSlotString }),
    );
    slotInput.setAttribute('aria-describedby', `slot-error-${index}`);

    const inputError = document.createElement('span');
    inputError.id = `slot-error-${index}`;
    inputError.className = 'slot-input-error';
    inputError.textContent = t('modals.changeSlot.invalidSlot');
    inputError.hidden = true;

    const assignSlot = (slotString: string) => {
      const selectedActualFighters = getActualFighterNames(
        this.selectedFighterName!,
        this.rawFighterNames,
      );

      for (const fighter of selectedActualFighters) {
        const fighterAssignments = this.slotAssignments.get(fighter);
        if (fighterAssignments?.has(originalSlotString)) {
          fighterAssignments.set(originalSlotString, slotString);
        }
      }
    };

    const validateAndAssign = (normalizeDisplay = false) => {
      const normalizedSlot = normalizeSlotInput(slotInput.value);
      const isValid =
        normalizedSlot !== null && slotStringToNumber(normalizedSlot) > 16;

      slotInput.setCustomValidity(
        isValid ? '' : inputError.textContent || 'Invalid slot',
      );
      slotInput.setAttribute('aria-invalid', String(!isValid));
      inputError.hidden = isValid;

      if (normalizedSlot) {
        if (isValid) assignSlot(normalizedSlot);

        if (isValid && normalizeDisplay) slotInput.value = normalizedSlot;
      }

      updateChangeSlotApplyState();
    };

    slotInput.addEventListener('input', () => {
      slotInput.value = slotInput.value.toLowerCase();
      validateAndAssign();
    });
    slotInput.addEventListener('blur', () => validateAndAssign(true));

    slotSelect.addEventListener('change', () => {
      const showExtendedInput = slotSelect.value === 'extended';
      slotInput.hidden = !showExtendedInput;
      inputWrapper.classList.toggle(
        'has-extended-input',
        showExtendedInput,
      );

      if (showExtendedInput) {
        validateAndAssign();
        slotInput.focus();
        slotInput.select();
        return;
      }

      slotInput.setCustomValidity('');
      slotInput.setAttribute('aria-invalid', 'false');
      inputError.hidden = true;
      assignSlot(slotSelect.value);
      updateChangeSlotApplyState();
    });

    inputWrapper.appendChild(slotSelect);
    inputWrapper.appendChild(slotInput);
    inputWrapper.appendChild(inputError);

    info.appendChild(label);
    info.appendChild(arrow);
    info.appendChild(inputWrapper);

    const filesInfo = document.createElement('div');
    filesInfo.className = 'slot-item-files';

    const allPathsToBeModified: { original: string; type: string }[] = [];
    const seenPathsToBeModified = new Set<string>();

    for (const fighter of actualFighters) {
      const fighterData = this.pathData[fighter];

      const pathDataForSlot =
        fighterData && fighterData[originalSlotString]
          ? fighterData[originalSlotString]
          : null;

      if (pathDataForSlot) {
        for (const entry of pathDataForSlot.pathsToBeModified) {
          const entryKey = `${entry.type}:${entry.original}`;

          if (seenPathsToBeModified.has(entryKey)) {
            continue;
          }

          seenPathsToBeModified.add(entryKey);
          allPathsToBeModified.push(entry);
        }

        for (const entry of pathDataForSlot.filesToBeModified) {
          const entryKey = `${entry.type}:${entry.original}`;

          if (seenPathsToBeModified.has(entryKey)) {
            continue;
          }

          seenPathsToBeModified.add(entryKey);
          allPathsToBeModified.push(entry);
        }
      }
    }

    if (allPathsToBeModified.length > 0) {
      const filesList = document.createElement('details');

      const summary = document.createElement('summary');
      summary.textContent = t('modals.changeSlot.filesWillBeModified', {
        count: allPathsToBeModified.length,
      });

      const fileListContainer = document.createElement('div');
      fileListContainer.className = 'slot-file-list';

      allPathsToBeModified.forEach((entry) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'slot-file-item';

        const iconChar = entry.type === 'directory' ? '📁' : '📄';
        const typeLabel =
          entry.type === 'directory'
            ? t('modals.changeSlot.directory')
            : t('modals.changeSlot.file');

        fileItem.textContent = `${iconChar} ${typeLabel} ${entry.original}`;
        fileListContainer.appendChild(fileItem);
      });

      filesList.appendChild(summary);
      filesList.appendChild(fileListContainer);
      filesInfo.appendChild(filesList);
    } else {
      filesInfo.innerHTML = `<span style="color: #555; font-style: italic;">${t('modals.changeSlot.newSlotNoFiles')}</span>`;
    }

    content.appendChild(info);
    content.appendChild(filesInfo);

    const actions = document.createElement('div');
    actions.className = 'slot-item-actions';

    const deleteBtn = document.createElement('button');

    deleteBtn.className = 'slot-action-btn slot-action-delete';
    deleteBtn.innerHTML = `<i class="bi bi-trash3"></i> ${t('modals.changeSlot.delete')}`;

    deleteBtn.addEventListener('click', () => {
      this._toggleDeleteSlot(content, originalSlotString);
    });

    actions.appendChild(deleteBtn);

    slotItem.appendChild(content);
    slotItem.appendChild(actions);

    container.appendChild(slotItem);
  }
};

M.prototype._toggleDeleteSlot = function (content, slot) {
  if (!this.deletedSlots || !this.selectedFighterName) return;

  const actualFighters = getActualFighterNames(
    this.selectedFighterName,
    this.rawFighterNames,
  );

  const isDeleted = actualFighters.every((fighter) => {
    const fighterDeleted = this.deletedSlots.get(fighter);
    return fighterDeleted && fighterDeleted.has(slot);
  });

  if (isDeleted) {
    for (const fighter of actualFighters) {
      const fighterDeleted = this.deletedSlots.get(fighter);

      if (fighterDeleted) {
        fighterDeleted.delete(slot);
      }
    }

    content.classList.remove('deleted');
  } else {
    for (const fighter of actualFighters) {
      const assignments = this.slotAssignments.get(fighter);

      if (assignments && assignments.has(slot)) {
        if (!this.deletedSlots.has(fighter)) {
          this.deletedSlots.set(fighter, new Set());
        }

        this.deletedSlots.get(fighter)!.add(slot);
      }
    }

    content.classList.add('deleted');
  }

  updateChangeSlotApplyState();
};

M.prototype.confirmChangeSlots = function () {
  if (!this.changeSlotCallback || !this.slotAssignments) return;

  const firstInvalidInput = document.querySelector<HTMLInputElement>(
    '#change-slot-modal .slot-item-content:not(.deleted) .slot-input[aria-invalid="true"]',
  );
  if (firstInvalidInput) {
    firstInvalidInput.focus();
    firstInvalidInput.reportValidity();
    return;
  }

  if (
    window.settingsManager?.settings?.reviewSlotChangesBeforeApply === false
  ) {
    if (this.isApplyingSlotChanges) return;
    this.isApplyingSlotChanges = true;

    const callback = this.changeSlotCallback;
    const assignments = this.slotAssignments;
    const deletions = this.deletedSlots;

    this.closeChangeSlotModal();
    Promise.resolve(callback(assignments, deletions)).finally(() => {
      this.isApplyingSlotChanges = false;
    });
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'slot-change-summary';

  const intro = document.createElement('p');
  intro.className = 'slot-change-summary-intro';
  intro.textContent = translate('modals.changeSlot.confirmIntro', {
    modName: this.currentMod?.name || '',
  });
  summary.appendChild(intro);

  const groups: HTMLElement[] = [];
  let changedSlots = 0;
  let deletedSlots = 0;
  let affectedEntries = 0;

  for (const fighterName of this.fighterNames || []) {
    const actualFighters = getActualFighterNames(
      fighterName,
      this.rawFighterNames || [],
    );
    const mergedAssignments = new Map<string, string>();

    for (const fighter of actualFighters) {
      const assignments = this.slotAssignments.get(fighter);
      if (!assignments) continue;

      for (const [originalSlot, targetSlot] of assignments) {
        if (!mergedAssignments.has(originalSlot)) {
          mergedAssignments.set(originalSlot, targetSlot);
        }
      }
    }

    const operations: HTMLElement[] = [];
    const sortedAssignments = Array.from(mergedAssignments).sort(
      ([a], [b]) => slotStringToNumber(a) - slotStringToNumber(b),
    );

    for (const [originalSlot, targetSlot] of sortedAssignments) {
      const isDeleted = actualFighters.some((fighter) =>
        this.deletedSlots?.get(fighter)?.has(originalSlot),
      );
      if (!isDeleted && originalSlot === targetSlot) continue;

      const entryCount = countAffectedEntries(
        this.pathData,
        actualFighters,
        originalSlot,
      );
      affectedEntries += entryCount;

      const operation = document.createElement('div');
      operation.className = `slot-change-summary-operation ${
        isDeleted ? 'is-deletion' : 'is-move'
      }`;

      const icon = document.createElement('i');
      icon.className = isDeleted
        ? 'bi bi-trash3 slot-change-summary-icon'
        : 'bi bi-arrow-right slot-change-summary-icon';

      const operationText = document.createElement('div');
      operationText.className = 'slot-change-summary-operation-text';

      const action = document.createElement('strong');
      action.textContent = isDeleted
        ? translate('modals.changeSlot.confirmDeleteSlot', {
            slot: originalSlot,
          })
        : translate('modals.changeSlot.confirmMoveSlot', {
            from: originalSlot,
            to: targetSlot,
          });

      const impact = document.createElement('span');
      impact.textContent = translate('modals.changeSlot.confirmAffected', {
        count: entryCount,
      });

      operationText.appendChild(action);
      operationText.appendChild(impact);
      operation.appendChild(icon);
      operation.appendChild(operationText);
      operations.push(operation);

      if (isDeleted) deletedSlots += 1;
      else changedSlots += 1;
    }

    if (operations.length === 0) continue;

    const group = document.createElement('section');
    group.className = 'slot-change-summary-group';

    const heading = document.createElement('h4');
    heading.textContent = getFighterDisplayName(fighterName);
    group.appendChild(heading);
    operations.forEach((operation) => group.appendChild(operation));
    groups.push(group);
  }

  const totalOperations = changedSlots + deletedSlots;
  const metrics = document.createElement('div');
  metrics.className = 'slot-change-summary-metrics';
  metrics.setAttribute('aria-label', translate('modals.changeSlot.confirmSummary'));

  const addMetric = (value: number, labelKey: string) => {
    const metric = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    metric.appendChild(strong);
    metric.append(` ${translate(labelKey, { count: value })}`);
    metrics.appendChild(metric);
  };

  addMetric(changedSlots, 'modals.changeSlot.confirmChangedCount');
  addMetric(deletedSlots, 'modals.changeSlot.confirmDeletedCount');
  addMetric(affectedEntries, 'modals.changeSlot.confirmFilesCount');
  summary.appendChild(metrics);

  const operationList = document.createElement('div');
  operationList.className = 'slot-change-summary-list';

  if (groups.length > 0) {
    groups.forEach((group) => operationList.appendChild(group));
  } else {
    const empty = document.createElement('div');
    empty.className = 'slot-change-summary-empty';
    empty.innerHTML = '<i class="bi bi-check2-circle"></i>';
    const emptyText = document.createElement('span');
    emptyText.textContent = translate('modals.changeSlot.confirmNoChanges');
    empty.appendChild(emptyText);
    operationList.appendChild(empty);
  }

  summary.appendChild(operationList);

  const editorModal = document.querySelector<HTMLElement>('#change-slot-modal');
  if (editorModal) {
    editorModal.inert = true;
    editorModal.setAttribute('aria-hidden', 'true');
  }

  const modal = this.showCustomModal({
    id: 'change-slot-summary-modal',
    title: translate('modals.changeSlot.confirmTitle'),
    body: summary,
    clickOverlayToClose: false,
    escapeToClose: false,
    buttons: [
      {
        id: 'change-slot-summary-back',
        text: translate('modals.changeSlot.confirmBack'),
        type: 'cancel',
        closeOnClick: false,
        onClick: () => {
          this.closeModal(modal, {
            skipHideOverlay: true,
            onModalClosed: () => {
              modal.remove();
              if (editorModal) {
                editorModal.inert = false;
                editorModal.removeAttribute('aria-hidden');
              }
              document
                .querySelector<HTMLButtonElement>('#confirm-change-slots')
                ?.focus();
            },
          });
          return false;
        },
      },
      {
        id: 'change-slot-summary-confirm',
        text: translate('modals.changeSlot.confirmApply'),
        type: 'primary',
        closeOnClick: false,
        onClick: () => {
          if (this.isApplyingSlotChanges) return false;
          this.isApplyingSlotChanges = true;

          const callback = this.changeSlotCallback;
          const assignments = this.slotAssignments;
          const deletions = this.deletedSlots;

          this.closeModal(modal, {
            skipHideOverlay: true,
            onModalClosed: () => modal.remove(),
          });
          this.closeChangeSlotModal();

          Promise.resolve(callback(assignments, deletions)).finally(() => {
            this.isApplyingSlotChanges = false;
          });
          return false;
        },
      },
    ],
  });

  const confirmButton = modal.querySelector(
    '#change-slot-summary-confirm',
  ) as HTMLButtonElement | null;
  if (confirmButton) confirmButton.disabled = totalOperations === 0;

  requestAnimationFrame(() => {
    const focusTarget =
      totalOperations > 0
        ? confirmButton
        : (modal.querySelector(
            '#change-slot-summary-back',
          ) as HTMLButtonElement | null);
    focusTarget?.focus();
  });
};
})();
