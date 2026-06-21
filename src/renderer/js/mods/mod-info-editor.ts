class ModInfoEditor {
  currentModPath: string | null;
  currentInfo: any | null;

  constructor() {
    this.currentModPath = null;
    this.currentInfo = null;
  }

  handleClick() {
    if (!window.modInfoManager) {
      return;
    }

    const modPath = window.modInfoManager.currentModPath;
    const modData = window.modInfoManager.currentModData;

    if (!modPath) {
      if (window.modalManager) {
        window.modalManager.showAlert('error', 'Error', 'No mod selected');
      }
      return;
    }

    this.openEditor(modPath, modData);
  }

  openEditor(modPath, currentInfo) {
    this.currentModPath = modPath;
    this.currentInfo = currentInfo;

    if (window.modalManager) {
      window.modalManager.openEditInfoModal(modPath, currentInfo, (info) => {
        this.saveInfo(info);
      });
    }
  }

  async openAdvancedMode() {
    if (!this.currentModPath) return;

    window.modalManager.closeEditInfoModal();

    try {
      const rawContent = await window.electronAPI.readModInfoRaw(
        this.currentModPath,
      );

      setTimeout(() => {
        window.modalManager.openAdvancedInfoModal(
          this.currentModPath,
          rawContent,
        );
      }, 350);
    } catch (error) {
      window.modalManager.showAlert(
        'error',
        'Error',
        'Failed to load info.toml content',
      );
    }
  }

  async saveInfo(info) {
    try {
      const result = await window.electronAPI.saveModInfo(
        this.currentModPath!,
        info,
      );

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.infoTomlSaved');
        }

        if (window.modManager && window.modManager.selectedMod) {
          await window.modManager.selectMod(window.modManager.selectedMod.id);
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
            error: result.error,
          });
        }
      }
    } catch (error) {
      console.error('Error saving mod info:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
          error: '',
        });
      }
    }
  }
}

window.modInfoEditor = new ModInfoEditor();

export { type ModInfoEditor };
