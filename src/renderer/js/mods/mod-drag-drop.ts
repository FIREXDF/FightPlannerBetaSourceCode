class ModDragDropHandler {
  statusBar: HTMLElement | null;
  dragOverlayContent: HTMLElement | null;
  dragCounter: number;

  constructor() {
    this.statusBar = null;
    this.dragOverlayContent = null;
    this.dragCounter = 0;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.statusBar = document.getElementById('main-status-bar');

    if (this.statusBar && !this.dragOverlayContent) {
      this.dragOverlayContent = document.createElement('div');
      this.dragOverlayContent.className = 'bottom-bar-drag-overlay';
      this.dragOverlayContent.innerHTML = `
        <div class="ext-download-card ext-drag-card">
          <div class="ext-card-icon-container" style="border-style: dashed; background: rgba(var(--accent-rgb), 0.15);">
            <div class="ext-card-icon"><i class="bi bi-cloud-arrow-down-fill"></i></div>
          </div>
          <div class="ext-card-details">
            <div class="ext-card-header">
              <span class="ext-status-badge">DRAG & DROP</span>
              <span class="ext-filename">Drop mod files here</span>
            </div>
            <div class="ext-conflict-message">Supports ZIP, RAR, 7Z, and folders</div>
          </div>
        </div>
      `;
      this.statusBar.appendChild(this.dragOverlayContent);
    }

    this.setupEventListeners();
    this.setupWindowDropListener();
  }

  setupWindowDropListener() { }

  setupEventListeners() {
    document.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    document.addEventListener('dragover', (e) => this.handleDragOver(e));
    document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    document.addEventListener('drop', (e) => this.handleDrop(e));
  }

  isToolsTabActive() {
    const activeTab = document.querySelector<HTMLElement>(
      '.tab-content.active',
    );

    return activeTab && activeTab.id === 'tab-tools';
  }

  handleDragEnter(e: DragEvent) {
    if (!this.isToolsTabActive() || !this.statusBar) return;
    e.preventDefault();
    this.dragCounter++;

    if (this.dragCounter === 1) {
      this.statusBar.classList.add('drag-active');
    }

    // Add hover effect if entering the status bar itself
    if (this.statusBar.contains(e.target as Node)) {
      this.statusBar.classList.add('drag-hover');
    }
  }

  handleDragOver(e: DragEvent) {
    if (!this.isToolsTabActive()) return;
    e.preventDefault();
    e.stopPropagation();

    // Ensure data details show it's a copy operation
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  handleDragLeave(e: DragEvent) {
    if (!this.isToolsTabActive() || !this.statusBar) return;
    e.preventDefault();
    this.dragCounter--;

    if (this.dragCounter === 0) {
      this.statusBar.classList.remove('drag-active');
    }

    // Remove hover effect if leaving the status bar
    if (!this.statusBar.contains(e.relatedTarget as Node)) {
      this.statusBar.classList.remove('drag-hover');
    }
  }

  async handleDrop(e: DragEvent) {
    if (!this.isToolsTabActive() || !this.statusBar) return;

    e.preventDefault();
    e.stopPropagation();

    this.dragCounter = 0;
    this.statusBar.classList.remove('drag-active');
    this.statusBar.classList.remove('drag-hover');

    if (!e.dataTransfer || !e.dataTransfer.files) {
      return;
    }

    const files: File[] = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    const filePaths: string[] = [];

    for (const file of files) {
      try {
        const filePath = window.electronAPI.getPathForFile(file);

        if (filePath) {
          filePaths.push(filePath);
        }
      } catch (error) {
        console.error('Error getting file path:', error);
      }
    }

    if (filePaths.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.couldNotAccessFilePaths');
      }
      return;
    }

    try {
      const modsPath = (await window.electronAPI.store.get('modsPath')) as
        | string
        | null;

      if (!modsPath) {
        if (window.toastManager) {
          window.toastManager.error('toasts.modsFolderNotConfigured');
        }

        return;
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.installingFiles', 3000, {
          count: filePaths.length,
        });
      }

      for (const filePath of filePaths) {
        if (filePath.toLowerCase().endsWith('.fpp')) {
          if ((window as any).fppManager) {
            (window as any).fppManager.openInstallModal(filePath);
          }
          continue;
        }

        try {
          const result = await window.electronAPI.installModFromPath(
            filePath,
            modsPath,
          );

          if (result && result.success) {
            if (window.toastManager) {
              window.toastManager.success(
                'toasts.modInstalledSuccessfully',
                5000,
                {
                  name: result.resultingMods
                    .map((resultingMod) => resultingMod.modName)
                    .join(', '),

                  plural: result.resultingMods.length > 1 ? 's' : '',
                },
              );
            }

            setTimeout(() => {
              if (window.modManager) {
                window.modManager.fetchMods();
              }
            }, 500);
          } else {
            if (window.toastManager) {
              window.toastManager.error('toasts.installationError', 3000, {
                error: result?.error || 'Unknown error',
              });
            }
          }
        } catch (error) {
          if (window.toastManager) {
            window.toastManager.error('toasts.errorInstallingMod', 3000, {
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error(`Error: ${error.message}`);
      }
    }
  }
}

window.modDragDropHandler = new ModDragDropHandler();

export { type ModDragDropHandler };
