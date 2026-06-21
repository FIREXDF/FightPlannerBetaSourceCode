interface ModInfo {
  display_name: string;
  description: string;
  s_name?: string;
  authors?: string;
  version?: string;
  category?: string;
  url?: string;
}

class ModInfoManager {
  currentModPath: string | null;
  currentModData: ModInfo | null;

  constructor() {
    this.currentModPath = null;
    this.currentModData = null;
  }

  getContainer() {
    return document.querySelector<HTMLElement>('#mod-info-content');
  }

  displayModInfo(modData: ModInfo, modPath: string | null = null) {
    this.currentModData = modData;
    this.currentModPath = modPath;

    const container = this.getContainer();
    if (!container) {
      console.error('Container not found! Make sure the tab is loaded.');
      return;
    }

    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    const formatDescription = (desc) => {
      if (!desc) return t('tools.modInfo.noDescription');
      return escapeHtml(desc).replace(/\n/g, '<br>');
    };

    let html = '';

    if (modData.display_name) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.name')}</div>
<div class="mod-info-value">${escapeHtml(modData.display_name)}</div>
</div>`;
    }

    if (modData.authors) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.authors')}</div>
<div class="mod-info-value">${escapeHtml(modData.authors)}</div>
</div>`;
    }

    if (modData.version) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.version')}</div>
<div class="mod-info-value">${escapeHtml(modData.version)}</div>
</div>`;
    }

    if (modData.category) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.category')}</div>
<div class="mod-info-value">${escapeHtml(modData.category)}</div>
</div>`;
    }

    if (modData.description) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.description')}</div>
<div class="mod-info-value mod-info-description">${formatDescription(
        modData.description,
      )}</div>
</div>`;
    }

    if (modData.url) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.url')}</div>
<div class="mod-info-value">
<a href="#" onclick="window.electronAPI.openUrl('${escapeHtml(
        modData.url,
      )}'); return false;" class="mod-info-link">
${escapeHtml(modData.url)}
</a>
</div>
</div>`;
    }

    if (html === '') {
      html = `<p class="mod-info-placeholder">${t('tools.modInfo.noInformation')}</p>`;
    }

    container.style.animation = 'none';
    container.offsetHeight;
    container.style.animation = '';

    container.innerHTML = html;

    const editBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editBtn && modPath) {
      editBtn.style.display = 'flex';
    }
  }

  displaySelectionCount(count: number) {
    const container = this.getContainer();
    if (!container) return;

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };
    const selectedMods = window.modManager?.getCurrentSelectedMods?.() || [];
    const visibleMods = selectedMods.slice(0, 5);
    const remainingCount = Math.max(selectedMods.length - visibleMods.length, 0);
    const effectiveCount = selectedMods.length || count;

    container.style.animation = 'none';
    container.offsetHeight;
    container.style.animation = '';
    container.innerHTML = `
<div class="mod-selection-summary">
  <div class="mod-selection-header">
    <div class="mod-selection-count">${t('tools.modInfo.selectedCount', {
      count: effectiveCount,
    })}</div>
  </div>
  <p class="mod-selection-hint">${t('tools.modInfo.selectedHint')}</p>
  <div class="mod-selection-list" id="mod-selection-list"></div>
</div>`;

    const selectionList = container.querySelector<HTMLElement>(
      '#mod-selection-list',
    );

    if (selectionList) {
      visibleMods.forEach((mod, index) => {
        const item = document.createElement('div');
        item.className = 'mod-selection-list-item';

        const indexBadge = document.createElement('span');
        indexBadge.className = 'mod-selection-list-index';
        indexBadge.textContent = `${index + 1}`;

        const name = document.createElement('span');
        name.className = 'mod-selection-list-name';
        name.textContent = mod.name;
        name.title = mod.name;

        item.appendChild(indexBadge);
        item.appendChild(name);
        selectionList.appendChild(item);
      });

      if (remainingCount > 0) {
        const more = document.createElement('div');
        more.className = 'mod-selection-list-more';
        more.textContent = t('tools.modInfo.selectedMore', {
          count: remainingCount,
        });
        selectionList.appendChild(more);
      }
    }

    this.currentModPath = null;
    this.currentModData = null;

    const editBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  clearModInfo() {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    container.innerHTML = `<p class="mod-info-placeholder">${t('tools.selectMod')}</p>`;

    this.currentModPath = null;
    this.currentModData = null;

    const editBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  showLoading() {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    container.innerHTML = `<p class="mod-info-placeholder">${t('tools.modInfo.loading')}</p>`;

    const editBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  showError(message) {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    const errorMessage = message || t('tools.modInfo.failedToLoad');
    container.innerHTML = `<p class="mod-info-placeholder" style="color: #ff4444;">${errorMessage}</p>`;

    const editBtn = document.querySelector<HTMLElement>('#edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }
}

window.modInfoManager = new ModInfoManager();

/*
window.modInfoManager.displayModInfo({
name: "Super Smash Bros Ultimate Mod",
version: "1.0.0",
author: "ModAuthor",
description: "An awesome mod for Smash Ultimate",
size: "250 MB",
date: "2024-01-15"
});
*/

export { type ModInfoManager };
