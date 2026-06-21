export interface MarketplacePlugin {
  name: string;
  repo: string;
  description: string;
  url: string;
  source?: 'github' | 'gamebanana';
  gameBanana?: {
    modelName: string;
    submissionId: string;
  };
  specialInstaller?: 'csk-collection' | 'one-slot-effects';
}

class PluginMarketplace {
  plugins: Array<MarketplacePlugin>;

  constructor() {
    this.plugins = [
      {
        name: 'ARCropolis',
        repo: 'Raytwo/ARCropolis',
        description:
          'libarcropolis.nro (Mod loader, if you want to setup arcropolis see our tutorial for emulator.)',
        url: 'https://github.com/Raytwo/ARCropolis/releases',
      },
      {
        name: 'NRO Hook Plugin',
        repo: 'ultimate-research/NRO-Hook-Plugin',
        description:
          'A plugin allowing for centralized hooking of NROs, allowing multiple plugins to all hook NRO load.',
        url: 'https://github.com/ultimate-research/nro-hook-plugin/releases',
      },
      {
        name: 'lib_paramconfig',
        repo: 'CSharpM7/lib_paramconfig',
        description:
          'A common problem across "single slot movesets"(SSMs) is that because they often hook the same functions, they will cause crashes when multiple SSMs are active at once. This plugin serves as a middleman between the source code and mods, so that even though multiple SSMs are active, this is the only plugin that actually hooks param functions.',
        url: 'https://github.com/CSharpM7/lib_paramconfig/releases',
      },
      {
        name: 'Params Hook Plugin',
        repo: 'ultimate-research/params-hook-plugin',
        description:
          'A plugin allowing for centralized hooking of parameter files, allowing multiple plugins to all hook param file loads.',
        url: 'https://github.com/ultimate-research/params-hook-plugin/releases',
      },
      {
        name: 'Smashline',
        repo: 'HDR-Development/smashline',
        description: 'libsmashline_hook.nro',
        url: 'https://github.com/HDR-Development/smashline/releases',
      },
      {
        name: 'CSK Collection',
        repo: 'GameBanana/499008',
        description:
          'The CSK Collection plugin plus optional feature toggles from ultimate/mods.',
        url: 'https://gamebanana.com/mods/499008',
        source: 'gamebanana',
        gameBanana: {
          modelName: 'Mod',
          submissionId: '499008',
        },
        specialInstaller: 'csk-collection',
      },
      {
        name: 'One Slot Effects',
        repo: 'GameBanana/549058',
        description:
          'One Slot Effects plugin. Installs only libone_slot_eff.nro from the archive.',
        url: 'https://gamebanana.com/mods/549058',
        source: 'gamebanana',
        gameBanana: {
          modelName: 'Mod',
          submissionId: '549058',
        },
        specialInstaller: 'one-slot-effects',
      },
    ];
  }

  getPlugins() {
    return this.plugins;
  }

  async downloadAndInstallPlugin(
    pluginName: string,
    repo: string,
    downloadInfo: string | { url: string; version: string },
    actualFileName?: string,
  ) {
    if (!window.electronAPI || !window.electronAPI.updatePlugin) {
      console.error('Electron API not available');
      return;
    }

    if (!window.settingsManager) {
      if (window.toastManager) {
        window.toastManager.error('Settings manager not available');
      }
      return;
    }

    const pluginsPath = window.settingsManager.getPluginsPath();
    if (!pluginsPath) {
      if (window.toastManager) {
        window.toastManager.error('Plugins folder not configured');
      }
      return;
    }

    // Support old call style (downloadInfo is string url)
    const downloadUrl =
      typeof downloadInfo === 'string' ? downloadInfo : downloadInfo.url;

    const targetVersion =
      typeof downloadInfo === 'object' ? downloadInfo.version : null;

    // Use the actualFileName for the final path if provided, otherwise default to pluginName.nro
    const finalPluginFileName = actualFileName || `${pluginName}.nro`;
    const pluginPath =
      pluginsPath.endsWith('\\') || pluginsPath.endsWith('/')
        ? pluginsPath + finalPluginFileName
        : pluginsPath +
          (pluginsPath.includes('\\') ? '\\' : '/') +
          finalPluginFileName;

    try {
      if (window.toastManager) {
        window.toastManager.info(`Downloading ${pluginName}...`);
      }

      const result = await window.electronAPI.updatePlugin(
        pluginName,
        downloadUrl,
        pluginPath,
        targetVersion,
      );

      if (result.success) {
        const installedFileName = result.actualFileName || finalPluginFileName;
        const mappingKey = installedFileName.replace(/\.nro$/, '');

        await window.electronAPI.setPluginRepoMapping(mappingKey, repo);

        if (window.toastManager) {
          window.toastManager.success(
            `${pluginName} installed and configured successfully`,
          );
        }

        if (window.pluginManager) {
          setTimeout(() => {
            window.pluginManager.refreshPlugins();
          }, 500);
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error(
            `Failed to install ${pluginName}: ${result.error}`,
          );
        }
      }
    } catch (error) {
      console.error('Error installing plugin:', error);
      if (window.toastManager) {
        window.toastManager.error(`Error installing plugin: ${error.message}`);
      }
    }
  }

  async getLatestReleaseDownloadUrl(repo) {
    try {
      const [owner, repoName] = repo.split('/');

      if (!owner || !repoName) {
        console.error('Invalid repo format:', repo);
        return null;
      }

      console.log(`Fetching releases for ${owner}/${repoName}...`);

      const repoCheckUrl = `https://api.github.com/repos/${owner}/${repoName}`;
      const repoCheckResponse = await fetch(repoCheckUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'FightPlanner-Plugin-Marketplace',
        },
      });

      if (!repoCheckResponse.ok) {
        const repoError = await repoCheckResponse.text();
        console.error(
          `Repository not found (${repoCheckResponse.status}):`,
          repoError,
        );
        console.error(`Tried to access: ${repoCheckUrl}`);
        return null;
      }

      const repoInfo = await repoCheckResponse.json();
      console.log(
        `Repository found: ${repoInfo.full_name} (${repoInfo.private ? 'private' : 'public'})`,
      );

      let release: {
        tag_name: string;
        assets: Array<{
          name: string;
          browser_download_url: string;
          size: number;
          content_type: string;
        }>;
      } | null = null;

      const latestUrl = `https://api.github.com/repos/${owner}/${repoName}/releases/latest`;
      console.log('Fetching latest release from:', latestUrl);

      const latestResponse = await fetch(latestUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'FightPlanner-Plugin-Marketplace',
        },
      });

      if (latestResponse.ok) {
        release = await latestResponse.json();
        console.log('Found latest release:', release!.tag_name);
      } else {
        const errorText = await latestResponse.text();
        console.warn(
          `No latest release found (${latestResponse.status}):`,
          errorText,
        );
        console.warn(`Trying all releases for ${owner}/${repoName}...`);

        const allReleasesUrl = `https://api.github.com/repos/${owner}/${repoName}/releases`;
        const allReleasesResponse = await fetch(allReleasesUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'FightPlanner-Plugin-Marketplace',
          },
        });

        if (allReleasesResponse.ok) {
          const releases = await allReleasesResponse.json();
          console.log(`Found ${releases.length} releases`);
          if (releases && releases.length > 0) {
            release = releases[0];
            console.log('Using first release:', release!.tag_name);
          }
        } else {
          const allReleasesError = await allReleasesResponse.text();
          console.error(
            `Failed to fetch all releases (${allReleasesResponse.status}):`,
            allReleasesError,
          );
        }
      }

      if (!release) {
        console.error('No releases found for repository');
        return null;
      }

      console.log('Release data:', {
        tag: release.tag_name,
        assets: release.assets?.map((a) => a.name) || [],
      });

      if (!release.assets || release.assets.length === 0) {
        console.warn('No assets found in release');
        return null;
      }

      for (const asset of release.assets) {
        const assetName = asset.name.toLowerCase();
        console.log(`Checking asset: ${asset.name} (${asset.size} bytes)`);

        if (assetName.endsWith('.nro')) {
          console.log(`Found .nro file: ${asset.name}`);
          return {
            url: asset.browser_download_url,
            version: release.tag_name.replace(/^v/, ''),
          };
        }

        if (assetName.endsWith('.zip')) {
          console.log(`Found .zip file: ${asset.name}`);
          return {
            url: asset.browser_download_url,
            version: release.tag_name.replace(/^v/, ''),
          };
        }
      }

      console.warn('No .nro or .zip file found in release assets');
      console.warn(
        'Available assets:',
        release.assets.map(
          (a) => `${a.name} (${a.size} bytes, ${a.content_type})`,
        ),
      );

      if (release.assets.length > 0) {
        console.warn('Trying first available asset as fallback...');
        return release.assets[0].browser_download_url;
      }

      return null;
    } catch (error) {
      console.error('Error fetching latest release:', error);
      return null;
    }
  }

  async getGameBananaFiles(modelName: string, submissionId: string) {
    if (!window.electronAPI?.fetchGameBananaFiles) {
      return [];
    }

    const result = await window.electronAPI.fetchGameBananaFiles(
      modelName,
      submissionId,
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch GameBanana files');
    }

    return (result.files || []).filter((file) => file?._sDownloadUrl);
  }

  getGameBananaFileLabel(file) {
    const version = file?._sVersion ? `v${file._sVersion}` : '';
    const description = file?._sDescription || file?._sFile || 'Download';
    return [version, description].filter(Boolean).join(' - ');
  }

  async inspectCskCollectionArchive(downloadUrl: string) {
    if (!window.electronAPI?.inspectCskCollectionArchive) {
      throw new Error('CSK archive inspector not available');
    }

    const result =
      await window.electronAPI.inspectCskCollectionArchive(downloadUrl);

    if (!result.success) {
      throw new Error(result.error || 'Failed to inspect CSK Collection');
    }

    return result;
  }

  async installCskCollection(options: {
    downloadUrl: string;
    version: string;
    selectedMods: string[];
  }) {
    if (!window.electronAPI?.installCskCollection) {
      throw new Error('CSK installer not available');
    }

    if (!window.settingsManager) {
      throw new Error('Settings manager not available');
    }

    const pluginsPath = window.settingsManager.getPluginsPath();
    const modsPath = window.settingsManager.getModsPath();

    if (!pluginsPath) {
      throw new Error('Plugins folder not configured');
    }

    if (!modsPath) {
      throw new Error('Mods folder not configured');
    }

    const result = await window.electronAPI.installCskCollection(
      options.downloadUrl,
      pluginsPath,
      modsPath,
      options.selectedMods,
      options.version,
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to install CSK Collection');
    }

    if (window.pluginManager) {
      setTimeout(() => {
        window.pluginManager.refreshPlugins();
      }, 500);
    }

    if (window.modManager?.loadModsFromFolder) {
      setTimeout(() => {
        window.modManager.loadModsFromFolder(modsPath);
      }, 500);
    }

    return result;
  }

  async installOneSlotEffects(options: {
    downloadUrl: string;
    version: string;
  }) {
    if (!window.electronAPI?.installOneSlotEffects) {
      throw new Error('One Slot Effects installer not available');
    }

    if (!window.settingsManager) {
      throw new Error('Settings manager not available');
    }

    const pluginsPath = window.settingsManager.getPluginsPath();

    if (!pluginsPath) {
      throw new Error('Plugins folder not configured');
    }

    const result = await window.electronAPI.installOneSlotEffects(
      options.downloadUrl,
      pluginsPath,
      options.version,
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to install One Slot Effects');
    }

    if (window.pluginManager) {
      setTimeout(() => {
        window.pluginManager.refreshPlugins();
      }, 500);
    }

    return result;
  }
}

if (typeof window !== 'undefined') {
  window.pluginMarketplace = new PluginMarketplace();
}

export { type PluginMarketplace };
