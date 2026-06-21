export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[edit-info-modal] ModalManagerClass not found'); return; }

  M.prototype.openEditInfoModal = function (modPath, currentInfo, callback) {
    this.editInfoCallback = callback;
    this.currentModPath = modPath;

    const modal = document.querySelector<HTMLDivElement>('#edit-info-modal');
    const displayNameInput = document.querySelector<HTMLInputElement>('#edit-info-display-name');
    const authorsInput = document.querySelector<HTMLInputElement>('#edit-info-authors');
    const versionInput = document.querySelector<HTMLInputElement>('#edit-info-version');
    const categorySelect = document.querySelector<HTMLInputElement>('#edit-info-category');
    const urlInput = document.querySelector<HTMLInputElement>('#edit-info-url');
    const descriptionTextarea = document.querySelector<HTMLInputElement>('#edit-info-description');
    const previewStatus = document.querySelector<HTMLElement>('#edit-info-preview-status');
    const previewInput = document.querySelector<HTMLInputElement>('#edit-info-preview-input');

    if (modal) {
      modal.classList.remove('closing');

      if (displayNameInput) displayNameInput.value = currentInfo?.display_name || '';
      if (authorsInput) authorsInput.value = currentInfo?.authors || '';
      if (versionInput) versionInput.value = currentInfo?.version || '';
      if (categorySelect) categorySelect.value = currentInfo?.category || '';
      if (urlInput) urlInput.value = currentInfo?.url || '';
      if (descriptionTextarea) descriptionTextarea.value = currentInfo?.description || '';
      if (previewStatus) previewStatus.textContent = '';
      if (previewInput) previewInput.value = '';
      this.refreshEditInfoPreview?.();

      this.showOverlay();
      modal.style.display = 'block';
    }
  };

  M.prototype.closeEditInfoModal = function () {
    this.closeModal('edit-info-modal');
    this.editInfoCallback = null;
  };

  M.prototype.confirmEditInfo = function () {
    const form = document.querySelector<HTMLFormElement>('#mod-info-form');
    if (!form) return;

    const formData = new FormData(form);
    const info = {};

    formData.forEach((value, key) => {
      if (typeof value === 'string' && value.trim()) {
        info[key] = value.trim();
      }
    });

    if (this.editInfoCallback) {
      this.editInfoCallback(info);
    }

    this.closeEditInfoModal();
  };

  M.prototype.openAdvancedInfoModal = function (modPath, currentTomlContent) {
    this.currentModPath = modPath;

    const modal = document.querySelector<HTMLElement>('#advanced-info-modal');
    const textarea = document.querySelector<HTMLTextAreaElement>('#advanced-info-textarea');

    if (modal && textarea) {
      modal.classList.remove('closing');
      textarea.value = currentTomlContent || '';

      this.showOverlay();
      modal.style.display = 'block';
    }
  };

  M.prototype.closeAdvancedInfoModal = function () {
    this.closeModal('advanced-info-modal');
    this.advancedInfoCallback = null;
    this.currentModPath = null;
  };

  M.prototype.refreshEditInfoPreview = async function () {
    const previewImage = document.querySelector<HTMLImageElement>('#edit-info-preview-image');
    const previewPlaceholder = document.querySelector<HTMLElement>('#edit-info-preview-placeholder');
    if (!previewImage || !previewPlaceholder || !this.currentModPath) return;

    const previewPath = await window.electronAPI.getPreviewImage(this.currentModPath);
    if (previewPath) {
      previewImage.src = previewPath;
      previewImage.style.display = 'block';
      previewPlaceholder.style.display = 'none';
    } else {
      previewImage.removeAttribute('src');
      previewImage.style.display = 'none';
      previewPlaceholder.style.display = 'flex';
    }
  };

  M.prototype.openEditInfoPreviewPicker = function () {
    const previewInput = document.querySelector<HTMLInputElement>('#edit-info-preview-input');
    previewInput?.click();
  };

  M.prototype.handleEditInfoPreviewSelected = async function (input) {
    const file = input?.files?.[0];
    if (!file || !this.currentModPath) return;

    const previewStatus = document.querySelector<HTMLElement>('#edit-info-preview-status');
    if (previewStatus) {
      previewStatus.textContent = 'Importing...';
    }

    try {
      const data = await this.preparePreviewWebpData(file);
      const result = await window.electronAPI.saveModPreview(this.currentModPath, data);

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.previewSaved');
        }
        if (previewStatus) {
          previewStatus.textContent = 'preview.webp';
        }
        await this.refreshEditInfoPreview?.();

        if (window.modManager && window.modManager.selectedMod) {
          await window.modManager.selectMod(window.modManager.selectedMod.id);
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSavePreview', 3000, {
            error: result.error,
          });
        }
        if (previewStatus) {
          previewStatus.textContent = '';
        }
      }
    } catch (error) {
      console.error('Error importing preview:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSavePreview', 3000, {
          error: '',
        });
      }
      if (previewStatus) {
        previewStatus.textContent = '';
      }
    } finally {
      input.value = '';
    }
  };

  M.prototype.preparePreviewWebpData = async function (file) {
    if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')) {
      return new Uint8Array(await file.arrayBuffer());
    }

    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context unavailable');
      }

      context.drawImage(bitmap, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((convertedBlob) => {
          if (convertedBlob) {
            resolve(convertedBlob);
          } else {
            reject(new Error('Failed to convert image to WebP'));
          }
        }, 'image/webp', 0.92);
      });

      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bitmap.close();
    }
  };

  M.prototype.confirmAdvancedInfo = async function () {
    const textarea = document.querySelector<HTMLTextAreaElement>('#advanced-info-textarea');

    if (!textarea || !this.currentModPath) return;

    const tomlContent = textarea.value;

    try {
      const result = await window.electronAPI.saveModInfoRaw(this.currentModPath, tomlContent);

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.infoTomlSaved');
        }
        this.closeAdvancedInfoModal();

        if (window.modManager && window.modManager.selectedMod) {
          window.modManager.selectMod(window.modManager.selectedMod.id);
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
            error: result.error,
          });
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
          error: '',
        });
      }
    }
  };
})();
