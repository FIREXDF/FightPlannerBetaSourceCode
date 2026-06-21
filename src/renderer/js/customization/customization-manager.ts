class CustomizationManager {
  pendingJsPath: string | null;
  pendingJsPaths: string[];
  customCssFiles: Array<{ path: string; element: HTMLStyleElement }>;
  customJsFiles: Array<{ path: string; element: HTMLScriptElement }>;
  customCssElement: HTMLStyleElement | null;
  customJsElement: HTMLScriptElement | null;
  savedCssPath: string | null;
  savedJsPath: string | null;

  constructor() {
    this.pendingJsPath = null;
    this.pendingJsPaths = [];
    this.customCssFiles = []; // Array of {path, element}
    this.customJsFiles = []; // Array of {path, element}

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  async initialize() {
    await this.loadSavedCustomizations();

    setTimeout(() => {
      this.setupEventListeners();
    }, 200);
  }

  setupEventListeners() {
    console.log('Setting up customization event listeners...');

    // Render lists
    this.renderCssList();
    this.renderJsList();

    const addCssBtn = document.querySelector<HTMLElement>('#add-custom-css');
    if (addCssBtn && !addCssBtn.dataset.listenerAttached) {
      addCssBtn.addEventListener('click', () => this.addCustomCss());
      addCssBtn.dataset.listenerAttached = 'true';
    }

    const addJsBtn = document.querySelector<HTMLElement>('#add-custom-js');
    if (addJsBtn && !addJsBtn.dataset.listenerAttached) {
      addJsBtn.addEventListener('click', () => this.addCustomJs());
      addJsBtn.dataset.listenerAttached = 'true';
    }

    const reloadAllCssBtn =
      document.querySelector<HTMLElement>('#reload-all-css');
    if (reloadAllCssBtn && !reloadAllCssBtn.dataset.listenerAttached) {
      reloadAllCssBtn.addEventListener('click', () => this.reloadAllCss());
      reloadAllCssBtn.dataset.listenerAttached = 'true';
    }

    console.log('Customization event listeners setup complete');
  }

  async loadSavedCustomizations() {
    console.log('Loading saved customizations...');

    if (!window.electronAPI) {
      console.warn('electronAPI not available yet, retrying...');
      setTimeout(() => this.loadSavedCustomizations(), 500);
      return;
    }

    if (!window.electronAPI.store) {
      console.warn('store not available yet, retrying...');
      setTimeout(() => this.loadSavedCustomizations(), 500);
      return;
    }

    try {
      const customCssPaths =
        ((await window.electronAPI.store.get('customCssPaths')) as [] | null) ||
        [];
      const customJsPaths =
        ((await window.electronAPI.store.get('customJsPaths')) as [] | null) ||
        [];

      console.log('Saved CSS paths:', customCssPaths);
      console.log('Saved JS paths:', customJsPaths);

      for (const cssPath of customCssPaths) {
        console.log('Loading custom CSS from:', cssPath);
        await this.loadCustomCssFile(cssPath);
      }

      for (const jsPath of customJsPaths) {
        console.log('Loading custom JS from:', jsPath);
        await this.loadCustomJsFile(jsPath);
      }

      console.log('All customizations loaded');
    } catch (error) {
      console.error('Error loading saved customizations:', error);
    }
  }

  async addCustomCss() {
    console.log('Add CSS clicked');
    if (!window.electronAPI || !window.electronAPI.selectCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.selectCustomFile('css');

      if (!result.success) {
        return;
      }

      const selectedPaths = this.getSelectedCustomPaths(result);
      const newPaths = selectedPaths.filter(
        (filePath) => !this.customCssFiles.find((f) => f.path === filePath),
      );

      if (newPaths.length === 0) {
        window.toastManager?.warning('toasts.cssFileAlreadyLoaded');
        return;
      }

      for (const filePath of newPaths) {
        await this.loadCustomCssFile(filePath);
      }

      await this.saveCssPaths();
      this.renderCssList();
      window.toastManager?.success('toasts.customCssAdded');
    } catch (error) {
      console.error('Error adding custom CSS:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToAddCustomCss');
      }
    }
  }

  async addCustomJs() {
    console.log('Add JS clicked');
    if (!window.electronAPI || !window.electronAPI.selectCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.selectCustomFile('js');

      if (!result.success) {
        return;
      }

      const selectedPaths = this.getSelectedCustomPaths(result);
      const newPaths = selectedPaths.filter(
        (filePath) => !this.customJsFiles.find((f) => f.path === filePath),
      );

      if (newPaths.length === 0) {
        window.toastManager?.warning('toasts.jsFileAlreadyLoaded');
        return;
      }

      this.pendingJsPaths = newPaths;
      this.pendingJsPath = newPaths[0] || null;
      console.log(
        '[CustomizationManager] Pending JS paths set:',
        this.pendingJsPaths,
      );
      this.showJsWarningModal();
    } catch (error) {
      console.error('[CustomizationManager] Error adding custom JS:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSelectJsFile');
      }
    }
  }

  async browseCustomCss() {
    if (!window.electronAPI || !window.electronAPI.selectCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.selectCustomFile('css');

      if (!result.success) {
        return;
      }

      const selectedPath = this.getSelectedCustomPaths(result)[0];
      if (!selectedPath) {
        return;
      }

      await this.loadCustomCss(selectedPath);
      await window.electronAPI.store.set('customCssPath', selectedPath);
      this.savedCssPath = selectedPath;
      this.updateCssPathUI(selectedPath);

      if (window.toastManager) {
        window.toastManager.success('toasts.customCssLoaded');
      }
    } catch (error) {
      console.error('Error browsing custom CSS:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToLoadCustomCss');
      }
    }
  }

  async browseCustomJs() {
    if (!window.electronAPI || !window.electronAPI.selectCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.selectCustomFile('js');

      if (!result.success) {
        return;
      }

      const selectedPath = this.getSelectedCustomPaths(result)[0];
      if (!selectedPath) {
        return;
      }

      this.pendingJsPaths = [selectedPath];
      this.pendingJsPath = selectedPath;
      this.showJsWarningModal();
    } catch (error) {
      console.error('Error browsing custom JS:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSelectJsFile');
      }
    }
  }

  showJsWarningModal() {
    if (!window.modalManager) {
      console.error('Modal manager not available');
      return;
    }

    const message = `
      <div style="background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="color: #ff9800; font-weight: 600; margin-bottom: 8px;">
          <i class="bi bi-exclamation-triangle-fill"></i> Warning: Potentially Dangerous Operation
        </p>
        <p style="color: #cccccc; line-height: 1.6;">
          You are about to load a custom JavaScript file. This file will have <strong>full access</strong> to FightPlanner and can:
        </p>
      </div>
      <ul style="color: #aaaaaa; margin-left: 20px; line-height: 1.8; margin-bottom: 20px;">
        <li>Access and modify all your application data</li>
        <li>Read and write files on your system</li>
        <li>Execute arbitrary code with your user permissions</li>
        <li>Send data to external servers</li>
        <li>Potentially install malware or steal information</li>
      </ul>
      <p style="color: #cccccc; line-height: 1.6; margin-bottom: 16px;">
        <strong>Only proceed if:</strong>
      </p>
      <ul style="color: #4caf50; margin-left: 20px; line-height: 1.8; margin-bottom: 20px;">
        <li>You trust the developer who created this file</li>
        <li>The file comes from a reputable source</li>
        <li>You have reviewed the code yourself</li>
      </ul>
      <div style="background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 8px; padding: 12px;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #cccccc;">
          <input type="checkbox" id="js-warning-understand-checkbox" style="width: 18px; height: 18px; cursor: pointer;">
          <span>I understand the risks and trust this JavaScript file</span>
        </label>
      </div>
    `;

    this.showCustomModal(
      'Security Warning',
      message,
      async () => {
        await this.confirmLoadJs();
      },
      true,
    );
  }

  showCustomModal(title, message, onConfirm, requireCheckbox = false) {
    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'custom-warning-modal';

    const headerStyle = requireCheckbox
      ? 'background: linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 152, 0, 0.1) 100%); border-bottom-color: rgba(255, 152, 0, 0.3);'
      : '';

    const titleIcon = requireCheckbox
      ? '<i class="bi bi-shield-exclamation" style="color: #ff9800;"></i>'
      : '<i class="bi bi-info-circle"></i>';

    modal.innerHTML = `
      <div class="modal-header" style="${headerStyle}">
        <h3>${titleIcon} ${title}</h3>
        <button class="modal-close" id="custom-modal-close-btn">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body">
        ${message}
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-cancel" id="custom-modal-cancel-btn">
          <i class="bi bi-x-lg"></i> ${t('common.cancel')}
        </button>
        <button class="modal-btn ${requireCheckbox ? 'modal-btn-danger' : 'modal-btn-primary'}" id="custom-modal-confirm-btn" ${requireCheckbox ? 'disabled' : ''}>
          ${requireCheckbox ? `<i class="bi bi-shield-exclamation"></i> ${t('customization.loadJsFile')}` : `<i class="bi bi-check-lg"></i> ${t('customization.confirm')}`}
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    window.modalManager.showOverlay();
    modal.style.display = 'block';

    const checkbox = document.querySelector<HTMLInputElement>(
      '#js-warning-understand-checkbox',
    );
    const confirmBtn = document.querySelector<HTMLButtonElement>(
      '#custom-modal-confirm-btn',
    );
    const closeBtn = document.querySelector<HTMLElement>(
      '#custom-modal-close-btn',
    );
    const cancelBtn = document.querySelector<HTMLElement>(
      '#custom-modal-cancel-btn',
    );

    if (requireCheckbox && checkbox && confirmBtn) {
      checkbox.addEventListener('change', () => {
        confirmBtn.disabled = !checkbox.checked;
      });
    }

    const closeModal = () => {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
      }, 300);
      window.modalManager.hideOverlay();
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.pendingJsPath = null;
        this.pendingJsPaths = [];
        closeModal();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.pendingJsPath = null;
        this.pendingJsPaths = [];
        closeModal();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        closeModal();
        if (onConfirm) {
          await onConfirm();
        }
      });
    }

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (overlay) {
      let pointerStartedOnOverlay = false;
      const overlayPointerHandler = (event: PointerEvent) => {
        pointerStartedOnOverlay = event.target === overlay;
      };
      const overlayClickHandler = (event: MouseEvent) => {
        const shouldClose = pointerStartedOnOverlay && event.target === overlay;
        pointerStartedOnOverlay = false;
        if (shouldClose) {
          this.pendingJsPath = null;
          this.pendingJsPaths = [];
          closeModal();
          overlay.removeEventListener('pointerdown', overlayPointerHandler);
          overlay.removeEventListener('click', overlayClickHandler);
        }
      };
      overlay.addEventListener('pointerdown', overlayPointerHandler);
      overlay.addEventListener('click', overlayClickHandler);
    }
  }

  async confirmLoadJs() {
    console.log(
      '[CustomizationManager] confirmLoadJs called, pending paths:',
      this.pendingJsPaths,
    );
    if (this.pendingJsPaths.length === 0 && !this.pendingJsPath) {
      console.warn('[CustomizationManager] No pending JS path to confirm');
      return;
    }

    try {
      const pathsToLoad =
        this.pendingJsPaths.length > 0
          ? this.pendingJsPaths
          : this.pendingJsPath
            ? [this.pendingJsPath]
            : [];

      for (const filePath of pathsToLoad) {
        await this.loadCustomJsFile(filePath);
      }

      await this.saveJsPaths();
      this.renderJsList();

      if (window.toastManager) {
        window.toastManager.success('toasts.customJsLoaded');
      }
    } catch (error) {
      console.error('[CustomizationManager] Error in confirmLoadJs:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToLoadCustomJs');
      }
    } finally {
      this.pendingJsPath = null;
      this.pendingJsPaths = [];
    }
  }

  getSelectedCustomPaths(result: { filePath?: string; filePaths?: string[] }) {
    if (Array.isArray(result.filePaths) && result.filePaths.length > 0) {
      return result.filePaths;
    }

    return result.filePath ? [result.filePath] : [];
  }

  async loadCustomCssFile(filePath) {
    console.log('loadCustomCssFile called with:', filePath);

    if (!window.electronAPI || !window.electronAPI.readCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.readCustomFile(filePath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to read CSS file');
      }

      const element = document.createElement('style');
      element.id = `custom-css-${this.customCssFiles.length}`;
      element.textContent = result.content;
      document.head.appendChild(element);

      this.customCssFiles.push({ path: filePath, element });
      console.log('Custom CSS file added:', filePath);
    } catch (error) {
      console.error('Error loading custom CSS file:', error);
      if (window.toastManager) {
        window.toastManager.error(`Failed to load CSS: ${error.message}`);
      }
      throw error;
    }
  }

  async loadCustomJsFile(filePath) {
    console.log('loadCustomJsFile called with:', filePath);

    if (!window.electronAPI || !window.electronAPI.readCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.readCustomFile(filePath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to read JS file');
      }

      const blob = new Blob([result.content], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);

      const element = document.createElement('script');
      element.id = `custom-js-${this.customJsFiles.length}`;
      element.src = url;
      element.type = 'text/javascript';

      element.onload = () => {
        console.log(
          '[CustomizationManager] Custom JS script loaded successfully',
        );
        URL.revokeObjectURL(url);
      };

      element.onerror = (e) => {
        console.error(
          '[CustomizationManager] Custom JS script failed to load:',
          e,
        );
        URL.revokeObjectURL(url);
      };

      document.body.appendChild(element);

      this.customJsFiles.push({ path: filePath, element });
      console.log(
        '[CustomizationManager] Custom JS file added to state:',
        filePath,
      );
    } catch (error) {
      console.error(
        '[CustomizationManager] Error loading custom JS file:',
        error,
      );
      if (window.toastManager) {
        window.toastManager.error(`Failed to load JS: ${error.message}`);
      }
      throw error;
    }
  }

  async saveCssPaths() {
    const paths = this.customCssFiles.map((f) => f.path);
    await window.electronAPI.store.set('customCssPaths', paths);
  }

  async saveJsPaths() {
    const paths = this.customJsFiles.map((f) => f.path);
    await window.electronAPI.store.set('customJsPaths', paths);
  }

  async removeCustomCssFile(filePath) {
    const index = this.customCssFiles.findIndex((f) => f.path === filePath);
    if (index === -1) return;

    const file = this.customCssFiles[index];
    if (file.element) {
      file.element.remove();
    }

    this.customCssFiles.splice(index, 1);
    await this.saveCssPaths();
    this.renderCssList();

    if (window.toastManager) {
      window.toastManager.success('toasts.cssFileRemoved');
    }
  }

  async removeCustomJsFile(filePath) {
    const index = this.customJsFiles.findIndex((f) => f.path === filePath);
    if (index === -1) return;

    const file = this.customJsFiles[index];
    if (file.element) {
      file.element.remove();
    }

    this.customJsFiles.splice(index, 1);
    await this.saveJsPaths();
    this.renderJsList();

    this.showCustomJsRestartToast();
  }

  async reloadCustomJsFile(filePath: string) {
    console.log('[CustomizationManager] reloadCustomJsFile called:', filePath);
    const index = this.customJsFiles.findIndex((f) => f.path === filePath);
    if (index === -1) return;

    const file = this.customJsFiles[index];
    if (file.element) {
      file.element.remove();
    }

    this.customJsFiles.splice(index, 1);
    await this.loadCustomJsFile(filePath);
    this.renderJsList();

    if (window.toastManager) {
      window.toastManager.success('toasts.jsFileReloaded');
    }
  }

  async reloadCustomCssFile(filePath) {
    const index = this.customCssFiles.findIndex((f) => f.path === filePath);
    if (index === -1) return;

    const file = this.customCssFiles[index];
    if (file.element) {
      file.element.remove();
    }

    this.customCssFiles.splice(index, 1);
    await this.loadCustomCssFile(filePath);
    this.renderCssList();

    if (window.toastManager) {
      window.toastManager.success('toasts.cssFileReloaded');
    }
  }

  async reloadAllCss() {
    const paths = [...this.customCssFiles.map((f) => f.path)];

    // Remove all
    for (const file of this.customCssFiles) {
      if (file.element) {
        file.element.remove();
      }
    }
    this.customCssFiles = [];

    // Reload all
    for (const path of paths) {
      await this.loadCustomCssFile(path);
    }

    this.renderCssList();

    if (window.toastManager) {
      window.toastManager.success('toasts.allCssFilesReloaded');
    }
  }

  renderCssList() {
    const container = document.querySelector<HTMLElement>('#custom-css-list');
    if (!container) {
      console.warn('CSS list container not found');
      return;
    }

    if (this.customCssFiles.length === 0) {
      container.innerHTML = `
        <div class="custom-files-empty">
          <i class="bi bi-file-earmark-code"></i>
          <p>No custom CSS files loaded</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    this.customCssFiles.forEach((file, index) => {
      const item = this.createFileItem(file.path, 'css', index);
      container.appendChild(item);
    });
  }

  renderJsList() {
    const container = document.querySelector<HTMLElement>('#custom-js-list');
    console.log(
      '[CustomizationManager] renderJsList container:',
      container ? 'found' : 'NOT FOUND',
    );
    if (!container) return;

    console.log(
      '[CustomizationManager] renderJsList files count:',
      this.customJsFiles.length,
    );
    if (this.customJsFiles.length === 0) {
      container.innerHTML = `
        <div class="custom-files-empty">
          <i class="bi bi-file-earmark-code"></i>
          <p>No custom JavaScript files loaded</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    this.customJsFiles.forEach((file, index) => {
      const item = this.createFileItem(file.path, 'js', index);
      container.appendChild(item);
    });
  }

  createFileItem(filePath, type, index) {
    const item = document.createElement('div');
    item.className = 'custom-file-item';

    const fileName = filePath.split(/[\\/]/).pop();
    const icon = type === 'css' ? 'bi-filetype-css' : 'bi-filetype-js';

    item.innerHTML = `
      <i class="bi ${icon} custom-file-item-icon"></i>
      <div class="custom-file-item-info">
        <div class="custom-file-item-name">${fileName}</div>
        <div class="custom-file-item-path">${filePath}</div>
      </div>
      <div class="custom-file-item-actions">
        <button class="custom-file-action-btn" data-action="reload" title="Reload"><i class="bi bi-arrow-clockwise"></i></button>
        <button class="custom-file-action-btn danger" data-action="remove" title="Remove"><i class="bi bi-trash"></i></button>
      </div>
    `;

    const reloadBtn = item.querySelector<HTMLElement>('[data-action="reload"]');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        if (type === 'css') {
          this.reloadCustomCssFile(filePath);
        } else {
          this.reloadCustomJsFile(filePath);
        }
      });
    }

    const removeBtn = item.querySelector<HTMLElement>('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (type === 'css') {
          this.removeCustomCssFile(filePath);
        } else {
          this.removeCustomJsFile(filePath);
        }
      });
    }

    return item;
  }

  async loadCustomCss(filePath) {
    console.log('loadCustomCss called with path:', filePath);

    if (this.customCssElement) {
      console.log('Removing existing custom CSS element');
      this.customCssElement.remove();
    }

    if (!window.electronAPI || !window.electronAPI.readCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      console.log('Reading custom CSS file...');
      const result = await window.electronAPI.readCustomFile(filePath);

      console.log('Read result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to read CSS file');
      }

      this.customCssElement = document.createElement('style');
      this.customCssElement.id = 'custom-css';
      this.customCssElement.textContent = result.content;
      document.head.appendChild(this.customCssElement);

      console.log(
        'Custom CSS element added to head, content length:',
        result.content.length,
      );
      console.log('Custom CSS applied successfully from:', filePath);
    } catch (error) {
      console.error('Error loading custom CSS:', error);

      if (window.toastManager) {
        window.toastManager.error(
          `Failed to load custom CSS: ${error.message}`,
        );
      }

      await window.electronAPI.store.delete('customCssPath');
      this.updateCssPathUI('');

      throw error;
    }
  }

  async loadCustomJs(filePath) {
    if (this.customJsElement) {
      this.customJsElement.remove();
    }

    if (!window.electronAPI || !window.electronAPI.readCustomFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.readCustomFile(filePath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to read JavaScript file');
      }

      const blob = new Blob([result.content], {
        type: 'application/javascript',
      });
      const url = URL.createObjectURL(blob);

      this.customJsElement = document.createElement('script');
      this.customJsElement.id = 'custom-js';
      this.customJsElement.src = url;

      this.customJsElement.onload = () => {
        URL.revokeObjectURL(url);
      };

      document.body.appendChild(this.customJsElement);

      console.log('Custom JavaScript loaded from:', filePath);
    } catch (error) {
      console.error('Error loading custom JavaScript:', error);
      throw error;
    }
  }

  async removeCustomCss() {
    if (this.customCssElement) {
      this.customCssElement.remove();
      this.customCssElement = null;
    }

    if (window.electronAPI && window.electronAPI.store) {
      await window.electronAPI.store.delete('customCssPath');
    }

    this.savedCssPath = null;
    this.updateCssPathUI('');

    if (window.toastManager) {
      window.toastManager.success('toasts.customCssRemoved');
    }
  }

  async removeCustomJs() {
    if (this.customJsElement) {
      this.customJsElement.remove();
      this.customJsElement = null;
    }

    if (window.electronAPI && window.electronAPI.store) {
      await window.electronAPI.store.delete('customJsPath');
    }

    this.savedJsPath = null;
    this.updateJsPathUI('');

    this.showCustomJsRestartToast();
  }

  showCustomJsRestartToast() {
    if (!window.toastManager) {
      return;
    }

    const restartLabel = window.i18n?.t?.('common.restart') || 'Restart';

    window.toastManager.success(
      'toasts.customJsRemoved',
      8000,
      {},
      {
        actionButton: {
          text: restartLabel,
          onClick: async () => {
            try {
              await window.electronAPI?.relaunchApp?.();
            } catch (error) {
              console.error(
                'Failed to relaunch app after custom JS removal:',
                error,
              );
              window.toastManager?.error('toasts.failedToRestartApp');
            }
          },
        },
      },
    );
  }

  async reloadCustomCss() {
    if (!window.electronAPI || !window.electronAPI.store) return;

    try {
      const customCssPath = await window.electronAPI.store.get('customCssPath');

      if (!customCssPath) {
        if (window.toastManager) {
          window.toastManager.info('toasts.noCustomCssToReload');
        }
        return;
      }

      await this.loadCustomCss(customCssPath);

      if (window.toastManager) {
        window.toastManager.success('toasts.cssFileReloaded');
      }
    } catch (error) {
      console.error('Error reloading custom CSS:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToReloadCustomCss');
      }
    }
  }

  async reloadCustomJs() {
    if (window.toastManager) {
      window.toastManager.info(
        'Please restart the application to reload custom JavaScript',
      );
    }
  }

  updateCssPathUI(path) {
    console.log('Updating CSS path UI with:', path);
    const input = document.querySelector<HTMLInputElement>('#custom-css-path');
    if (input) {
      input.value = path || '';
      input.placeholder = path ? '' : 'No custom CSS loaded';
      console.log('CSS path UI updated');
    } else {
      console.warn('custom-css-path input not found');
    }
  }

  updateJsPathUI(path) {
    console.log('Updating JS path UI with:', path);
    const input = document.querySelector<HTMLInputElement>('#custom-js-path');
    if (input) {
      input.value = path || '';
      input.placeholder = path ? '' : 'No custom JavaScript loaded';
      console.log('JS path UI updated');
    } else {
      console.warn('custom-js-path input not found');
    }
  }
}

if (typeof window !== 'undefined') {
  window.customizationManager = new CustomizationManager();
  console.log('Customization Manager initialized');
}

export { type CustomizationManager };
