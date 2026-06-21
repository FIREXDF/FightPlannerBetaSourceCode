import type { ModManager } from './mod-manager';

class ModContextMenuHandler {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
    this.setupContextMenu();
  }

  setupContextMenu() {
    document.addEventListener('click', (e) => {
      const contextMenu =
        document.querySelector<HTMLElement>('#mod-context-menu');

      const target = e.target as HTMLElement;

      if (
        contextMenu &&
        !contextMenu.contains(target) &&
        contextMenu.style.display !== 'none'
      ) {
        this.closeContextMenu();
      }
    });

    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');

    if (contextMenu) {
      contextMenu.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.context-menu-item') as HTMLElement;

        if (!item) return;

        const action = item.dataset.action;
        const modId = contextMenu.dataset.modId;
        const useSelection = contextMenu.dataset.useSelection === 'true';
        const mod = this.modManager.mods.find((m) => m.id === modId);

        if (!mod) return;

        this.closeContextMenu();

        if (this.modManager.operations) {
          switch (action) {
            case 'rename':
              await this.modManager.operations.renameMod(mod);
              break;
            case 'change-slot':
              await this.modManager.operations.startChangeSlotsFlow(mod);
              break;
            case 'toggle':
              if (useSelection) {
                await this.modManager.operations.toggleModsStatus(
                  this.modManager.getCurrentSelectedMods(),
                  mod.status === 'disabled' ? 'active' : 'disabled',
                );
              } else {
                await this.modManager.operations.toggleModStatus(mod);
              }
              break;
            case 'open-folder':
              await this.modManager.operations.openModFolder(mod);
              break;
            case 'uninstall':
              if (useSelection) {
                await this.modManager.operations.uninstallMods(
                  this.modManager.getCurrentSelectedMods(),
                );
              } else {
                await this.modManager.operations.uninstallMod(mod);
              }
              break;
          }
        }
      });
    }
  }

  closeContextMenu() {
    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');
    if (!contextMenu) return;

    const noAnimations = document.body.classList.contains('no-animations');

    if (noAnimations) {
      contextMenu.style.display = 'none';
    } else {
      contextMenu.classList.add('closing');

      setTimeout(() => {
        contextMenu.style.display = 'none';
        contextMenu.classList.remove('closing');
      }, 150);
    }
  }

  showContextMenu(e, mod) {
    e.preventDefault();

    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');
    if (!contextMenu) return;

    const toggleText = document.querySelector<HTMLElement>('#toggle-text');
    const toggleIcon = document.querySelector<HTMLElement>('#toggle-icon');
    const uninstallText = contextMenu.querySelector<HTMLElement>(
      '[data-action="uninstall"] span',
    );

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };
    const selectedMods = this.modManager.getCurrentSelectedMods();
    const useSelection =
      selectedMods.length > 1 &&
      selectedMods.some((selectedMod) => selectedMod.id === mod.id);

    if (mod.status === 'disabled') {
      if (toggleText) {
        toggleText.textContent = useSelection
          ? t('contextMenu.enableSelected', {
              count: selectedMods.length,
            })
          : t('contextMenu.enable');
      }
      if (toggleIcon) toggleIcon.className = 'bi bi-toggle-off';
    } else {
      if (toggleText) {
        toggleText.textContent = useSelection
          ? t('contextMenu.disableSelected', {
              count: selectedMods.length,
            })
          : t('contextMenu.disable');
      }
      if (toggleIcon) toggleIcon.className = 'bi bi-toggle-on';
    }

    contextMenu.dataset.modId = mod.id;
    contextMenu.dataset.useSelection = useSelection ? 'true' : 'false';

    if (uninstallText) {
      uninstallText.textContent = useSelection
        ? t('contextMenu.uninstallSelected', {
            count: selectedMods.length,
          })
        : t('contextMenu.uninstall');
    }

    contextMenu.style.visibility = 'hidden';
    contextMenu.style.display = 'block';

    void contextMenu.offsetWidth;

    const rectWidth = contextMenu.offsetWidth;
    const rectHeight = contextMenu.offsetHeight;

    contextMenu.style.display = 'none';
    contextMenu.style.visibility = '';

    let left = e.clientX;
    let top = e.clientY;

    if (left + rectWidth > window.innerWidth) {
      left = window.innerWidth - rectWidth - 10;
    }

    if (top + rectHeight > window.innerHeight) {
      top = e.clientY - rectHeight;
      if (top < 10) top = 10;
    }

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    void contextMenu.offsetWidth;
    contextMenu.style.display = 'block';
  }
}

if (typeof window !== 'undefined') {
  window.ModContextMenuHandler = ModContextMenuHandler;
}

export { type ModContextMenuHandler };
