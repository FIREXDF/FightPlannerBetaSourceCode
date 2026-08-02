import type { Mod, ModManager } from './mod-manager';

class ModContextMenuHandler {
  modManager: ModManager;
  fileBrowserDialog: HTMLDialogElement | null = null;
  fileBrowserRequestId = 0;
  filePreviewRequestId = 0;

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
            case 'browse-files':
              await this.openFileBrowser(mod);
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

  private translate(key: string, fallback: string) {
    const value = window.i18n?.t?.(key);
    return value && value !== key ? value : fallback;
  }

  private ensureFileBrowserDialog() {
    if (this.fileBrowserDialog) return this.fileBrowserDialog;

    const dialog = document.createElement('dialog');
    dialog.className = 'mod-file-browser';
    dialog.setAttribute('aria-labelledby', 'mod-file-browser-title');
    dialog.innerHTML = `
      <div class="mod-file-browser-shell">
        <header class="mod-file-browser-header">
          <div class="mod-file-browser-heading">
            <h3 id="mod-file-browser-title"></h3>
            <p data-file-browser-mod-name></p>
          </div>
          <button type="button" class="mod-file-browser-action" data-file-browser-open-folder>
            <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
            <span></span>
          </button>
          <button type="button" class="mod-file-browser-close" data-file-browser-close>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>
        <div class="mod-file-browser-body">
          <section class="mod-file-browser-pane" aria-labelledby="mod-file-tree-title">
            <h4 class="mod-file-browser-pane-title" id="mod-file-tree-title"></h4>
            <div class="mod-file-tree" data-file-browser-tree></div>
          </section>
          <section class="mod-file-browser-pane" aria-labelledby="mod-file-preview-title">
            <h4 class="mod-file-browser-pane-title" id="mod-file-preview-title"></h4>
            <div class="mod-file-preview" data-file-browser-preview></div>
          </section>
        </div>
      </div>
    `;

    dialog
      .querySelector<HTMLElement>('[data-file-browser-close]')
      ?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeFileBrowser();
      });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.closeFileBrowser();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.closeFileBrowser();
    });
    dialog.addEventListener('close', () => {
      dialog.classList.remove('closing');
    });
    document.body.appendChild(dialog);
    this.fileBrowserDialog = dialog;
    return dialog;
  }

  private closeFileBrowser() {
    const dialog = this.fileBrowserDialog;
    if (!dialog?.open || dialog.classList.contains('closing')) return;

    const animationsDisabled =
      document.body.classList.contains('no-animations');
    if (animationsDisabled) {
      dialog.close();
      return;
    }

    dialog.classList.add('closing');
    const reducedMotion =
      document.body.classList.contains('reduced-animations') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => dialog.close(), reducedMotion ? 150 : 250);
  }

  private setFileBrowserEmptyPreview(dialog: HTMLDialogElement) {
    const preview = dialog.querySelector<HTMLElement>(
      '[data-file-browser-preview]',
    );
    if (!preview) return;

    preview.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'mod-file-preview-empty';
    const icon = document.createElement('i');
    icon.className = 'bi bi-file-earmark-text';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = this.translate(
      'modFileBrowser.selectFile',
      'Select a file to preview it.',
    );
    empty.append(icon, label);
    preview.appendChild(empty);
  }

  private renderTreeMessage(container: HTMLElement, message: string) {
    container.replaceChildren();
    const state = document.createElement('div');
    state.className = 'mod-tree-message';
    state.textContent = message;
    container.appendChild(state);
  }

  private formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async renderDirectory(
    container: HTMLElement,
    modPath: string,
    relativePath: string,
    requestId: number,
  ) {
    const result = await window.electronAPI.readModDirectory(
      modPath,
      relativePath,
    );

    if (requestId !== this.fileBrowserRequestId) return;

    if (!result.success) {
      this.renderTreeMessage(
        container,
        this.translate(
          'modFileBrowser.loadError',
          'Unable to load this folder.',
        ),
      );
      return;
    }

    container.replaceChildren();
    if (result.entries.length === 0) {
      this.renderTreeMessage(
        container,
        this.translate('modFileBrowser.emptyFolder', 'This folder is empty.'),
      );
      return;
    }

    const list = document.createElement('ul');
    list.className = 'mod-tree-list';

    result.entries.forEach((entry) => {
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mod-tree-row';
      row.title = entry.relativePath;

      const chevron = document.createElement('i');
      chevron.className =
        entry.type === 'directory'
          ? 'bi bi-chevron-right mod-tree-chevron'
          : 'mod-tree-chevron';
      chevron.setAttribute('aria-hidden', 'true');

      const icon = document.createElement('i');
      icon.className =
        entry.type === 'directory' ? 'bi bi-folder-fill' : 'bi bi-file-earmark';
      icon.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'mod-tree-name';
      name.textContent = entry.name;
      row.append(chevron, icon, name);

      if (entry.type === 'file') {
        const size = document.createElement('span');
        size.className = 'mod-tree-size';
        size.textContent = this.formatFileSize(entry.size);
        row.appendChild(size);
        row.addEventListener('click', () => {
          this.fileBrowserDialog
            ?.querySelectorAll('.mod-tree-row.is-selected')
            .forEach((selected) => selected.classList.remove('is-selected'));
          row.classList.add('is-selected');
          void this.previewFile(modPath, entry.relativePath, requestId);
        });
      } else {
        row.setAttribute('aria-expanded', 'false');
        const children = document.createElement('div');
        children.className = 'mod-tree-children';
        children.hidden = true;
        let loaded = false;

        row.addEventListener('click', async () => {
          const expanded = row.getAttribute('aria-expanded') === 'true';
          row.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          children.hidden = expanded;
          icon.className = expanded
            ? 'bi bi-folder-fill'
            : 'bi bi-folder2-open';

          if (!expanded && !loaded) {
            loaded = true;
            this.renderTreeMessage(children, '…');
            await this.renderDirectory(
              children,
              modPath,
              entry.relativePath,
              requestId,
            );
          }
        });
        item.append(row, children);
        list.appendChild(item);
        return;
      }

      item.appendChild(row);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  private async previewFile(
    modPath: string,
    relativePath: string,
    requestId: number,
  ) {
    const dialog = this.fileBrowserDialog;
    const preview = dialog?.querySelector<HTMLElement>(
      '[data-file-browser-preview]',
    );
    if (!dialog || !preview) return;

    const previewRequestId = ++this.filePreviewRequestId;
    this.renderTreeMessage(preview, '…');
    const result = await window.electronAPI.readModFilePreview(
      modPath,
      relativePath,
    );
    if (
      requestId !== this.fileBrowserRequestId ||
      previewRequestId !== this.filePreviewRequestId
    ) {
      return;
    }

    preview.replaceChildren();
    if (!result.success) {
      this.renderTreeMessage(
        preview,
        this.translate(
          'modFileBrowser.previewError',
          'Unable to preview this file.',
        ),
      );
      return;
    }

    const meta = document.createElement('div');
    meta.className = 'mod-file-preview-meta';
    const filePath = document.createElement('span');
    filePath.className = 'mod-file-preview-path';
    filePath.textContent = relativePath;
    const size = document.createElement('span');
    size.textContent = this.formatFileSize(result.size);
    meta.append(filePath, size);
    preview.appendChild(meta);

    if (!result.previewable || result.content === null) {
      const empty = document.createElement('div');
      empty.className = 'mod-file-preview-empty';
      const icon = document.createElement('i');
      icon.className = 'bi bi-file-earmark-binary';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = this.translate(
        'modFileBrowser.binaryFile',
        'Preview is not available for this file type.',
      );
      empty.append(icon, label);
      preview.appendChild(empty);
      return;
    }

    const content = document.createElement('pre');
    content.textContent = result.content;
    preview.appendChild(content);

    if (result.truncated) {
      const note = document.createElement('p');
      note.className = 'mod-file-preview-note';
      note.textContent = this.translate(
        'modFileBrowser.truncated',
        'Preview limited to the first 256 KB.',
      );
      preview.appendChild(note);
    }
  }

  private async openFileBrowser(mod: Mod) {
    if (!mod.path) {
      window.toastManager?.error('toasts.cannotOpenFolder');
      return;
    }

    const dialog = this.ensureFileBrowserDialog();
    const requestId = ++this.fileBrowserRequestId;
    this.filePreviewRequestId++;
    const title = dialog.querySelector<HTMLElement>('#mod-file-browser-title');
    const modName = dialog.querySelector<HTMLElement>(
      '[data-file-browser-mod-name]',
    );
    const treeTitle = dialog.querySelector<HTMLElement>('#mod-file-tree-title');
    const previewTitle = dialog.querySelector<HTMLElement>(
      '#mod-file-preview-title',
    );
    const tree = dialog.querySelector<HTMLElement>('[data-file-browser-tree]');
    const openFolder = dialog.querySelector<HTMLButtonElement>(
      '[data-file-browser-open-folder]',
    );
    const close = dialog.querySelector<HTMLButtonElement>(
      '[data-file-browser-close]',
    );

    if (!tree || !openFolder) return;
    if (title)
      title.textContent = this.translate('modFileBrowser.title', 'Mod files');
    if (modName) modName.textContent = mod.name;
    if (treeTitle) {
      treeTitle.textContent = this.translate(
        'modFileBrowser.folderTree',
        'File tree',
      );
    }
    if (previewTitle) {
      previewTitle.textContent = this.translate(
        'modFileBrowser.preview',
        'Preview',
      );
    }
    const openFolderLabel = openFolder.querySelector('span');
    if (openFolderLabel) {
      openFolderLabel.textContent = this.translate(
        'modFileBrowser.openFolder',
        'Open in file manager',
      );
    }
    close?.setAttribute(
      'aria-label',
      this.translate('modFileBrowser.close', 'Close'),
    );
    openFolder.onclick = () => {
      void this.modManager.operations?.openModFolder(mod);
    };

    this.renderTreeMessage(tree, '…');
    this.setFileBrowserEmptyPreview(dialog);
    dialog.classList.remove('closing');
    if (!dialog.open) dialog.showModal();
    await this.renderDirectory(tree, mod.path, '', requestId);
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
