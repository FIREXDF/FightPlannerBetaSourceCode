import type { Mod, ModManager } from './mod-manager';

class ModKeybindsHandler {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
    this.setupKeybinds();
  }

  setupKeybinds() {
    document.addEventListener('keydown', async (e) => {
      const activeTab = document.querySelector<HTMLElement>(
        '.tab-content.active',
      );
      if (!activeTab || activeTab.id !== 'tab-tools') {
        return;
      }

      const visibleModal = document.querySelector<HTMLElement>(
        '.modal[style*="display: block"]',
      );
      if (visibleModal) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;

      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable)
      ) {
        return;
      }

      const selectedMods = this.modManager.getCurrentSelectedMods();
      const selectedMod = selectedMods[0] || this.modManager.selectedMod;

      if (!selectedMod) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (isCtrlOrCmd || e.key === 'Delete') {
            e.preventDefault();
            await this.handleDelete(selectedMods.length > 0 ? selectedMods : [selectedMod]);
          }
          break;

        case ' ':
        case 'Space':
          if (!isCtrlOrCmd && !isShift) {
            e.preventDefault();
            await this.handleToggle(
              selectedMods.length > 0 ? selectedMods : [selectedMod],
            );
          }
          break;

        case 'F2':
          e.preventDefault();
          await this.handleRename(selectedMod);
          break;

        case 'Enter':
          if (isCtrlOrCmd) {
            e.preventDefault();
            await this.handleOpenFolder(selectedMod);
          } else if (!isShift) {
            e.preventDefault();
            await this.handleOpenModFile(selectedMod);
          }
          break;

        case 'o':
        case 'O':
          if (isCtrlOrCmd && isShift) {
            e.preventDefault();
            await this.handleOpenFolder(selectedMod);
          } else if (isCtrlOrCmd) {
            e.preventDefault();
            await this.handleOpenModsFolder();
          }
          break;
      }
    });
  }

  async handleDelete(selectedMods: Mod[]) {
    if (this.modManager.operations) {
      if (selectedMods.length > 1) {
        await this.modManager.operations.uninstallMods(selectedMods);
      } else if (selectedMods[0]) {
        await this.modManager.operations.uninstallMod(selectedMods[0]);
      }
    }
  }

  async handleToggle(selectedMods: Mod[]) {
    if (this.modManager.operations) {
      if (selectedMods.length > 1) {
        await this.modManager.operations.toggleModsStatus(
          selectedMods,
          selectedMods[0].status === 'disabled' ? 'active' : 'disabled',
        );
      } else if (selectedMods[0]) {
        await this.modManager.operations.toggleModStatus(selectedMods[0]);
      }
    }
  }

  async handleRename(selectedMod: Mod) {
    if (this.modManager.operations) {
      await this.modManager.operations.renameMod(selectedMod);
    }
  }

  async handleOpenFolder(selectedMod: Mod) {
    if (this.modManager.operations) {
      await this.modManager.operations.openModFolder(selectedMod);
    }
  }

  async handleOpenModFile(selectedMod: Mod) {
    if (!selectedMod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotOpenFile');
      }
      return;
    }

    if (!window.electronAPI || !window.electronAPI.openFile) {
      if (this.modManager.operations) {
        await this.modManager.operations.openModFolder(selectedMod);
      }
      return;
    }

    const commonFiles = [
      'info.toml',
      'config.json',
      'mod.json',
      'info.json',
      'modinfo.json',
      'meta.json',
      'readme.txt',
      'readme.md',
      'README.txt',
      'README.md',
    ];

    for (const fileName of commonFiles) {
      const filePath = `${selectedMod.path}/${fileName}`;
      const result = await window.electronAPI.openFile(filePath);
      if (result && result.success) {
        return;
      }
    }

    if (this.modManager.operations) {
      await this.modManager.operations.openModFolder(selectedMod);
    }
  }

  async handleOpenModsFolder() {
    if (
      window.electronAPI &&
      window.electronAPI.openFolder &&
      this.modManager.modsPath
    ) {
      const result = await window.electronAPI.openFolder(
        this.modManager.modsPath,
      );
      if (!result.success) {
        if (window.toastManager) {
          window.toastManager.error(
            `Failed to open mods folder: ${result.error}`,
          );
        }
      }
    } else {
      if (window.toastManager) {
        window.toastManager.error(
          'Cannot open mods folder - path not available',
        );
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.ModKeybindsHandler = ModKeybindsHandler;
}

export { type ModKeybindsHandler };
