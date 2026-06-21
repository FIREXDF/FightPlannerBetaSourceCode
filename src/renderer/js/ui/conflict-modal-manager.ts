import { SimpleMod } from '../mods/mod-manager';

interface DisableModCandidate extends SimpleMod {
  conflictCount: number;
  conflictsWith: Array<{ name: string; path: string }>;
}

interface SelectedConflictFile {
  mod: { name: string; path: string };
  filePath: string;
}

export class ConflictModalManager {
  currentConflictFile: string | null;
  currentConflictingMods: Array<{ name: string; path: string }>;
  autoSlotChangeMods: Array<SimpleMod>;
  selectedConflictFiles: Map<string, SelectedConflictFile>;

  constructor() {
    this.currentConflictFile = null;
    this.currentConflictingMods = [];
    this.autoSlotChangeMods = [];
    this.selectedConflictFiles = new Map();
  }

  t(key: string, params = {}) {
    return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
  }

  async confirmConflictFileDeletion(
    mod: { name: string; path: string },
    filePath: string,
  ): Promise<boolean> {
    return this.confirmConflictFilesDeletion([mod], filePath);
  }

  async confirmConflictFilesDeletion(
    mods: Array<{ name: string; path: string }>,
    filePath: string,
  ): Promise<boolean> {
    const modNames = mods.map((mod) => mod.name).join(', ');

    if (!window.modalManager?.showCustomModal) {
      return window.confirm(
        this.t('modals.conflict.deleteFileConfirm', {
          filePath,
          modName: modNames,
          count: mods.length,
        }),
      );
    }

    return new Promise((resolve) => {
      let shouldDelete = false;
      let resolved = false;
      const resolveOnce = (value: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const body = document.createElement('div');
      body.className = 'conflict-delete-confirm-body';

      const warning = document.createElement('p');
      warning.className = 'modal-warning';
      warning.textContent =
        mods.length === 1
          ? this.t('modals.conflict.deleteFileWarning', {
              modName: mods[0].name,
            })
          : this.t('modals.conflict.deleteMultipleFilesWarning', {
              count: mods.length,
            });

      const file = document.createElement('div');
      file.className = 'conflict-delete-confirm-file';

      const fileLabel = document.createElement('span');
      fileLabel.className = 'conflict-delete-confirm-file-label';
      fileLabel.textContent = this.t('modals.conflict.deleteFilePathLabel');

      const filePathEl = document.createElement('code');
      filePathEl.textContent = filePath;

      const hint = document.createElement('p');
      hint.className = 'modal-hint';
      hint.textContent = this.t('modals.conflict.deleteFileHint');

      file.appendChild(fileLabel);
      file.appendChild(filePathEl);
      body.appendChild(warning);
      body.appendChild(file);

      if (mods.length > 1) {
        const modList = document.createElement('div');
        modList.className = 'conflict-delete-confirm-file';

        const modListLabel = document.createElement('span');
        modListLabel.className = 'conflict-delete-confirm-file-label';
        modListLabel.textContent = this.t(
          'modals.conflict.deleteFileModsLabel',
        );

        const modNamesList = document.createElement('ul');
        modNamesList.className = 'conflict-delete-confirm-mod-list';

        mods.forEach((selectedMod) => {
          const item = document.createElement('li');
          item.textContent = selectedMod.name;
          modNamesList.appendChild(item);
        });

        modList.appendChild(modListLabel);
        modList.appendChild(modNamesList);
        body.appendChild(modList);
      }

      body.appendChild(hint);

      window.modalManager.showCustomModal({
        id: 'conflict-delete-file-confirm-modal',
        title: this.t('modals.conflict.deleteFileTitle'),
        body,
        size: 'small',
        clickOverlayToClose: false,
        buttons: [
          {
            text: this.t('common.cancel'),
            type: 'cancel',
            onClick: () => {
              shouldDelete = false;
            },
          },
          {
            text: this.t('common.delete'),
            type: 'danger',
            onClick: () => {
              shouldDelete = true;
            },
          },
        ],
        onClose: () => {
          resolveOnce(shouldDelete);
        },
      });
    });
  }

  async confirmSelectedConflictFilesDeletion(
    items: SelectedConflictFile[],
  ): Promise<boolean> {
    if (items.length === 1) {
      return this.confirmConflictFileDeletion(items[0].mod, items[0].filePath);
    }

    if (!window.modalManager?.showCustomModal) {
      return window.confirm(
        this.t('modals.conflict.deleteSelectedConfirm', {
          count: items.length,
        }),
      );
    }

    return new Promise((resolve) => {
      let shouldDelete = false;
      let resolved = false;
      const resolveOnce = (value: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const body = document.createElement('div');
      body.className = 'conflict-delete-confirm-body';

      const warning = document.createElement('p');
      warning.className = 'modal-warning';
      warning.textContent = this.t(
        'modals.conflict.deleteSelectedWarning',
        {
          count: items.length,
        },
      );

      const fileList = document.createElement('div');
      fileList.className = 'conflict-delete-confirm-file';

      const fileListLabel = document.createElement('span');
      fileListLabel.className = 'conflict-delete-confirm-file-label';
      fileListLabel.textContent = this.t(
        'modals.conflict.deleteSelectedFilesLabel',
      );

      const selectedList = document.createElement('ul');
      selectedList.className = 'conflict-delete-confirm-mod-list';

      items.forEach((item) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${item.mod.name} - ${item.filePath}`;
        selectedList.appendChild(listItem);
      });

      const hint = document.createElement('p');
      hint.className = 'modal-hint';
      hint.textContent = this.t('modals.conflict.deleteFileHint');

      fileList.appendChild(fileListLabel);
      fileList.appendChild(selectedList);
      body.appendChild(warning);
      body.appendChild(fileList);
      body.appendChild(hint);

      window.modalManager.showCustomModal({
        id: 'conflict-delete-file-confirm-modal',
        title: this.t('modals.conflict.deleteFileTitle'),
        body,
        size: 'small',
        clickOverlayToClose: false,
        buttons: [
          {
            text: this.t('common.cancel'),
            type: 'cancel',
            onClick: () => {
              shouldDelete = false;
            },
          },
          {
            text: this.t('common.delete'),
            type: 'danger',
            onClick: () => {
              shouldDelete = true;
            },
          },
        ],
        onClose: () => {
          resolveOnce(shouldDelete);
        },
      });
    });
  }

  async deleteConflictFile(
    mod: { name: string; path: string },
    filePath: string,
  ) {
    if (!window.electronAPI?.deleteConflictFile || !window.modManager) {
      window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
        error: 'API not available',
      });
      return;
    }

    const confirmed = await this.confirmConflictFileDeletion(mod, filePath);

    if (!confirmed) return;

    const result = await window.electronAPI.deleteConflictFile(
      mod.path,
      filePath,
    );

    if (!result.success) {
      window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
        error: result.error || 'Unknown error',
      });
      return;
    }

    await this.refreshConflictsAfterConflictFileDeletion();
  }

  async deleteConflictFiles(
    mods: Array<{ name: string; path: string }>,
    filePath: string,
  ) {
    if (!window.electronAPI?.deleteConflictFile || !window.modManager) {
      window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
        error: 'API not available',
      });
      return;
    }

    const uniqueMods = Array.from(
      new Map(mods.map((mod) => [mod.path, mod])).values(),
    );

    if (uniqueMods.length === 0) return;

    if (uniqueMods.length === 1) {
      await this.deleteConflictFile(uniqueMods[0], filePath);
      return;
    }

    const confirmed = await this.confirmConflictFilesDeletion(
      uniqueMods,
      filePath,
    );

    if (!confirmed) return;

    for (const mod of uniqueMods) {
      const result = await window.electronAPI.deleteConflictFile(
        mod.path,
        filePath,
      );

      if (!result.success) {
        window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
          error: result.error || 'Unknown error',
        });
        return;
      }
    }

    window.toastManager?.success('toasts.conflictFilesDeleted', 3000, {
      count: uniqueMods.length,
    });

    await this.refreshConflictsAfterConflictFileDeletion(false);
  }

  getSelectedConflictFileKey(
    mod: { name: string; path: string },
    filePath: string,
  ) {
    return `${mod.path}\u0000${filePath}`;
  }

  setConflictFileSelected(
    mod: { name: string; path: string },
    filePath: string,
    selected: boolean,
  ) {
    const key = this.getSelectedConflictFileKey(mod, filePath);

    if (selected) {
      this.selectedConflictFiles.set(key, { mod, filePath });
    } else {
      this.selectedConflictFiles.delete(key);
    }

    this.updateSelectedConflictFilesFooter();
  }

  updateSelectedConflictFilesFooter() {
    const button = document.querySelector<HTMLButtonElement>(
      '#conflict-delete-selected-footer-btn',
    );
    const label = button?.querySelector('span');
    const selectedCount = this.selectedConflictFiles.size;

    if (!button || !label) return;

    button.disabled = selectedCount === 0;
    label.textContent =
      selectedCount === 0
        ? this.t('modals.conflict.deleteSelectedFiles')
        : this.t('modals.conflict.deleteSelectedFilesCount', {
            count: selectedCount,
          });
  }

  async deleteSelectedConflictFiles() {
    if (!window.electronAPI?.deleteConflictFile || !window.modManager) {
      window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
        error: 'API not available',
      });
      return;
    }

    const selectedItems = Array.from(this.selectedConflictFiles.values());
    if (selectedItems.length === 0) return;

    const confirmed =
      await this.confirmSelectedConflictFilesDeletion(selectedItems);

    if (!confirmed) return;

    for (const item of selectedItems) {
      const result = await window.electronAPI.deleteConflictFile(
        item.mod.path,
        item.filePath,
      );

      if (!result.success) {
        window.toastManager?.error('toasts.failedToDeleteConflictFile', 5000, {
          error: result.error || 'Unknown error',
        });
        await this.refreshConflictsAfterConflictFileDeletion(false);
        return;
      }
    }

    window.toastManager?.success('toasts.conflictFilesDeleted', 3000, {
      count: selectedItems.length,
    });

    this.selectedConflictFiles.clear();
    this.updateSelectedConflictFilesFooter();
    await this.refreshConflictsAfterConflictFileDeletion(false);
  }

  async refreshConflictsAfterConflictFileDeletion(showDeletedToast = true) {
    if (showDeletedToast) {
      window.toastManager?.success('toasts.conflictFileDeleted', 3000);
    }

    await window.modManager.fetchMods();

    const whitelistPatterns =
      window.settingsManager?.settings.conflictWhitelistPatterns || [];
    const conflictResult = await window.modManager.checkConflicts(
      whitelistPatterns,
    );

    if (conflictResult.success && window.modManager.conflictGroups.length > 0) {
      await this.showConflictModal();
    } else {
      this.closeConflictModal();
      window.toastManager?.success('toasts.noConflictsDetected', 3000);
    }
  }

  async ignoreConflictPath(filePath: string) {
    if (!window.settingsManager || !window.modManager) {
      window.toastManager?.error('toasts.settingsManagerNotAvailable', 4000);
      return;
    }

    const added = await window.settingsManager.addIgnoredConflictPath(filePath, {
      refreshConflicts: false,
    });

    if (!added) {
      return;
    }

    const whitelistPatterns =
      window.settingsManager.settings.conflictWhitelistPatterns || [];
    const conflictResult = await window.modManager.checkConflicts(
      whitelistPatterns,
    );

    if (conflictResult.success && window.modManager.conflictGroups.length > 0) {
      await this.showConflictModal();
    } else {
      this.closeConflictModal();
      window.toastManager?.success('toasts.noConflictsDetected', 3000);
    }
  }

  async showConflictModal() {
    if (
      !window.modManager ||
      !window.modManager.conflictGroups ||
      window.modManager.conflictGroups.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>('#conflict-modal');
    const summaryEl = document.querySelector<HTMLElement>('#conflict-summary');
    const container = document.querySelector<HTMLElement>(
      '#conflict-list-container',
    );
    const headerBadge = document.querySelector<HTMLElement>(
      '#conflict-header-badge',
    );

    if (!modal || !summaryEl || !container) return;

    if (window.statusBarManager) {
      window.statusBarManager.preserveCurrentStatus();
    }

    const conflictGroups = window.modManager.conflictGroups;

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    // Calculate total conflicts
    const totalConflicts = conflictGroups.reduce(
      (sum, group) => sum + group.conflicts.length,
      0,
    );

    if (headerBadge) {
      headerBadge.textContent = t('modals.conflict.badge', {
        count: totalConflicts,
      });
    }

    summaryEl.textContent = t('modals.conflict.summary');

    container.innerHTML = '';
    this.selectedConflictFiles.clear();
    this.updateSelectedConflictFilesFooter();

    // Create grouped display
    conflictGroups.forEach((group) => {
      // Create group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'conflict-group-header';

      const groupTitle = document.createElement('h4');
      groupTitle.className = 'conflict-group-title';

      const fighterIcon = document.createElement('i');
      fighterIcon.className = 'bi bi-person-fill';

      const prettyFighterName = window.SSBU_CHARACTERS[group.fighter]?.name;

      const fighterName =
        group.fighter === 'unknown'
          ? t('modals.conflict.unknownFighter') || 'Unknown'
          : prettyFighterName || group.fighter;

      const slotName =
        group.slot === 'unknown'
          ? t('modals.conflict.unknownSlot') || 'Unknown'
          : group.slot;

      groupTitle.appendChild(fighterIcon);
      groupTitle.appendChild(
        document.createTextNode(` ${fighterName} - ${slotName}`),
      );

      const groupBadge = document.createElement('span');
      groupBadge.className = 'conflict-group-badge';
      groupBadge.textContent = `${group.conflicts.length} ${t('modals.conflict.conflictsLabel') || 'conflicts'}`;

      groupHeader.appendChild(groupTitle);
      groupHeader.appendChild(groupBadge);
      container.appendChild(groupHeader);

      // Create table for this group
      const table = document.createElement('table');
      table.className = 'conflict-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const thFile = document.createElement('th');
      thFile.className = 'conflict-th-file';
      const fileHeaderIcon = document.createElement('i');
      fileHeaderIcon.className = 'bi bi-file-earmark';
      thFile.appendChild(fileHeaderIcon);
      thFile.appendChild(
        document.createTextNode(` ${t('modals.conflict.fileHeader')}`),
      );

      const thMods = document.createElement('th');
      thMods.className = 'conflict-th-mods';
      const modsHeaderIcon = document.createElement('i');
      modsHeaderIcon.className = 'bi bi-people-fill';
      thMods.appendChild(modsHeaderIcon);
      thMods.appendChild(
        document.createTextNode(
          ` ${t('modals.conflict.conflictingModsHeader')}`,
        ),
      );

      headerRow.appendChild(thFile);
      headerRow.appendChild(thMods);
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      group.conflicts.forEach((conflict) => {
        const row = document.createElement('tr');
        row.className = 'conflict-table-row';

        const tdFile = document.createElement('td');
        tdFile.className = 'conflict-td-file';

        const fileCell = document.createElement('div');
        fileCell.className = 'conflict-file-cell';

        const filePath = document.createElement('span');
        filePath.className = 'conflict-file-path-text';
        filePath.textContent = conflict.filePath;

        const fileActions = document.createElement('div');
        fileActions.className = 'conflict-file-actions';

        const ignoreButton = document.createElement('button');
        ignoreButton.type = 'button';
        ignoreButton.className = 'conflict-ignore-file-btn';
        ignoreButton.setAttribute(
          'aria-label',
          this.t('modals.conflict.ignoreFileAria', {
            filePath: conflict.filePath,
          }),
        );
        ignoreButton.title = this.t('modals.conflict.ignoreFile');
        ignoreButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.ignoreConflictPath(conflict.filePath);
        });

        const ignoreIcon = document.createElement('i');
        ignoreIcon.className = 'bi bi-eye-slash';
        const ignoreLabel = document.createElement('span');
        ignoreLabel.textContent = this.t('modals.conflict.ignoreFile');

        ignoreButton.appendChild(ignoreIcon);
        ignoreButton.appendChild(ignoreLabel);
        fileActions.appendChild(ignoreButton);

        fileCell.appendChild(filePath);
        fileCell.appendChild(fileActions);
        tdFile.appendChild(fileCell);

        const tdMods = document.createElement('td');
        tdMods.className = 'conflict-td-mods';
        const modsList = document.createElement('div');
        modsList.className = 'conflict-mods-list';
        conflict.mods.forEach((mod) => {
          const modItem = document.createElement('div');
          modItem.className = 'conflict-mod-item';

          const selectLabel = document.createElement('label');
          selectLabel.className = 'conflict-mod-select-checkbox';

          const selectCheckbox = document.createElement('input');
          selectCheckbox.type = 'checkbox';
          selectCheckbox.setAttribute(
            'aria-label',
            this.t('modals.conflict.selectFileForDeletion', {
              modName: mod.name,
            }),
          );
          selectCheckbox.addEventListener('change', () => {
            this.setConflictFileSelected(
              mod,
              conflict.filePath,
              selectCheckbox.checked,
            );
          });

          selectLabel.appendChild(selectCheckbox);

          const modWarningIcon = document.createElement('i');
          modWarningIcon.className = 'bi bi-exclamation-circle-fill';
          const modName = document.createElement('span');
          modName.textContent = mod.name;
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.className = 'conflict-delete-file-btn';
          deleteButton.title = this.t('modals.conflict.deleteFileFromMod', {
            modName: mod.name,
          });
          deleteButton.setAttribute('aria-label', deleteButton.title);
          deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.deleteConflictFile(mod, conflict.filePath);
          });
          const deleteIcon = document.createElement('i');
          deleteIcon.className = 'bi bi-trash3';
          deleteButton.appendChild(deleteIcon);
          modItem.appendChild(selectLabel);
          modItem.appendChild(modWarningIcon);
          modItem.appendChild(modName);
          modItem.appendChild(deleteButton);
          modsList.appendChild(modItem);
        });
        tdMods.appendChild(modsList);

        row.appendChild(tdFile);
        row.appendChild(tdMods);
        tbody.appendChild(row);
      });

      table.appendChild(tbody);

      const listWrapper = document.createElement('div');
      listWrapper.className = 'conflict-list';
      listWrapper.appendChild(table);
      container.appendChild(listWrapper);
    });

    modal.classList.remove('closing');
    if (window.modalManager) {
      window.modalManager.showOverlay();
    }
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }
  }

  closeConflictModal(keepOverlay = false) {
    const modal = document.querySelector<HTMLElement>('#conflict-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    if (window.modalManager && !keepOverlay) {
      window.modalManager.hideOverlay();
    }
    if (window.statusBarManager && !keepOverlay) {
      setTimeout(() => {
        if (!window.statusBarManager.hasModalOpen()) {
          window.statusBarManager.restorePreservedStatus();
        }
      }, 350);
    }
  }

  closeSlotChangeModal() {
    const modal = document.querySelector<HTMLElement>('#conflict-slot-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }
    this.currentConflictFile = null;
    this.currentConflictingMods = [];
  }

  closeDisableModModal() {
    const modal = document.querySelector<HTMLElement>(
      '#conflict-disable-mod-modal',
    );
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }
  }

  async selectModForSlotChange(selectedMod) {
    this.closeSlotChangeModal();

    if (!window.modManager || !window.modManager.operations) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }
      return;
    }

    await window.modManager.operations.startChangeSlotsFlow(selectedMod);
  }

  _getModsMap() {
    const modsMap: Map<string, SimpleMod> = new Map();

    window.modManager.conflictGroups.forEach((group) => {
      group.conflicts.forEach((conflict) => {
        conflict.mods.forEach((mod) => {
          if (!modsMap.has(mod.path)) {
            const fullMod = window.modManager.mods.find(
              (m) => m.path === mod.path,
            );

            modsMap.set(mod.path, {
              name: mod.name,
              path: mod.path,
              category: fullMod ? fullMod.category : null,
            });
          }
        });
      });
    });

    return modsMap;
  }

  _getDisableModCandidates(): DisableModCandidate[] {
    const modsMap: Map<
      string,
      SimpleMod & {
        conflictCount: number;
        conflictsWith: Map<string, { name: string; path: string }>;
      }
    > = new Map();

    window.modManager.conflictGroups.forEach((group) => {
      group.conflicts.forEach((conflict) => {
        conflict.mods.forEach((mod) => {
          const fullMod = window.modManager.mods.find(
            (candidate) => candidate.path === mod.path,
          );

          if (fullMod?.status === 'disabled') {
            return;
          }

          let candidate = modsMap.get(mod.path);

          if (!candidate) {
            candidate = {
              name: mod.name,
              path: mod.path,
              category: fullMod ? fullMod.category : null,
              conflictCount: 0,
              conflictsWith: new Map(),
            };
            modsMap.set(mod.path, candidate);
          }

          candidate.conflictCount += 1;

          conflict.mods.forEach((otherMod) => {
            if (otherMod.path === mod.path) {
              return;
            }

            candidate.conflictsWith.set(otherMod.path, {
              name: otherMod.name,
              path: otherMod.path,
            });
          });
        });
      });
    });

    return Array.from(modsMap.values()).map((mod) => ({
      name: mod.name,
      path: mod.path,
      category: mod.category,
      conflictCount: mod.conflictCount,
      conflictsWith: Array.from(mod.conflictsWith.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  }

  async selectModForDisable(selectedMod: SimpleMod) {
    this.closeDisableModModal();

    if (!window.electronAPI?.toggleMod || !window.modManager?.modsPath) {
      window.toastManager?.error('toasts.cannotToggleModStatus');
      return;
    }

    const fullMod = window.modManager.mods.find(
      (mod) => mod.path === selectedMod.path,
    );

    if (fullMod?.status === 'disabled') {
      window.toastManager?.success('toasts.modDisabled');
      return;
    }

    const result = await window.electronAPI.toggleMod(
      selectedMod.path,
      window.modManager.modsPath,
    );

    if (!result.success) {
      window.toastManager?.error('toasts.failedToToggleMod', 3000, {
        error: result.error || 'Unknown error',
      });
      return;
    }

    if (result.isNowActive) {
      window.toastManager?.error('toasts.failedToToggleMod', 3000, {
        error: 'Selected mod was already disabled',
      });
      await window.modManager.fetchMods();
      return;
    }

    window.toastManager?.success('toasts.modDisabled');
    await window.modManager.fetchMods();

    const whitelistPatterns =
      window.settingsManager?.settings.conflictWhitelistPatterns || [];
    const conflictResult = await window.modManager.checkConflicts(
      whitelistPatterns,
    );

    if (conflictResult.success && window.modManager.conflictGroups.length > 0) {
      await this.showConflictModal();
    } else {
      this.closeConflictModal();
      window.toastManager?.success('toasts.noConflictsDetected', 3000);
    }
  }

  openGlobalSlotChange() {
    if (
      !window.modManager ||
      !window.modManager.conflictGroups ||
      window.modManager.conflictGroups.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>('#conflict-slot-modal');
    const container = document.querySelector<HTMLElement>(
      '#conflict-mod-select-container',
    );

    if (!modal || !container) return;

    const modsMap = this._getModsMap();
    const uniqueMods = Array.from(modsMap.values());

    if (uniqueMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsFoundInConflicts');
      }
      return;
    }

    container.innerHTML = '';

    uniqueMods.forEach((mod) => {
      const selectItem = document.createElement('div');
      selectItem.className = 'conflict-mod-select-item';
      selectItem.addEventListener('click', () => {
        this.selectModForSlotChange(mod);
      });

      const icon = document.createElement('i');
      icon.className = 'bi bi-folder-fill';

      const name = document.createElement('div');
      name.className = 'conflict-mod-select-item-name';
      name.textContent = mod.name;

      selectItem.appendChild(icon);
      selectItem.appendChild(name);
      container.appendChild(selectItem);
    });

    this.closeConflictModal(true);

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    setTimeout(() => {
      modal.classList.remove('closing');
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }, 100);
  }

  openDisableModModal() {
    if (
      !window.modManager ||
      !window.modManager.conflictGroups ||
      window.modManager.conflictGroups.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>(
      '#conflict-disable-mod-modal',
    );
    const container = document.querySelector<HTMLElement>(
      '#conflict-disable-mod-select-container',
    );

    if (!modal || !container) return;

    const uniqueMods = this._getDisableModCandidates();

    if (uniqueMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsFoundInConflicts');
      }
      return;
    }

    container.innerHTML = '';

    uniqueMods.forEach((mod) => {
      const selectItem = document.createElement('div');
      selectItem.className = 'conflict-mod-select-item';
      selectItem.addEventListener('click', () => {
        this.selectModForDisable(mod);
      });

      const icon = document.createElement('i');
      icon.className = 'bi bi-toggle-off';

      const details = document.createElement('div');
      details.className = 'conflict-mod-select-item-content';

      const name = document.createElement('div');
      name.className = 'conflict-mod-select-item-name';
      name.textContent = mod.name;

      const conflictsWithNames = mod.conflictsWith
        .map((conflictingMod) => conflictingMod.name)
        .join(', ');

      const meta = document.createElement('div');
      meta.className = 'conflict-mod-select-item-meta';
      meta.textContent = [
        this.t('modals.conflictDisable.conflictFiles', {
          count: mod.conflictCount,
          plural: mod.conflictCount > 1 ? 's' : '',
        }),
        this.t('modals.conflictDisable.conflictsWith', {
          mods: conflictsWithNames,
        }),
      ].join(' • ');
      meta.title = conflictsWithNames;

      details.appendChild(name);
      details.appendChild(meta);

      selectItem.appendChild(icon);
      selectItem.appendChild(details);
      container.appendChild(selectItem);
    });

    this.closeConflictModal(true);

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    setTimeout(() => {
      modal.classList.remove('closing');
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }, 100);
  }


  openAutoSlotChangeModal() {
    if (
      !window.modManager ||
      !window.modManager.conflictGroups ||
      window.modManager.conflictGroups.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-modal',
    );
    const container = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-mod-list',
    );

    if (!modal || !container) return;

    const extendedRangeToggle = document.querySelector<HTMLInputElement>(
      '#conflict-auto-slot-extended-range',
    );
    if (extendedRangeToggle) {
      extendedRangeToggle.checked = false;
    }

    const modsMap = this._getModsMap();

    this.autoSlotChangeMods = Array.from(modsMap.values());

    if (this.autoSlotChangeMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsFoundInConflicts');
      }

      return;
    }

    container.innerHTML = '';

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    this.autoSlotChangeMods.forEach((mod, index) => {
      const modItem = document.createElement('div');
      modItem.className = 'conflict-auto-slot-mod-item';

      const isStage = mod.category && mod.category.toLowerCase() === 'stages';
      if (isStage) {
        modItem.classList.add('conflict-auto-slot-mod-item-stage');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `auto-slot-mod-${index}`;
      checkbox.className = 'conflict-auto-slot-checkbox';
      checkbox.checked = !!isStage;
      checkbox.dataset.modPath = mod.path;

      const label = document.createElement('label');
      label.htmlFor = `auto-slot-mod-${index}`;
      label.className = 'conflict-auto-slot-label';

      const icon = document.createElement('i');
      icon.className = isStage ? 'bi bi-image-fill' : 'bi bi-folder-fill';

      const name = document.createElement('span');
      name.className = 'conflict-auto-slot-mod-name';
      name.textContent = mod.name;

      if (isStage) {
        const stageBadge = document.createElement('span');
        stageBadge.className = 'conflict-auto-slot-stage-badge';
        stageBadge.textContent = t('modals.autoSlotChange.stageMod');
        label.appendChild(icon);
        label.appendChild(name);
        label.appendChild(stageBadge);
      } else {
        label.appendChild(icon);
        label.appendChild(name);
      }

      modItem.appendChild(checkbox);
      modItem.appendChild(label);
      container.appendChild(modItem);
    });

    this.closeConflictModal(true);

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    setTimeout(() => {
      modal.classList.remove('closing');
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }, 100);
  }

  closeAutoSlotChangeModal() {
    const modal = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-modal',
    );

    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }

    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }

    this.autoSlotChangeMods = [];
  }

  async applyAutoSlotChanges() {
    if (!window.modManager || !window.modManager.modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }
      return;
    }

    const excludedModPaths = new Set();
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      '.conflict-auto-slot-checkbox:checked',
    );

    checkboxes.forEach((checkbox) => {
      excludedModPaths.add(checkbox.dataset.modPath);
    });

    const modsToChange = this.autoSlotChangeMods.filter(
      (mod) => !excludedModPaths.has(mod.path),
    );

    if (modsToChange.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsToChange');
      }

      return;
    }

    this.closeAutoSlotChangeModal();

    if (window.toastManager) {
      window.toastManager.info('toasts.processingSlotChanges');
    }

    let successCount = 0;
    let errorCount = 0;

    const errors: string[] = [];
    const changingModPaths = new Set(modsToChange.map((mod) => mod.path));
    const allowExtendedSlots = !!document.querySelector<HTMLInputElement>(
      '#conflict-auto-slot-extended-range',
    )?.checked;
    const maxCandidateSlot = allowExtendedSlots ? 32 : 15;
    const candidateSlots = Array.from(
      { length: maxCandidateSlot + 1 },
      (_, index) => `c${index.toString().padStart(2, '0')}`,
    );
    const occupiedSlotsByFighter = new Map<string, Set<string>>();

    const reserveSlot = (fighterId: string, slotName: string) => {
      if (!occupiedSlotsByFighter.has(fighterId)) {
        occupiedSlotsByFighter.set(fighterId, new Set());
      }

      occupiedSlotsByFighter.get(fighterId)!.add(slotName);
    };

    const getFreeSlot = (
      fighterId: string,
      currentSlots: Set<string>,
      reservedSlots: Set<string>,
    ): string | null => {
      const occupiedSlots =
        occupiedSlotsByFighter.get(fighterId) || new Set<string>();

      const preferredSlot = candidateSlots.find(
        (slotName) =>
          !currentSlots.has(slotName) &&
          !occupiedSlots.has(slotName) &&
          !reservedSlots.has(slotName),
      );

      if (preferredSlot) {
        return preferredSlot;
      }

      return (
        candidateSlots.find(
          (slotName) =>
            !occupiedSlots.has(slotName) && !reservedSlots.has(slotName),
        ) || null
      );
    };

    if (window.electronAPI?.scanMod && window.modManager.mods) {
      const occupiedMods = window.modManager.mods.filter(
        (mod) =>
          mod.status !== 'disabled' &&
          !!mod.path &&
          !changingModPaths.has(mod.path),
      );

      for (const occupiedMod of occupiedMods) {
        try {
          const scanModResult = await window.electronAPI.scanMod(
            occupiedMod.path,
          );

          if (!scanModResult.success || !scanModResult.data?.pathData) {
            continue;
          }

          Object.entries(scanModResult.data.pathData).forEach(
            ([fighterId, fighterData]) => {
              Object.keys(fighterData as Record<string, unknown>).forEach(
                (slotName) => {
                  reserveSlot(fighterId, slotName);
                },
              );
            },
          );
        } catch (error) {
          console.warn(
            `Unable to scan occupied slots for ${occupiedMod.name}:`,
            error,
          );
        }
      }
    }

    for (const mod of modsToChange) {
      try {
        if (!window.electronAPI || !window.electronAPI.scanMod) {
          errors.push(`${mod.name}: API not available`);
          errorCount++;
          continue;
        }

        const scanModResult = await window.electronAPI.scanMod(mod.path);

        if (
          !scanModResult.success ||
          !(Object.keys(scanModResult.data.pathData).length > 0)
        ) {
          continue;
        }

        if (scanModResult.data.currentSlots.length === 0) {
          continue;
        }

        const slotAssignmentsByFighter = new Map<string, Map<string, string>>();
        const reservedSlotsByFighter = new Map<string, Set<string>>();
        let hasMissingSlot = false;

        for (const fighterId of Object.keys(scanModResult.data.pathData)) {
          const fighterSlots = Object.keys(
            scanModResult.data.pathData[fighterId],
          ).sort();
          const currentSlots = new Set(fighterSlots);

          const slotAssignments = new Map<string, string>();
          const reservedSlots = new Set<string>();
          reservedSlotsByFighter.set(fighterId, reservedSlots);

          for (const originalSlot of fighterSlots) {
            const availableSlotName = getFreeSlot(
              fighterId,
              currentSlots,
              reservedSlots,
            );

            if (!availableSlotName) {
              errors.push(
                `${mod.name}: No available slot for ${fighterId}/${originalSlot}`,
              );
              errorCount++;
              hasMissingSlot = true;
              break;
            }

            slotAssignments.set(originalSlot, availableSlotName);
            reservedSlots.add(availableSlotName);
          }

          if (hasMissingSlot) break;

          slotAssignmentsByFighter.set(fighterId, slotAssignments);
        }

        if (hasMissingSlot) {
          continue;
        }

        if (slotAssignmentsByFighter.size > 0) {
          if (window.electronAPI && window.electronAPI.changeSlots) {
            const applyResult = await window.electronAPI.changeSlots(
              mod.path,
              scanModResult.data.pathData,
              slotAssignmentsByFighter,
              new Map(),
            );

            if (applyResult.success) {
              reservedSlotsByFighter.forEach((slots, fighterId) => {
                slots.forEach((slotName) => reserveSlot(fighterId, slotName));
              });
              successCount++;
            } else {
              errors.push(
                `${mod.name}: ${applyResult.error || 'Failed to apply changes'}`,
              );
              errorCount++;
            }
          } else {
            errors.push(`${mod.name}: Cannot apply slot changes`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing mod ${mod.name}:`, error);
        errors.push(`${mod.name}: ${error.message}`);
        errorCount++;
      }
    }

    if (successCount > 0) {
      await window.modManager.fetchMods();

      if (
        window.settingsManager &&
        window.settingsManager.settings.conflictDetectionEnabled
      ) {
        const whitelistPatterns =
          window.settingsManager.settings.conflictWhitelistPatterns || [];

        setTimeout(() => {
          window.modManager.checkConflicts(whitelistPatterns);
        }, 500);
      }
    }

    if (window.toastManager) {
      if (errorCount === 0) {
        window.toastManager.success('toasts.slotChangesSuccess', 3000, {
          count: successCount,
        });
      } else if (successCount > 0) {
        window.toastManager.warning('toasts.slotChangesPartialSuccess', 5000, {
          success: successCount,
          error: errorCount,
        });
      } else {
        const t = (key, params = {}) => {
          return window.i18n && window.i18n.t
            ? window.i18n.t(key, params)
            : key;
        };

        window.toastManager.error(
          'toasts.slotChangesFailed',
          5000,
          { count: errorCount },
          {
            actionButton:
              errorCount > 0
                ? {
                    text: t('toasts.viewLogs'),

                    onClick: () => {
                      const settingsBtn = document.querySelector<HTMLElement>(
                        '[data-tab="settings"]',
                      );

                      if (settingsBtn) {
                        settingsBtn.click();
                      }

                      setTimeout(() => {
                        if (window.settingsManager) {
                          window.settingsManager.switchSettingsTab('logs');

                          if (window.logsManager) {
                            setTimeout(() => {
                              window.logsManager.reinitialize();
                            }, 250);
                          }
                        }
                      }, 500);
                    },
                  }
                : undefined,
          },
        );
      }
    }

    if (errors.length > 0) {
      console.error('Auto slot change errors:', errors);
    }
  }
}

if (typeof window !== 'undefined') {
  window.conflictModalManager = new ConflictModalManager();
}
