type GameBananaSubmission = {
  _idRow: number;
  _sName?: string;
  _sModelName?: string;
  _sProfileUrl?: string;
  _sImageUrl?: string;
  _sThumbnailUrl?: string;
  _aPreviewMedia?: { _sBaseUrl?: string; _sFile?: string }[];
  _aSubmitter?: { _sName?: string };
  _aRootCategory?: { _sName?: string };
  _aSubCategory?: { _sName?: string };
};

export class GameBananaMarketplace {
  private initialized = false;
  private page = 1;
  private totalPages = 1;
  private search = '';
  private sort = 'Generic_Newest';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  initialize() {
    if (!document.querySelector('.marketplace')) return;
    if (!this.initialized) this.bindEvents();
    this.initialized = true;
    void this.load();
  }

  private bindEvents() {
    document.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.id !== 'marketplace-search') return;
      this.search = input.value.trim();
      this.page = 1;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.load(), 350);
    });
    document.addEventListener('change', (event) => {
      const select = event.target as HTMLSelectElement;
      if (select.id !== 'marketplace-sort') return;
      this.sort = select.value;
      this.page = 1;
      void this.load();
    });
    document.addEventListener('click', (event) => void this.handleClick(event));
  }

  private async handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const external = target.closest<HTMLElement>('[data-marketplace-external]');
    if (external) {
      event.preventDefault();
      await window.electronAPI.openUrl(external.getAttribute('href') || 'https://gamebanana.com/games/6498');
      return;
    }
    const previous = target.closest('#marketplace-previous');
    const next = target.closest('#marketplace-next');
    if (previous && this.page > 1) { this.page--; await this.load(); return; }
    if (next && this.page < this.totalPages) { this.page++; await this.load(); return; }
    const view = target.closest<HTMLElement>('[data-marketplace-view]');
    if (view) { await window.electronAPI.openUrl(view.dataset.marketplaceView || ''); return; }
    const install = target.closest<HTMLElement>('[data-marketplace-install]');
    if (install) await this.showFiles(install);
    const file = target.closest<HTMLElement>('[data-marketplace-file]');
    if (file) await this.installFile(file);
  }

  private async load() {
    const results = document.getElementById('marketplace-results');
    if (!results) return;
    results.innerHTML = '<div class="marketplace__empty"><i class="bi bi-hourglass-split"></i><span>Loading GameBanana mods…</span></div>';
    try {
      const params = new URLSearchParams({ _nPage: String(this.page), _nPerpage: '18', _sSort: this.sort });
      params.set('_aFilters[Generic_Game]', '6498');
      if (this.search) params.set('_aFilters[Generic_Name]', `contains,${this.search}`);
      const response = await fetch(`https://gamebanana.com/apiv12/Mod/Index?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(`GameBanana returned ${response.status}`);
      const metadata = data?._aMetadata || {};
      this.totalPages = Math.max(1, Math.ceil(Number(metadata._nRecordCount || 0) / Number(metadata._nPerpage || 18)));
      this.render(Array.isArray(data?._aRecords) ? data._aRecords : []);
    } catch (error) {
      console.error('[Marketplace] Failed to load GameBanana mods:', error);
      results.innerHTML = '<div class="marketplace__empty"><i class="bi bi-exclamation-triangle"></i><span>Unable to load GameBanana. Please try again.</span></div>';
    }
    this.updatePagination();
  }

  private render(mods: GameBananaSubmission[]) {
    const results = document.getElementById('marketplace-results');
    if (!results) return;
    if (!mods.length) { results.innerHTML = '<div class="marketplace__empty"><i class="bi bi-inbox"></i><span>No mods found.</span></div>'; return; }
    results.innerHTML = `<div class="marketplace__grid">${mods.map((mod) => this.card(mod)).join('')}</div>`;
  }

  private card(mod: GameBananaSubmission) {
    const name = this.escape(mod._sName || 'Unknown mod');
    const author = this.escape(mod._aSubmitter?._sName || 'Unknown author');
    const category = this.escape(mod._aSubCategory?._sName || mod._aRootCategory?._sName || 'Mod');
    const url = mod._sProfileUrl || `https://gamebanana.com/mods/${mod._idRow}`;
    const image = this.image(mod);
    return `<article class="marketplace__card" data-marketplace-card="${mod._idRow}">
      ${image ? `<img class="marketplace__image" src="${this.escape(image)}" alt="" loading="lazy">` : '<div class="marketplace__image-placeholder"><i class="bi bi-image"></i></div>'}
      <div class="marketplace__body"><p class="marketplace__category">${category}</p><h2 class="marketplace__name">${name}</h2><p class="marketplace__author">by ${author}</p>
        <div class="marketplace__actions"><button type="button" class="marketplace__install" data-marketplace-install="${mod._idRow}"><i class="bi bi-download"></i><span>Install</span></button><button type="button" class="marketplace__view" data-marketplace-view="${this.escape(url)}" aria-label="Open on GameBanana"><i class="bi bi-box-arrow-up-right"></i></button></div>
        <div class="marketplace__files" hidden></div></div></article>`;
  }

  private async showFiles(button: HTMLElement) {
    const id = button.dataset.marketplaceInstall || '';
    const card = button.closest<HTMLElement>('[data-marketplace-card]');
    const files = card?.querySelector<HTMLElement>('.marketplace__files');
    if (!id || !files) return;
    files.hidden = false;
    files.innerHTML = '<span class="marketplace__file">Loading files…</span>';
    try {
      const result = await window.electronAPI.fetchGameBananaFiles('Mod', id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load GameBanana files');
      }
      const entries = (result.files || []).filter((file) => file?._sFightPlannerDownloadUrl || file?._sDownloadUrl);
      files.innerHTML = entries.length ? entries.map((file) => `<div class="marketplace__file"><span class="marketplace__file-name">${this.escape(file._sFile || 'Download')}</span><button type="button" data-marketplace-file="${this.escape(file._sFightPlannerDownloadUrl || file._sDownloadUrl)}">Install</button></div>`).join('') : '<span class="marketplace__file">No installable file found.</span>';
    } catch (error) { console.error('[Marketplace] Failed to get files:', error); files.innerHTML = '<span class="marketplace__file">Unable to load files.</span>'; }
  }

  private async installFile(button: HTMLElement) {
    const url = button.dataset.marketplaceFile;
    if (!url) return;
    await window.electronAPI.openFightPlannerLink(url.startsWith('fightplanner:') ? url : `fightplanner:${url}`);
  }

  private updatePagination() {
    const previous = document.getElementById('marketplace-previous') as HTMLButtonElement | null;
    const next = document.getElementById('marketplace-next') as HTMLButtonElement | null;
    const label = document.getElementById('marketplace-page');
    if (previous) previous.disabled = this.page <= 1;
    if (next) next.disabled = this.page >= this.totalPages;
    if (label) label.textContent = `${this.page} / ${this.totalPages}`;
  }

  private image(mod: GameBananaSubmission) { const media = mod._aPreviewMedia?.[0]; return mod._sImageUrl || mod._sThumbnailUrl || (media?._sBaseUrl && media?._sFile ? `${media._sBaseUrl}/${media._sFile}` : ''); }
  private escape(value: unknown) { const element = document.createElement('div'); element.textContent = String(value ?? ''); return element.innerHTML; }
}

window.gameBananaMarketplace = new GameBananaMarketplace();
