type ProfileEntry = {
  name: string;
  hash?: string;
  enabled: boolean;
};

type ModProfile = {
  id: string;
  name: string;
  mods: ProfileEntry[];
  plugins: ProfileEntry[];
  createdAt: string;
  updatedAt: string;
};

class ModProfileManager {
  profiles: ModProfile[] = [];
  activeProfileId: string | null = null;
  profileButton: HTMLButtonElement | null = null;
  profileButtonLabel: HTMLElement | null = null;
  isApplying = false;

  constructor() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        void this.initialize();
      });
    } else {
      void this.initialize();
    }
  }

  async initialize() {
    await this.loadProfiles();
    this.bindControls();
    this.render();
  }

  async loadProfiles() {
    try {
      const result = await window.electronAPI?.loadModProfiles?.();

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to load mod profiles');
      }

      this.profiles = Array.isArray(result.profiles) ? result.profiles : [];
      this.activeProfileId =
        typeof result.activeProfileId === 'string'
          ? result.activeProfileId
          : null;
    } catch (error) {
      console.error('[ModProfileManager] Failed to load profiles:', error);
      this.profiles = [];
      this.activeProfileId = null;
    }
  }

  async saveProfiles() {
    const result = await window.electronAPI.saveModProfiles({
      profiles: this.profiles,
      activeProfileId: this.activeProfileId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save mod profiles');
    }
  }

  bindControls() {
    this.profileButton =
      document.querySelector<HTMLButtonElement>('#mod-profile-btn');
    this.profileButtonLabel = document.querySelector<HTMLElement>(
      '#mod-profile-btn-label',
    );

    if (!this.profileButton) {
      return;
    }

    if (!this.profileButton.dataset.listenerAttached) {
      this.profileButton.addEventListener('click', () => {
        this.openProfileModal();
      });
      this.profileButton.dataset.listenerAttached = 'true';
    }
  }

  render() {
    this.profileButton =
      document.querySelector<HTMLButtonElement>('#mod-profile-btn');
    this.profileButtonLabel = document.querySelector<HTMLElement>(
      '#mod-profile-btn-label',
    );

    if (this.profileButton) {
      this.profileButton.disabled = this.isApplying;
    }

    if (this.profileButtonLabel) {
      const activeProfile = this.getActiveProfile();
      this.profileButtonLabel.textContent = 'Profiles';
      if (this.profileButton) {
        this.profileButton.title = activeProfile
          ? `Profiles - current: ${activeProfile.name}`
          : 'Profiles';
      }
    }
  }

  async createSnapshot(name: string): Promise<ModProfile> {
    const now = new Date().toISOString();
    const mods = await this.captureMods();
    const plugins = await this.capturePlugins();

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      mods,
      plugins,
      createdAt: now,
      updatedAt: now,
    };
  }

  async captureMods(): Promise<ProfileEntry[]> {
    const modsPath =
      window.modManager?.modsPath ||
      window.settingsManager?.getModsPath?.() ||
      null;

    if (modsPath && window.electronAPI?.readModsFolder) {
      const result = await window.electronAPI.readModsFolder(modsPath);
      if (result.success) {
        return [
          ...result.activeMods.map((mod) => ({
            name: mod.name,
            hash: mod.hash || this.fallbackHash(mod.name),
            enabled: true,
          })),
          ...result.disabledMods.map((mod) => ({
            name: mod.name,
            hash: mod.hash || this.fallbackHash(mod.name),
            enabled: false,
          })),
        ];
      }
    }

    return (window.modManager?.mods || []).map((mod) => ({
      name: mod.name,
      hash: mod.hash || this.fallbackHash(mod.name),
      enabled: mod.status === 'active',
    }));
  }

  async capturePlugins(): Promise<ProfileEntry[]> {
    const pluginsPath =
      window.pluginManager?.pluginsPath ||
      window.settingsManager?.getPluginsPath?.() ||
      null;

    if (pluginsPath && window.electronAPI?.readPluginsFolder) {
      const result = await window.electronAPI.readPluginsFolder(pluginsPath);
      if (result.success) {
        return [
          ...result.activePlugins.map((plugin) => ({
            name: plugin.name,
            hash: this.fallbackHash(plugin.name),
            enabled: true,
          })),
          ...result.disabledPlugins.map((plugin) => ({
            name: plugin.name,
            hash: this.fallbackHash(plugin.name),
            enabled: false,
          })),
        ];
      }
    }

    return (window.pluginManager?.plugins || []).map((plugin) => ({
      name: plugin.name,
      hash: this.fallbackHash(plugin.name),
      enabled: plugin.status === 'active' && plugin.enabled !== false,
    }));
  }

  async createProfile(name?: string) {
    if (!name) {
      name =
        (await this.promptForProfileName(this.buildDefaultProfileName())) ||
        undefined;
    }
    if (!name) {
      return null;
    }

    const profile = await this.createSnapshot(name);
    this.profiles.push(profile);
    this.activeProfileId = profile.id;
    await this.saveProfiles();
    this.render();
    window.toastManager?.success(`Profile "${profile.name}" created`);
    return profile;
  }

  async updateProfile(profile: ModProfile | null) {
    if (!profile) {
      return;
    }

    const updatedProfile = await this.createSnapshot(profile.name);
    profile.mods = updatedProfile.mods;
    profile.plugins = updatedProfile.plugins;
    profile.updatedAt = updatedProfile.updatedAt;

    await this.saveProfiles();
    this.render();
    window.toastManager?.success(`Profile "${profile.name}" updated`);
  }

  async deleteProfile(profile: ModProfile | null) {
    if (!profile) {
      return;
    }

    const confirmed = await this.confirmDeleteProfile(profile);
    if (!confirmed) {
      return;
    }

    this.profiles = this.profiles.filter((item) => item.id !== profile.id);
    this.activeProfileId = null;
    await this.saveProfiles();
    this.render();
    window.toastManager?.success(`Profile "${profile.name}" deleted`);
  }

  async applyProfile(profile: ModProfile | null) {
    if (!profile || this.isApplying) {
      return;
    }

    if (
      window.modManager?.isBatchTestingLocked?.() ||
      window.pluginManager?.isBatchTestingLocked?.()
    ) {
      window.toastManager?.warning('toasts.batchTestingAlreadyRunning');
      return;
    }

    this.isApplying = true;
    this.render();

    try {
      await this.applyMods(profile);
      await this.applyPlugins(profile);
      window.modManager?.clearSelection?.();

      this.activeProfileId = profile.id;
      await this.saveProfiles();
      window.toastManager?.success(`Profile "${profile.name}" applied`);
    } catch (error) {
      console.error('[ModProfileManager] Failed to apply profile:', error);
      window.toastManager?.error(
        `Failed to apply profile: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isApplying = false;
      this.render();
    }
  }

  openProfileModal() {
    if (!window.modalManager) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'mod-profile-modal';

    const rerender = () => {
      this.renderProfileModalBody(body, rerender);
    };

    rerender();

    window.modalManager.showCustomModal({
      title: 'Mod Profiles',
      body,
      buttons: [
        {
          text: 'Close',
          type: 'secondary',
        },
        {
          text: 'New',
          type: 'primary',
          closeOnClick: false,
          onClick: () => {
            void (async () => {
              const created = await this.createProfile();
              if (created) {
                rerender();
              }
            })();
            return false;
          },
        },
      ],
    });
  }

  renderProfileModalBody(body: HTMLElement, rerender: () => void) {
    body.innerHTML = '';

    const copy = document.createElement('p');
    copy.className = 'mod-profile-modal-copy';
    copy.textContent =
      'Save and restore a full enabled/disabled state for mods and plugins.';
    body.appendChild(copy);

    if (this.profiles.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'mod-profile-empty';
      emptyState.textContent = 'No saved mod profiles yet.';
      body.appendChild(emptyState);
      return;
    }

    const profileList = document.createElement('div');
    profileList.className = 'mod-profile-list';

    this.profiles.forEach((profile) => {
      const card = document.createElement('div');
      card.className = 'mod-profile-card';
      if (profile.id === this.activeProfileId) {
        card.classList.add('is-active');
      }

      const header = document.createElement('div');
      header.className = 'mod-profile-card-header';

      const title = document.createElement('span');
      title.className = 'mod-profile-card-title';
      title.textContent = profile.name;
      header.appendChild(title);

      if (profile.id === this.activeProfileId) {
        const badge = document.createElement('span');
        badge.className = 'mod-profile-card-badge';
        badge.textContent = 'Current';
        header.appendChild(badge);
      }

      const enabledMods = profile.mods.filter((entry) => entry.enabled).length;
      const enabledPlugins = profile.plugins.filter(
        (entry) => entry.enabled,
      ).length;
      const meta = document.createElement('div');
      meta.className = 'mod-profile-card-meta';
      meta.textContent = `${enabledMods}/${profile.mods.length} mods enabled, ${enabledPlugins}/${profile.plugins.length} plugins enabled - updated ${this.formatUpdatedAt(profile.updatedAt)}`;

      const actions = document.createElement('div');
      actions.className = 'mod-profile-card-actions';
      actions.appendChild(
        this.createCardButton('Apply', 'bi-check2-circle', async () => {
          await this.applyProfile(profile);
          rerender();
        }),
      );
      actions.appendChild(
        this.createCardButton('Update', 'bi-save', async () => {
          await this.updateProfile(profile);
          rerender();
        }),
      );
      actions.appendChild(
        this.createCardButton(
          'Delete',
          'bi-trash',
          async () => {
            await this.deleteProfile(profile);
            rerender();
          },
          true,
        ),
      );

      card.appendChild(header);
      card.appendChild(meta);
      card.appendChild(actions);
      profileList.appendChild(card);
    });

    body.appendChild(profileList);
  }

  createCardButton(
    label: string,
    iconClass: string,
    handler: () => Promise<void>,
    danger = false,
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `modal-btn modal-btn-${danger ? 'danger' : 'secondary'}`;
    button.innerHTML = `<i class="bi ${iconClass}"></i> ${label}`;
    button.disabled = this.isApplying;
    button.addEventListener('click', () => {
      void handler();
    });
    return button;
  }

  promptForProfileName(initialName: string) {
    return new Promise<string | null>((resolve) => {
      if (!window.modalManager) {
        resolve(null);
        return;
      }

      let resolved = false;
      const finish = (value: string | null) => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve(value);
      };

      const form = document.createElement('div');
      form.className = 'mod-profile-form';

      const inputId = `mod-profile-name-input-${Date.now()}`;

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.htmlFor = inputId;
      label.textContent = 'Profile name';

      const input = document.createElement('input');
      input.id = inputId;
      input.type = 'text';
      input.className = 'modal-input';
      input.placeholder = 'Enter a name for this profile';
      input.value = initialName;

      const errorText = document.createElement('p');
      errorText.className = 'mod-profile-form-error';

      form.appendChild(label);
      form.appendChild(input);
      form.appendChild(errorText);

      let nameModal: HTMLElement | null = null;

      const submit = () => {
        const profileName = input.value.trim().replace(/\s+/g, ' ');
        if (!profileName) {
          errorText.textContent = 'Profile name cannot be empty.';
          input.focus();
          return;
        }

        finish(profileName);
        if (nameModal) {
          this.closeDynamicModal(nameModal);
        }
      };

      input.addEventListener('input', () => {
        errorText.textContent = '';
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      nameModal = window.modalManager.showCustomModal({
        title: 'Save Mod Profile',
        body: form,
        onClose: () => finish(null),
        buttons: [
          {
            text: 'Cancel',
            type: 'secondary',
            onClick: () => finish(null),
          },
          {
            text: 'Save',
            type: 'primary',
            closeOnClick: false,
            onClick: () => {
              submit();
              return false;
            },
          },
        ],
      });

      setTimeout(() => {
        input.focus();
        input.select();
      }, 60);
    });
  }

  confirmDeleteProfile(profile: ModProfile) {
    return new Promise<boolean>((resolve) => {
      if (!window.modalManager) {
        resolve(false);
        return;
      }

      let resolved = false;
      const finish = (value: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const body = document.createElement('p');
      body.className = 'mod-profile-modal-copy';
      body.textContent = `Delete profile "${profile.name}"?`;

      window.modalManager.showCustomModal({
        title: 'Delete Mod Profile',
        body,
        onClose: () => finish(false),
        buttons: [
          {
            text: 'Cancel',
            type: 'secondary',
            onClick: () => finish(false),
          },
          {
            text: 'Delete',
            type: 'danger',
            onClick: () => finish(true),
          },
        ],
      });
    });
  }

  closeDynamicModal(modal: HTMLElement) {
    window.modalManager.closeModal(modal, {
      onModalClosed: () => {
        modal.remove();
      },
    });
  }

  async applyMods(profile: ModProfile) {
    const modsPath =
      window.modManager?.modsPath ||
      window.settingsManager?.getModsPath?.() ||
      null;
    if (!modsPath || profile.mods.length === 0) {
      return;
    }

    if (
      !window.electronAPI?.readModsFolder ||
      !window.electronAPI?.applyModBatchState
    ) {
      throw new Error('Mod profile API is not available');
    }

    const currentState = await window.electronAPI.readModsFolder(modsPath);
    if (!currentState.success) {
      throw new Error(currentState.error || 'Failed to read mods folder');
    }

    const currentMods = [
      ...currentState.activeMods.map((mod) => ({
        ...mod,
        status: 'active' as const,
      })),
      ...currentState.disabledMods.map((mod) => ({
        ...mod,
        status: 'disabled' as const,
      })),
    ];
    const profileState = this.createStateLookup(profile.mods);
    const enabledModNames = currentMods
      .filter((mod) =>
        this.shouldEnableEntry(mod, profileState, mod.status === 'active'),
      )
      .map((mod) => mod.path || mod.name);

    const result = await window.electronAPI.applyModBatchState(
      modsPath,
      enabledModNames,
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to apply mod profile');
    }

    window.modManager.modsPath = modsPath;
    await window.modManager.refreshModsFromState(result);
  }

  async applyPlugins(profile: ModProfile) {
    const pluginsPath =
      window.pluginManager?.pluginsPath ||
      window.settingsManager?.getPluginsPath?.() ||
      null;
    if (!pluginsPath || profile.plugins.length === 0) {
      return;
    }

    if (
      !window.electronAPI?.readPluginsFolder ||
      !window.electronAPI?.applyPluginBatchState
    ) {
      throw new Error('Plugin profile API is not available');
    }

    const currentState =
      await window.electronAPI.readPluginsFolder(pluginsPath);
    if (!currentState.success) {
      throw new Error(currentState.error || 'Failed to read plugins folder');
    }

    const currentPlugins = [
      ...currentState.activePlugins.map((plugin) => ({
        ...plugin,
        status: 'active' as const,
      })),
      ...currentState.disabledPlugins.map((plugin) => ({
        ...plugin,
        status: 'disabled' as const,
      })),
    ];
    const profileState = this.createStateLookup(profile.plugins);
    const enabledPluginNames = currentPlugins
      .filter((plugin) =>
        this.shouldEnableEntry(
          plugin,
          profileState,
          plugin.status === 'active',
        ),
      )
      .map((plugin) => plugin.name);

    const result = await window.electronAPI.applyPluginBatchState(
      pluginsPath,
      enabledPluginNames,
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to apply plugin profile');
    }

    window.pluginManager.pluginsPath = pluginsPath;
    await window.pluginManager.loadPluginsFromFolder(pluginsPath);
  }

  createStateLookup(entries: ProfileEntry[]) {
    const byHash = new Map<string, boolean>();
    const byName = new Map<string, boolean>();

    for (const entry of entries) {
      if (entry.hash) {
        byHash.set(entry.hash, entry.enabled);
      }
      byName.set(entry.name.toLowerCase(), entry.enabled);
    }

    return { byHash, byName };
  }

  shouldEnableEntry(
    entry: { name: string; hash?: string },
    lookup: { byHash: Map<string, boolean>; byName: Map<string, boolean> },
    fallbackEnabled: boolean,
  ) {
    const hash = entry.hash || this.fallbackHash(entry.name);
    if (lookup.byHash.has(hash)) {
      return lookup.byHash.get(hash) === true;
    }

    const nameKey = entry.name.toLowerCase();
    if (lookup.byName.has(nameKey)) {
      return lookup.byName.get(nameKey) === true;
    }

    return fallbackEnabled;
  }

  getActiveProfile() {
    const selectedId = this.activeProfileId;
    return this.profiles.find((profile) => profile.id === selectedId) || null;
  }

  formatUpdatedAt(updatedAt: string) {
    try {
      return new Date(updatedAt).toLocaleString();
    } catch {
      return updatedAt;
    }
  }

  buildDefaultProfileName() {
    const activeModHashes = (window.modManager?.mods || [])
      .filter((mod) => mod.status === 'active')
      .map((mod) => mod.hash || this.fallbackHash(mod.name))
      .slice(0, 3);

    if (activeModHashes.length > 0) {
      return `Profile ${activeModHashes.join('-')}`;
    }

    return `Profile ${this.profiles.length + 1}`;
  }

  fallbackHash(value: string) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }

    return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 12);
  }
}

if (typeof window !== 'undefined') {
  (window as any).modProfileManager = new ModProfileManager();
  console.log('Mod Profile Manager initialized');
}

export { type ModProfileManager };
