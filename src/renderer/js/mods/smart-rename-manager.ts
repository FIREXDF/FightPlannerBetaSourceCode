import type { Mod } from './mod-manager';

interface SmartRenameModEntry {
  mod: Mod;
  baseName: string;
  originalName: string;
  newName: string;
  characterNames: string[];
  slots: string[];
  selected: boolean;
  hadInfoToml: boolean;
  existingInfo: any | null;
}

/**
 * Formats an array of slot strings (e.g. ['c01','c02','c03','c05','c07','c08','c09'])
 * into a compact range string like "c01-c03, c05, c07-c09"
 */
function formatSlotRanges(slots: string[]): string {
  if (slots.length === 0) return '';

  // Sort numerically
  const sorted = [...slots].sort((a, b) => {
    const numA = parseInt(a.replace('c', ''));
    const numB = parseInt(b.replace('c', ''));
    return numA - numB;
  });

  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const prevNum = parseInt(rangeEnd.replace('c', ''));
    const currNum = parseInt(sorted[i].replace('c', ''));

    if (currNum === prevNum + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(
        rangeStart === rangeEnd ? rangeStart : `${rangeStart}-${rangeEnd}`,
      );
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }

  ranges.push(
    rangeStart === rangeEnd ? rangeStart : `${rangeStart}-${rangeEnd}`,
  );
  return ranges.join(', ');
}

/**
 * Resolves a raw fighter ID to a display name using the SSBU_CHARACTERS lookup.
 */
function getCharacterDisplayName(rawFighterId: string): string {
  const resolvedId = window.resolveFolderName
    ? window.resolveFolderName(rawFighterId)
    : rawFighterId.toLowerCase();

  const charInfo = window.SSBU_CHARACTERS?.[resolvedId];
  return charInfo?.name || rawFighterId;
}

/**
 * Computes the new mod folder name from character names, slots, and base name.
 * Format: [Character Name] [c01-c03, c05] Base Mod Name
 */
function computeNewName(
  characterNames: string[],
  slots: string[],
  baseName: string,
): string {
  const parts: string[] = [];

  if (characterNames.length > 0) {
    // Deduplicate character names while preserving order
    const unique = [...new Set(characterNames)];
    parts.push(`[${unique.join(', ')}]`);
  }

  // Filter out 'unknown' slots
  const validSlots = slots.filter((s) => s !== 'unknown');
  if (validSlots.length > 0) {
    parts.push(`[${formatSlotRanges(validSlots)}]`);
  }

  parts.push(baseName);
  return parts.join(' ');
}

/**
 * Sanitizes a file/folder name by removing characters that are invalid on Windows.
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class SmartRenameManager {
  private entries: SmartRenameModEntry[] = [];

  // ──────────────── SELECT MODAL ────────────────

  openSelectModal() {
    const mods = window.modManager?.mods;
    if (!mods || mods.length === 0) {
      if (window.toastManager) {
        window.toastManager.warning('No mods loaded to rename.');
      }
      return;
    }

    const modal = document.getElementById('smart-rename-modal');
    if (!modal) return;

    this.populateSelectList(mods);

    const searchInput = document.getElementById(
      'smart-rename-search',
    ) as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim();
        const items = document.querySelectorAll<HTMLElement>(
          '#smart-rename-select-list .smart-rename-select-item',
        );
        items.forEach((item) => {
          const name = item
            .querySelector('.smart-rename-mod-name')
            ?.textContent?.toLowerCase() || '';
          item.style.display = name.includes(query) ? '' : 'none';
        });
      };
    }

    modal.classList.remove('closing');
    window.modalManager.showOverlay();
    modal.style.display = 'block';

    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  }

  private populateSelectList(mods: Mod[]) {
    const listContainer = document.getElementById('smart-rename-select-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    mods.forEach((mod) => {
      const item = document.createElement('label');
      item.classList.add('smart-rename-select-item');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.modId = mod.id;
      checkbox.dataset.modStatus = mod.status;
      checkbox.classList.add('smart-rename-checkbox');

      const nameSpan = document.createElement('span');
      nameSpan.classList.add('smart-rename-mod-name');
      nameSpan.textContent = mod.name;

      const statusBadge = document.createElement('span');
      statusBadge.classList.add(
        'smart-rename-status-badge',
        mod.status === 'active' ? 'badge-active' : 'badge-disabled',
      );
      statusBadge.textContent =
        mod.status === 'active' ? 'Enabled' : 'Disabled';

      item.appendChild(checkbox);
      item.appendChild(nameSpan);
      item.appendChild(statusBadge);
      listContainer.appendChild(item);
    });
  }

  selectAll() {
    document
      .querySelectorAll<HTMLInputElement>(
        '#smart-rename-select-list .smart-rename-checkbox',
      )
      .forEach((cb) => (cb.checked = true));
  }

  deselectAll() {
    document
      .querySelectorAll<HTMLInputElement>(
        '#smart-rename-select-list .smart-rename-checkbox',
      )
      .forEach((cb) => (cb.checked = false));
  }

  selectEnabledOnly() {
    document
      .querySelectorAll<HTMLInputElement>(
        '#smart-rename-select-list .smart-rename-checkbox',
      )
      .forEach((cb) => {
        cb.checked = cb.dataset.modStatus === 'active';
      });
  }

  selectDisabledOnly() {
    document
      .querySelectorAll<HTMLInputElement>(
        '#smart-rename-select-list .smart-rename-checkbox',
      )
      .forEach((cb) => {
        cb.checked = cb.dataset.modStatus === 'disabled';
      });
  }

  closeSelectModal() {
    window.modalManager.closeModal('smart-rename-modal');
  }

  // ──────────────── PREVIEW MODAL ────────────────

  private showLoadingOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'smart-rename-loading-overlay';
    overlay.style.cssText =
      'position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.3s ease;';

    const container = document.createElement('div');
    container.id = 'smart-rename-lottie-container';
    container.style.cssText = 'width: 120px; height: 120px;';
    overlay.appendChild(container);

    const statusText = document.createElement('p');
    statusText.id = 'smart-rename-loading-status';
    statusText.className = 'smart-rename-loading-status';
    statusText.textContent = 'Scanning mods...';
    overlay.appendChild(statusText);

    document.body.appendChild(overlay);

    if (window.lottie) {
      window.lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '../../assets/images/loading.json',
      });
    }

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    return overlay;
  }

  private updateLoadingStatus(text: string) {
    const statusEl = document.getElementById('smart-rename-loading-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  private hideLoadingOverlay(overlay: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 300);
    });
  }

  async openPreviewModal() {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      '#smart-rename-select-list .smart-rename-checkbox:checked',
    );

    if (checkboxes.length === 0) {
      if (window.toastManager) {
        window.toastManager.warning('No mods selected.');
      }
      return;
    }

    const selectedIds = new Set<string>();
    checkboxes.forEach((cb) => selectedIds.add(cb.dataset.modId!));

    const mods = window.modManager.mods.filter((m) => selectedIds.has(m.id));

    const selectModal = document.getElementById('smart-rename-modal');
    if (selectModal) {
      selectModal.classList.add('closing');
      const delay = window.modalManager._getAnimationDelay();
      await new Promise((resolve) => setTimeout(resolve, delay));
      selectModal.style.display = 'none';
      selectModal.classList.remove('closing');
    }

    const loadingOverlay = this.showLoadingOverlay();

    this.entries = [];

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      this.updateLoadingStatus(`Scanning ${mod.name} (${i + 1}/${mods.length})...`);
      let baseName = mod.name;
      let hadInfoToml = false;
      let existingInfo: any = null;
      let characterNames: string[] = [];
      let slots: string[] = [];

      try {
        const modInfo = await window.electronAPI.getModInfo(mod.path);
        if (modInfo) {
          hadInfoToml = true;
          existingInfo = modInfo;
          if (modInfo.display_name) {
            baseName = modInfo.display_name;
          }
        }
      } catch (e) {
        console.warn('Failed to read mod info for', mod.name, e);
      }

      try {
        const scanResult = await window.electronAPI.scanMod(mod.path);
        if (scanResult.success && scanResult.data) {
          if (
            scanResult.data.fighterNames &&
            scanResult.data.fighterNames.length > 0
          ) {
            characterNames = scanResult.data.fighterNames.map(
              getCharacterDisplayName,
            );
            characterNames = [...new Set(characterNames)];
          }

          if (
            scanResult.data.currentSlots &&
            scanResult.data.currentSlots.length > 0
          ) {
            slots = scanResult.data.currentSlots;
          }
        }
      } catch (e) {
        console.warn('Failed to scan mod', mod.name, e);
      }

      const newName = sanitizeFolderName(
        computeNewName(characterNames, slots, baseName),
      );

      this.entries.push({
        mod,
        baseName,
        originalName: mod.name,
        newName,
        characterNames,
        slots,
        selected: true,
        hadInfoToml,
        existingInfo,
      });
    }

    this.renderPreviewTable();

    await this.hideLoadingOverlay(loadingOverlay);

    const previewModal = document.getElementById('smart-rename-preview-modal');
    if (previewModal) {
      previewModal.classList.remove('closing');
      previewModal.style.display = 'block';
    }
  }

  private renderPreviewTable() {
    const tbody = document.getElementById('smart-rename-preview-tbody');
    const selectAllCb = document.getElementById(
      'smart-rename-preview-select-all',
    ) as HTMLInputElement | null;

    if (!tbody) return;
    tbody.innerHTML = '';

    if (selectAllCb) {
      selectAllCb.checked = true;
      selectAllCb.onchange = () => {
        const isChecked = selectAllCb.checked;
        this.entries.forEach((entry) => (entry.selected = isChecked));
        tbody
          .querySelectorAll<HTMLInputElement>('.smart-rename-preview-cb')
          .forEach((cb) => (cb.checked = isChecked));
      };
    }

    this.entries.forEach((entry) => {
      const tr = document.createElement('tr');

      // Checkbox cell
      const tdCb = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = entry.selected;
      cb.classList.add('smart-rename-preview-cb');
      cb.addEventListener('change', () => {
        entry.selected = cb.checked;
        this.updateSelectAllState();
      });
      tdCb.appendChild(cb);
      tr.appendChild(tdCb);

      // Base Mod Name cell (editable)
      const tdBase = document.createElement('td');
      const baseInput = document.createElement('input');
      baseInput.type = 'text';
      baseInput.value = entry.baseName;
      baseInput.classList.add('smart-rename-base-input');
      baseInput.addEventListener('input', () => {
        entry.baseName = baseInput.value;
        entry.newName = sanitizeFolderName(
          computeNewName(entry.characterNames, entry.slots, entry.baseName),
        );
        newNameSpan.textContent = entry.newName;
      });
      tdBase.appendChild(baseInput);
      tr.appendChild(tdBase);

      // Original Name cell
      const tdOrig = document.createElement('td');
      tdOrig.classList.add('smart-rename-original');
      tdOrig.textContent = entry.originalName;
      tr.appendChild(tdOrig);

      // New Name cell
      const tdNew = document.createElement('td');
      const newNameSpan = document.createElement('span');
      newNameSpan.classList.add('smart-rename-new-name');
      newNameSpan.textContent = entry.newName;
      tdNew.appendChild(newNameSpan);
      tr.appendChild(tdNew);

      tbody.appendChild(tr);
    });
  }

  private updateSelectAllState() {
    const selectAllCb = document.getElementById(
      'smart-rename-preview-select-all',
    ) as HTMLInputElement | null;
    if (!selectAllCb) return;

    const allSelected = this.entries.every((e) => e.selected);
    const noneSelected = this.entries.every((e) => !e.selected);
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = !allSelected && !noneSelected;
  }

  closePreviewModal() {
    window.modalManager.closeModal('smart-rename-preview-modal');
  }

  // ──────────────── APPLY RENAME ────────────────

  async applyRenames() {
    const toRename = this.entries.filter((e) => e.selected);

    if (toRename.length === 0) {
      if (window.toastManager) {
        window.toastManager.warning('No mods selected for rename.');
      }
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const entry of toRename) {
      try {
        // If the mod didn't have an info.toml or its display_name differs, update it
        if (
          !entry.hadInfoToml ||
          !entry.existingInfo?.display_name ||
          entry.existingInfo.display_name !== entry.baseName
        ) {
          const infoData = {
            display_name: entry.baseName,
            ...(entry.existingInfo?.authors && {
              authors: entry.existingInfo.authors,
            }),
            ...(entry.existingInfo?.version && {
              version: entry.existingInfo.version,
            }),
            ...(entry.existingInfo?.category && {
              category: entry.existingInfo.category,
            }),
            ...(entry.existingInfo?.url && { url: entry.existingInfo.url }),
            ...(entry.existingInfo?.description && {
              description: entry.existingInfo.description,
            }),
          };

          await window.electronAPI.saveModInfo(entry.mod.path, infoData);
        }

        // Rename the folder if the name changed
        const sanitizedNewName = sanitizeFolderName(entry.newName);
        if (sanitizedNewName && sanitizedNewName !== entry.originalName) {
          const result = await window.electronAPI.renameMod(
            entry.mod.path,
            sanitizedNewName,
          );
          if (result && !result.success) {
            console.error(
              `Failed to rename ${entry.originalName}:`,
              result.error,
            );
            errorCount++;
            continue;
          }
        }

        successCount++;
      } catch (error) {
        console.error(`Error renaming ${entry.originalName}:`, error);
        errorCount++;
      }
    }

    // Close preview modal
    this.closePreviewModal();

    // Show results toast
    if (window.toastManager) {
      if (errorCount === 0) {
        window.toastManager.success(
          `Successfully renamed ${successCount} mod${successCount !== 1 ? 's' : ''}.`,
        );
      } else {
        window.toastManager.warning(
          `Renamed ${successCount} mod${successCount !== 1 ? 's' : ''}, ${errorCount} failed.`,
        );
      }
    }

    // Refresh mod list
    if (window.modManager) {
      window.modManager.fetchMods();
    }
  }
}

if (typeof window !== 'undefined') {
  window.smartRenameManager = new SmartRenameManager();
  console.log('Smart Rename Manager initialized');
}

export { type SmartRenameManager };
