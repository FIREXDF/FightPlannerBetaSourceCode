type BatchTestingCategory = 'mods' | 'plugins';

type BatchTestingModStateEntry = {
  name: string;
  path: string;
  hash?: string;
};

type BatchTestingPluginStateEntry = {
  name: string;
  path: string;
  size: string;
};

type BatchTestingCategoryState = {
  active: Array<BatchTestingModStateEntry | BatchTestingPluginStateEntry>;
  disabled: Array<BatchTestingModStateEntry | BatchTestingPluginStateEntry>;
};

type BatchTestingCategorySnapshot = {
  category: BatchTestingCategory;
  label: string;
  basePath: string | null;
  originalActiveNames: string[];
  originalDisabledNames: string[];
  lastState: BatchTestingCategoryState | null;
};

type BatchTestingSessionLike = {
  snapshots: Record<BatchTestingCategory, BatchTestingCategorySnapshot>;
};

class BatchTestingStateHelpers {
  t: (key: string, fallback: string, params?: Record<string, any>) => string;

  constructor(deps: {
    t: (key: string, fallback: string, params?: Record<string, any>) => string;
  }) {
    this.t = deps.t;
  }

  async collectSnapshots(): Promise<
    Record<BatchTestingCategory, BatchTestingCategorySnapshot>
  > {
    const modsPath = window.settingsManager?.getModsPath() || null;
    const pluginsPath = window.settingsManager?.getPluginsPath() || null;

    const modsState = modsPath
      ? await this.readCategoryState('mods', modsPath)
      : { active: [], disabled: [] };
    const pluginsState = pluginsPath
      ? await this.readCategoryState('plugins', pluginsPath)
      : { active: [], disabled: [] };

    return {
      mods: {
        category: 'mods',
        label: this.t('settings.batchTestingStartMods', 'Mods'),
        basePath: modsPath,
        originalActiveNames: modsState.active.map((entry) => entry.name),
        originalDisabledNames: modsState.disabled.map((entry) => entry.name),
        lastState: modsState,
      },
      plugins: {
        category: 'plugins',
        label: this.t('settings.batchTestingStartPlugins', 'Plugins'),
        basePath: pluginsPath,
        originalActiveNames: pluginsState.active.map((entry) => entry.name),
        originalDisabledNames: pluginsState.disabled.map((entry) => entry.name),
        lastState: pluginsState,
      },
    };
  }

  async ensureCategoryAvailable(
    category: BatchTestingCategory,
    basePath: string,
  ) {
    if (category === 'mods') {
      const result = await window.electronAPI.ensureModsFolderAvailable(basePath);
      if (!result.success) {
        throw new Error(
          result.error
            || this.t(
              'toasts.batchTestingModsFolderUnavailable',
              'Mods folder is not available. Reconnect your Switch and make sure the folder exists.',
            ),
        );
      }

      return;
    }

    const result = await window.electronAPI.ensurePluginsFolderAvailable(basePath);
    if (!result.success) {
      throw new Error(
        result.error
          || this.t(
            'toasts.batchTestingPluginsFolderUnavailable',
            'Plugins folder is not available. Reconnect your Switch and make sure the folder exists.',
          ),
      );
    }
  }

  async readCategoryState(
    category: BatchTestingCategory,
    basePath: string,
  ): Promise<BatchTestingCategoryState> {
    await this.ensureCategoryAvailable(category, basePath);

    if (category === 'mods') {
      const result = await window.electronAPI.readModsFolder(basePath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to read mods folder');
      }

      return {
        active: result.activeMods || [],
        disabled: result.disabledMods || [],
      };
    }

    const result = await window.electronAPI.readPluginsFolder(basePath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to read plugins folder');
    }

    return {
      active: result.activePlugins || [],
      disabled: result.disabledPlugins || [],
    };
  }

  async applyState(
    snapshot: BatchTestingCategorySnapshot,
    enabledNames: string[],
  ) {
    if (!snapshot.basePath) {
      return;
    }

    await this.ensureCategoryAvailable(snapshot.category, snapshot.basePath);

    if (snapshot.category === 'mods') {
      const enabledModTokens = enabledNames.map((name) => `active:${name}`);
      const nextState = await window.electronAPI.applyModBatchState(
        snapshot.basePath,
        enabledModTokens,
      );

      if (!nextState.success) {
        throw new Error(nextState.error || 'Failed to apply batch state');
      }

      snapshot.lastState = {
        active: nextState.activeMods || [],
        disabled: nextState.disabledMods || [],
      };

      this.syncManager('mods', snapshot.basePath, snapshot.lastState);
      return;
    }

    const nextState = await window.electronAPI.applyPluginBatchState(
      snapshot.basePath,
      enabledNames,
    );

    if (!nextState.success) {
      throw new Error(nextState.error || 'Failed to apply batch state');
    }

    snapshot.lastState = {
      active: nextState.activePlugins || [],
      disabled: nextState.disabledPlugins || [],
    };

    this.syncManager('plugins', snapshot.basePath, snapshot.lastState);
  }

  syncManager(
    category: BatchTestingCategory,
    basePath: string,
    state: BatchTestingCategoryState,
  ) {
    if (category === 'mods' && window.modManager) {
      window.modManager.modsPath = basePath;

      const mods = [
        ...state.active.map((entry, index) => ({
          id: `batch-mod-active-${index}-${entry.name}`,
          name: entry.name,
          version: 'Unknown',
          author: 'Unknown',
          description: 'Active mod',
          size: 'Unknown',
          path: entry.path,
          status: 'active' as const,
          hash: (entry as BatchTestingModStateEntry).hash,
        })),
        ...state.disabled.map((entry, index) => ({
          id: `batch-mod-disabled-${index}-${entry.name}`,
          name: entry.name,
          version: 'Unknown',
          author: 'Unknown',
          description: 'Disabled mod',
          size: 'Unknown',
          path: entry.path,
          status: 'disabled' as const,
          hash: (entry as BatchTestingModStateEntry).hash,
        })),
      ];

      if (typeof (window.modManager as any).applyBatchTestingState === 'function') {
        (window.modManager as any).applyBatchTestingState(mods, basePath);
      } else {
        window.modManager.loadMods(mods);
      }
      return;
    }

    if (category === 'plugins' && window.pluginManager) {
      window.pluginManager.pluginsPath = basePath;

      const plugins = [
        ...state.active.map((entry, index) => ({
          id: `batch-plugin-active-${index}-${entry.name}`,
          name: entry.name,
          size: (entry as BatchTestingPluginStateEntry).size || 'Unknown',
          filePath: entry.path,
          status: 'active' as const,
        })),
        ...state.disabled.map((entry, index) => ({
          id: `batch-plugin-disabled-${index}-${entry.name}`,
          name: entry.name,
          size: (entry as BatchTestingPluginStateEntry).size || 'Unknown',
          filePath: entry.path,
          status: 'disabled' as const,
        })),
      ];

      if (typeof (window.pluginManager as any).applyBatchTestingState === 'function') {
        (window.pluginManager as any).applyBatchTestingState(plugins, basePath);
      } else {
        window.pluginManager.loadPlugins(plugins);
      }
    }
  }

  findItemState(
    session: BatchTestingSessionLike | null,
    category: BatchTestingCategory,
    itemName: string,
  ) {
    if (!session) {
      return null;
    }

    const snapshot = session.snapshots[category];
    const state = snapshot?.lastState;

    if (!state) {
      return null;
    }

    const activeEntry = state.active.find((entry) => entry.name === itemName);
    if (activeEntry) {
      return {
        entry: activeEntry,
        status: 'active' as const,
      };
    }

    const disabledEntry = state.disabled.find((entry) => entry.name === itemName);
    if (disabledEntry) {
      return {
        entry: disabledEntry,
        status: 'disabled' as const,
      };
    }

    return null;
  }
}

if (typeof window !== 'undefined') {
  (window as any).BatchTestingStateHelpers = BatchTestingStateHelpers;
}

export {};
