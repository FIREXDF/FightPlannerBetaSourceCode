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

const SLOT_DROPDOWN_OFFSET_PX = 5;
const SLOT_DROPDOWN_VIEWPORT_PADDING_PX = 12;
const SLOT_DROPDOWN_MAX_HEIGHT_PX = 300;

function getDropdownHiddenTransform(dropdown: HTMLElement): string {
  return dropdown.dataset.openDirection === 'up'
    ? 'translateY(10px)'
    : 'translateY(-10px)';
}

function hideSlotDropdown(dropdown: HTMLElement) {
  dropdown.style.opacity = '0';
  dropdown.style.pointerEvents = 'none';
  dropdown.style.visibility = 'hidden';
  dropdown.style.transform = getDropdownHiddenTransform(dropdown);
}

function positionSlotDropdown(
  selectContainer: HTMLElement,
  selectDropdown: HTMLElement,
) {
  const rect = selectContainer.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceAbove = rect.top - SLOT_DROPDOWN_VIEWPORT_PADDING_PX;
  const spaceBelow =
    viewportHeight - rect.bottom - SLOT_DROPDOWN_VIEWPORT_PADDING_PX;

  selectDropdown.style.width = `${rect.width}px`;
  selectDropdown.style.left = `${Math.min(
    Math.max(SLOT_DROPDOWN_VIEWPORT_PADDING_PX, rect.left),
    Math.max(
      SLOT_DROPDOWN_VIEWPORT_PADDING_PX,
      viewportWidth - rect.width - SLOT_DROPDOWN_VIEWPORT_PADDING_PX,
    ),
  )}px`;
  selectDropdown.style.top = '0px';
  selectDropdown.style.maxHeight = `${SLOT_DROPDOWN_MAX_HEIGHT_PX}px`;

  const naturalHeight = Math.min(
    selectDropdown.scrollHeight,
    SLOT_DROPDOWN_MAX_HEIGHT_PX,
  );
  const opensUpward =
    naturalHeight > spaceBelow && spaceAbove > spaceBelow;
  const availableSpace = Math.max(opensUpward ? spaceAbove : spaceBelow, 1);
  const maxHeight = Math.min(
    SLOT_DROPDOWN_MAX_HEIGHT_PX,
    Math.max(availableSpace - SLOT_DROPDOWN_OFFSET_PX, 1),
  );

  selectDropdown.style.maxHeight = `${maxHeight}px`;
  selectDropdown.dataset.openDirection = opensUpward ? 'up' : 'down';

  const dropdownHeight = Math.min(selectDropdown.scrollHeight, maxHeight);
  const top = opensUpward
    ? rect.top - dropdownHeight - SLOT_DROPDOWN_OFFSET_PX
    : rect.bottom + SLOT_DROPDOWN_OFFSET_PX;

  selectDropdown.style.top = `${Math.max(
    SLOT_DROPDOWN_VIEWPORT_PADDING_PX,
    top,
  )}px`;
}

M.prototype.openChangeSlotModal = function (mod, modData, callback) {
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
  this.fighterNames = [];
  this.rawFighterNames = [];
  this.selectedFighterName = null;
  this.slotUsageByFighter = null;
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

  const activeMods = window.modManager.mods.filter(
    (m) => m.status === 'active' && m.path,
  );

  for (const mod of activeMods) {
    if (!mod.path || !window.electronAPI?.scanMod) continue;

    try {
      const scanResult = await window.electronAPI.scanMod(mod.path);
      if (!scanResult.success) continue;

      const modEntry = { name: mod.name, path: mod.path };

      for (const fighterName of this.rawFighterNames) {
        if (!scanResult.data.fighterNames.includes(fighterName)) continue;

        const fighterData = scanResult.data.pathData[fighterName] || {};
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

  document
    .querySelectorAll('.custom-select-dropdown[data-parent-id]')
    .forEach((dropdown) => dropdown.remove());

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

    const selectContainer = document.createElement('div');
    selectContainer.className = 'custom-select slot-select-custom';
    selectContainer.dataset.index = `${index}`;

    const selectTrigger = document.createElement('div');
    selectTrigger.className = 'custom-select-trigger';

    const selectedValueSpan = document.createElement('span');
    selectedValueSpan.className = 'selected-value';
    selectedValueSpan.textContent = t('modals.changeSlot.slotOption', {
      slot: selectedSlotString,
    });

    const triggerIcon = document.createElement('i');
    triggerIcon.className = 'bi bi-chevron-down';

    selectTrigger.appendChild(selectedValueSpan);
    selectTrigger.appendChild(triggerIcon);

    const selectDropdown = document.createElement('div');
    selectDropdown.className = 'custom-select-dropdown';

    const selectedSlotNumber = slotStringToNumber(selectedSlotString);
    const visibleSlotLimit = 16;
    const maxSlotNumber = 255;
    const createSlotOption = (slotNumber: number) => {
      const slotString = slotNumberToString(slotNumber);
      const option = document.createElement('div');
      option.className = 'custom-select-option';

      if (slotNumber === selectedSlotNumber) {
        option.classList.add('active');
      }

      option.dataset.value = `${slotNumber}`;

      const optionText = document.createElement('span');

      optionText.textContent = t('modals.changeSlot.slotOption', {
        slot: slotString,
      });

      option.appendChild(optionText);

      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedActualFighters = getActualFighterNames(
          this.selectedFighterName!,
          this.rawFighterNames,
        );

        for (const fighter of selectedActualFighters) {
          const fighterAssignments = this.slotAssignments.get(fighter);

          if (
            fighterAssignments &&
            fighterAssignments.has(originalSlotString)
          ) {
            fighterAssignments.set(originalSlotString, slotString);
          }
        }

        selectedValueSpan.textContent = t('modals.changeSlot.slotOption', {
          slot: slotString,
        });

        selectContainer.classList.remove('open');
        hideSlotDropdown(selectDropdown);

        const allOptions = selectDropdown.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );
        allOptions.forEach((opt) => opt.classList.remove('active'));
        option.classList.add('active');
      });

      selectDropdown.appendChild(option);

      return option;
    };

    for (let slotNumber = 0; slotNumber <= visibleSlotLimit; slotNumber++) {
      createSlotOption(slotNumber);
    }

    if (
      selectedSlotNumber > visibleSlotLimit &&
      selectedSlotNumber <= maxSlotNumber
    ) {
      createSlotOption(selectedSlotNumber);
    }

    const moreOption = document.createElement('div');
    moreOption.className = 'custom-select-option slot-more-option';
    const moreText = document.createElement('span');
    moreText.textContent = t('modals.changeSlot.moreSlots', {
      maxSlot: slotNumberToString(maxSlotNumber),
    });
    moreOption.appendChild(moreText);
    moreOption.addEventListener('click', (e) => {
      e.stopPropagation();
      moreOption.remove();

      for (
        let slotNumber = visibleSlotLimit + 1;
        slotNumber <= maxSlotNumber;
        slotNumber++
      ) {
        if (slotNumber === selectedSlotNumber) {
          continue;
        }

        createSlotOption(slotNumber);
      }
    });

    selectDropdown.appendChild(moreOption);

    selectContainer.appendChild(selectTrigger);

    selectDropdown.dataset.parentId = `${index}`;
    selectDropdown.style.position = 'fixed';
    selectDropdown.style.opacity = '0';
    selectDropdown.style.pointerEvents = 'none';
    selectDropdown.style.visibility = 'hidden';
    document.body.appendChild(selectDropdown);

    selectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();

      const wasOpen = selectContainer.classList.contains('open');

      document
        .querySelectorAll<HTMLElement>('.custom-select.open')
        .forEach((el) => {
          if (el !== selectContainer) {
            el.classList.remove('open');
            const drop = document.body.querySelector<HTMLElement>(
              `.custom-select-dropdown[data-parent-id="${el.dataset.index}"]`,
            );

            if (drop) {
              hideSlotDropdown(drop);
            }
          }
        });

      if (!wasOpen) {
        selectContainer.classList.add('open');

        positionSlotDropdown(selectContainer, selectDropdown);
        selectDropdown.style.zIndex = '100005';

        selectDropdown.style.transition = 'none';
        selectDropdown.style.opacity = '0';
        selectDropdown.style.transform = getDropdownHiddenTransform(selectDropdown);
        selectDropdown.style.pointerEvents = 'all';
        selectDropdown.style.visibility = 'visible';

        void selectDropdown.offsetWidth;

        selectDropdown.style.transition =
          'opacity 0.2s ease, transform 0.2s ease';

        requestAnimationFrame(() => {
          selectDropdown.style.opacity = '1';
          selectDropdown.style.transform = 'translateY(0)';
        });
      } else {
        selectContainer.classList.remove('open');
        hideSlotDropdown(selectDropdown);
      }
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (
        !selectContainer.contains(target) &&
        !selectDropdown.contains(target)
      ) {
        if (selectContainer.classList.contains('open')) {
          selectContainer.classList.remove('open');
          hideSlotDropdown(selectDropdown);
        }
      }
    });

    info.appendChild(label);
    info.appendChild(arrow);
    info.appendChild(selectContainer);

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
};

M.prototype.confirmChangeSlots = function () {
  if (!this.changeSlotCallback || !this.slotAssignments) return;

  this.changeSlotCallback(this.slotAssignments, this.deletedSlots);
  this.closeChangeSlotModal();
};
})();


