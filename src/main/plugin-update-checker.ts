import * as https from 'https';

interface TagData {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

export interface PluginUpdateResult {
  success: boolean;
  hasUpdate?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  repo?: string;
  error?: string;
}

export default class PluginUpdateChecker {
  static getGameBananaSubmission(repoInput: string) {
    const trimmed = String(repoInput || '').trim();
    const directMatch = trimmed.match(/^GameBanana\/(\d+)$/i);
    if (directMatch) {
      return { modelName: 'Mod', submissionId: directMatch[1] };
    }

    const urlMatch = trimmed.match(/gamebanana\.com\/(?:mods|sounds)\/(\d+)/i);
    if (urlMatch) {
      return {
        modelName: trimmed.toLowerCase().includes('/sounds/')
          ? 'Sound'
          : 'Mod',
        submissionId: urlMatch[1],
      };
    }

    return null;
  }

  static normalizeRepoUrl(repoInput) {
    if (!repoInput) return null;

    const trimmed = repoInput.trim();

    if (trimmed.includes('github.com')) {
      const match = trimmed.match(/github\.com\/([^\/]+\/[^\/\s]+)/);
      if (match) {
        return match[1]
          .replace(/\.git$/, '')
          .replace(/\/releases.*$/, '')
          .replace(/\/tags.*$/, '');
      }
    }

    if (trimmed.includes('/')) {
      return trimmed.replace(/\.git$/, '');
    }

    return null;
  }

  static async fetchJson(
    url: string,
  ): Promise<Array<unknown> | Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'FightPlanner-Plugin-Updater',
        },
      };

      https
        .get(url, options, (res) => {
          let data = '';

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  static async getLatestRelease(owner: string, repo: string) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      let release;

      try {
        release = await this.fetchJson(url);
      } catch (error) {
        const allReleasesUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
        try {
          const releases = await this.fetchJson(allReleasesUrl);
          if (releases && Array.isArray(releases) && releases.length > 0) {
            release = releases[0];
          } else {
            return null;
          }
        } catch (err) {
          return null;
        }
      }

      if (release && release.tag_name) {
        const downloadUrl = this.findNroAsset(release.assets);
        return {
          version: release.tag_name.replace(/^v/, ''),
          downloadUrl: downloadUrl,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static async getLatestTag(owner: string, repo: string) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/tags`;
      const tags = (await this.fetchJson(url)) as TagData[] | null;

      if (tags && tags.length > 0) {
        const latestTag = tags[0];

        return {
          version: latestTag.name.replace(/^v/, ''),
          downloadUrl: null,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static async getLatestGameBananaFile(modelName: string, submissionId: string) {
    try {
      const safeModelName = encodeURIComponent(modelName || 'Mod');
      const safeSubmissionId = encodeURIComponent(submissionId);
      const url = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=_aFiles`;
      const data = await this.fetchJson(url);
      const files = (data as any)?._aFiles;
      const fileEntries = Array.isArray(files)
        ? files
        : Object.values(files || {});

      for (const file of fileEntries as any[]) {
        const downloadUrl = file?._sDownloadUrl;
        if (typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) {
          return {
            version: String(file?._sVersion || file?._sFile || 'unknown'),
            downloadUrl,
          };
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[PluginUpdate] Failed to fetch GameBanana files for ${modelName}/${submissionId}:`,
        error,
      );
      return null;
    }
  }

  static findNroAsset(assets) {
    if (!assets || !Array.isArray(assets)) return null;

    for (const asset of assets) {
      const assetName = asset.name ? asset.name.toLowerCase() : '';
      if (assetName.endsWith('.nro')) {
        return asset.browser_download_url;
      }
      if (assetName.endsWith('.zip')) {
        return asset.browser_download_url;
      }
    }

    return null;
  }

  static compareVersions(v1, v2) {
    const normalize = (v) => {
      return v
        .replace(/^v/, '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
    };

    const parts1 = normalize(v1);
    const parts2 = normalize(v2);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }

  static async checkPluginUpdate(
    pluginName: string,
    repoInput: string,
    currentVersion: string | null,
  ): Promise<PluginUpdateResult> {
    try {
      const gameBananaSubmission = this.getGameBananaSubmission(repoInput);
      if (gameBananaSubmission) {
        const latestInfo = await this.getLatestGameBananaFile(
          gameBananaSubmission.modelName,
          gameBananaSubmission.submissionId,
        );

        if (!latestInfo) {
          return {
            success: false,
            error: 'No GameBanana files found',
          };
        }

        const hasUpdate =
          !currentVersion ||
          this.compareVersions(latestInfo.version, currentVersion) > 0;

        return {
          success: true,
          hasUpdate,
          currentVersion: currentVersion || 'unknown',
          latestVersion: latestInfo.version,
          downloadUrl: latestInfo.downloadUrl,
          repo: repoInput,
        };
      }

      const repo = this.normalizeRepoUrl(repoInput);

      if (!repo) {
        console.error(
          `[PluginUpdate] Invalid repo format for ${pluginName}: ${repoInput}`,
        );
        return {
          success: false,
          error: 'Invalid repository format',
        };
      }

      const [owner, repoName] = repo.split('/');
      if (!owner || !repoName) {
        console.error(
          `[PluginUpdate] Invalid repo split for ${pluginName}: ${repo}`,
        );
        return {
          success: false,
          error: 'Invalid repository format',
        };
      }

      console.log(
        `[PluginUpdate] Checking ${pluginName} from ${owner}/${repoName}`,
      );

      let latestInfo = await this.getLatestRelease(owner, repoName);

      if (!latestInfo || !latestInfo.downloadUrl) {
        console.log(
          `[PluginUpdate] No release with download URL found, trying tags for ${pluginName}`,
        );
        latestInfo = await this.getLatestTag(owner, repoName);
      }

      if (!latestInfo) {
        console.error(
          `[PluginUpdate] No releases or tags found for ${pluginName} (${owner}/${repoName})`,
        );
        return {
          success: false,
          error: 'No releases or tags found',
        };
      }

      if (!latestInfo.downloadUrl) {
        console.warn(
          `[PluginUpdate] Release found but no download URL for ${pluginName}`,
        );
        return {
          success: false,
          error: 'No download URL available in release',
        };
      }

      const hasUpdate =
        !currentVersion ||
        this.compareVersions(latestInfo.version, currentVersion) > 0;

      console.log(
        `[PluginUpdate] ${pluginName}: ${currentVersion || 'unknown'} → ${latestInfo.version} (hasUpdate: ${hasUpdate})`,
      );

      return {
        success: true,
        hasUpdate,
        currentVersion: currentVersion || 'unknown',
        latestVersion: latestInfo.version,
        downloadUrl: latestInfo.downloadUrl,
        repo: repo,
      };
    } catch (error) {
      console.error(`[PluginUpdate] Error checking ${pluginName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async checkAllPlugins(
    pluginMappings: Record<string, string>,
    pluginVersions: Record<string, string>,
  ) {
    const results: (PluginUpdateResult & { pluginName: string })[] = [];

    for (const [pluginName, repoInput] of Object.entries(pluginMappings)) {
      const currentVersion = pluginVersions[pluginName] || null;

      const result = await this.checkPluginUpdate(
        pluginName,
        repoInput,
        currentVersion,
      );

      results.push({
        pluginName,
        ...result,
      });
    }

    return results;
  }
}
