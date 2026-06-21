import { BrowserWindow, dialog, IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import PluginUtils, { SimplePlugin } from '../../plugin-utils';
import PluginUpdateChecker, {
  PluginUpdateResult,
} from '../../plugin-update-checker';
import PluginUpdateInstaller from '../../plugin-update-installer';
import store from '../../store';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { resolveVirtualPath } from '../../utils/virtual-paths';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import { FileExtractor } from '../../utils/file-extractor';

export type PluginHandlers = typeof PluginHandlers;

type CskCollectionInspectResult = {
  availableMods: string[];
  pluginFileName: string;
};

type CskCollectionInstallResult = {
  pluginPath: string;
  installedMods: string[];
};

const CSK_PLUGIN_RELATIVE_PATH =
  'atmosphere/contents/01006A800016E000/romfs/skyline/plugins/libthe_csk_collection.nro';
const ONE_SLOT_EFFECTS_PLUGIN_RELATIVE_PATH =
  'atmosphere/contents/01006A800016E000/romfs/skyline/plugins/libone_slot_eff.nro';

function findFileByRelativePath(rootDir: string, relativePath: string) {
  const normalizedTarget = relativePath.toLowerCase().replace(/\\/g, '/');
  const stack = [rootDir];

  while (stack.length) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      const relative = path
        .relative(rootDir, entryPath)
        .replace(/\\/g, '/')
        .toLowerCase();

      if (relative.endsWith(normalizedTarget)) {
        return entryPath;
      }
    }
  }

  return '';
}

function findCskModsRoot(rootDir: string) {
  const direct = path.join(rootDir, 'ultimate', 'mods');
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
    return direct;
  }

  const stack = [rootDir];
  while (stack.length) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (!entry.isDirectory()) continue;

      const relative = path.relative(rootDir, entryPath).replace(/\\/g, '/');
      if (relative.toLowerCase().endsWith('ultimate/mods')) {
        return entryPath;
      }

      stack.push(entryPath);
    }
  }

  return '';
}

function listCskModFolders(extractDir: string) {
  const modsRoot = findCskModsRoot(extractDir);
  if (!modsRoot) return [];

  return fs
    .readdirSync(modsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function downloadAndExtractCskArchive(downloadUrl: string) {
  if (!downloadUrl || !downloadUrl.startsWith('http')) {
    throw new Error('Invalid CSK Collection download URL');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fightplanner-csk-'));
  const archivePath = path.join(tempRoot, 'csk-collection.zip');
  const extractDir = path.join(tempRoot, 'extract');

  await PluginUpdateInstaller.downloadFile(downloadUrl, archivePath);
  await FileExtractor.extractArchive(archivePath, extractDir);

  return { tempRoot, archivePath, extractDir };
}

function cleanupTempDir(tempRoot: string) {
  try {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  } catch (error) {
    handleError(error, 'csk-cleanup');
  }
}

const PluginHandlers = {
  ['read-plugins-folder']: async (
    common: BaseHandlerArg,
    pluginsPath: string,
  ): HandlerResponse<{
    activePlugins: SimplePlugin[];
    disabledPlugins: SimplePlugin[];
  }> => {
    try {
      console.log('[PluginHandlers] Reading plugins folder:', pluginsPath);
      const result = PluginUtils.readAllPlugins(pluginsPath);
      console.log('[PluginHandlers] Plugins folder read complete:', {
        pluginsPath,
        activeCount: result.activePlugins.length,
        disabledCount: result.disabledPlugins.length,
      });

      return { success: true, ...result };
    } catch (error) {
      handleError(error, 'read-plugins-folder');
      return {
        success: false,
        error: error.message,
      };
    }
  },

  ['apply-plugin-batch-state']: async (
    common: BaseHandlerArg,
    pluginsPath: string,
    enabledPluginNames: string[],
  ): HandlerResponse<{
    activePlugins: SimplePlugin[];
    disabledPlugins: SimplePlugin[];
  }> => {
    try {
      const result = PluginUtils.applyPluginBatchState(
        pluginsPath,
        enabledPluginNames,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      handleError(error, 'apply-plugin-batch-state');
      return createErrorResponse(
        ErrorCodes.PLUGIN_READ_ERROR,
        error.message,
      );
    }
  },

  ['ensure-plugins-folder-available']: async (
    common: BaseHandlerArg,
    pluginsPath: string,
  ): HandlerResponse => {
    try {
      console.log(
        '[PluginHandlers] Ensuring plugins folder is available:',
        pluginsPath,
      );
      const resolvedPluginsPath = pluginsPath
        ? resolveVirtualPath(pluginsPath)
        : '';
      if (
        !resolvedPluginsPath
        || !fs.existsSync(resolvedPluginsPath)
        || !fs.statSync(resolvedPluginsPath).isDirectory()
      ) {
        console.error('[PluginHandlers] Plugins folder unavailable:', {
          requestedPath: pluginsPath,
          resolvedPath: resolvedPluginsPath,
        });
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          `Plugins folder is not available. Reconnect your Switch and make sure this folder exists: ${pluginsPath}`,
        );
      }

      console.log('[PluginHandlers] Plugins folder is available:', {
        requestedPath: pluginsPath,
        resolvedPath: resolvedPluginsPath,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'ensure-plugins-folder-available');
      return createErrorResponse(ErrorCodes.FOLDER_NOT_FOUND, error.message);
    }
  },

  ['select-plugin-file']: async (
    common: BaseHandlerArg,
    pluginsPath: string,
  ): HandlerResponse => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: 'NRO Files', extensions: ['nro'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const sourcePath = result.filePaths[0];
      return PluginUtils.copyPlugin(sourcePath, pluginsPath);
    } catch (error) {
      handleError(error, 'select-plugin-file');
      return createErrorResponse(
        ErrorCodes.PLUGIN_INSTALL_FAILED,
        error.message,
      );
    }
  },

  ['toggle-plugin']: async (
    common: BaseHandlerArg,
    pluginPath: string,
    pluginsBasePath: string,
  ) => {
    try {
      return PluginUtils.togglePlugin(pluginPath, pluginsBasePath);
    } catch (error) {
      handleError(error, 'toggle-plugin');
      return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
    }
  },

  ['delete-plugin']: async (common: BaseHandlerArg, pluginPath: string) => {
    try {
      return PluginUtils.deletePlugin(pluginPath);
    } catch (error) {
      handleError(error, 'delete-plugin');
      return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
    }
  },

  ['check-plugin-updates']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    results: (PluginUpdateResult & {
      pluginName: string;
    })[];
  }> => {
    try {
      const pluginMappings = (store.get('pluginRepoMappings') || {}) as Record<
        string,
        string
      >;

      const pluginVersions = (store.get('pluginVersions') || {}) as Record<
        string,
        string
      >;

      const results = await PluginUpdateChecker.checkAllPlugins(
        pluginMappings,
        pluginVersions,
      );

      return { success: true, results };
    } catch (error) {
      handleError(error, 'check-plugin-updates');
      return createErrorResponse(
        ErrorCodes.PLUGIN_UPDATE_FAILED,
        error.message,
      );
    }
  },

  ['update-plugin']: async (
    common: BaseHandlerArg,
    pluginName: string,
    downloadUrl: string,
    pluginPath: string,
    targetVersion: string | null,
  ) => {
    try {
      const result = await PluginUpdateInstaller.installUpdate(
        downloadUrl,
        pluginPath,
      );

      if (result.success) {
        const actualFileName =
          result.actualFileName || path.basename(result.pluginPath);
        const fileNameWithoutExt = actualFileName.replace(/\.nro$/i, '');

        if (targetVersion) {
          const pluginVersions = store.get('pluginVersions') || {};
          pluginVersions[fileNameWithoutExt] = targetVersion;
          store.set('pluginVersions', pluginVersions);
        } else {
          const mappings = store.get('pluginRepoMappings') || {};
          const repo = mappings[pluginName] || mappings[fileNameWithoutExt];
          if (repo) {
            try {
              const updateInfo = await PluginUpdateChecker.checkPluginUpdate(
                fileNameWithoutExt,
                repo,
                null,
              );
              if (updateInfo.success && updateInfo.latestVersion) {
                const pluginVersions = store.get('pluginVersions') || {};
                pluginVersions[fileNameWithoutExt] = updateInfo.latestVersion;
                store.set('pluginVersions', pluginVersions);
              }
            } catch (e) {
              handleError(e, 'update-plugin-version-fetch');
            }
          }
        }

        if (pluginName !== fileNameWithoutExt) {
          const pluginMappings = store.get('pluginRepoMappings') || {};
          const repoInput = pluginMappings[pluginName];

          if (repoInput) {
            pluginMappings[fileNameWithoutExt] = repoInput;
            delete pluginMappings[pluginName];
            store.set('pluginRepoMappings', pluginMappings);
          }
        }
      }

      return result;
    } catch (error) {
      handleError(error, 'update-plugin');
      return createErrorResponse(
        ErrorCodes.PLUGIN_UPDATE_FAILED,
        error.message,
      );
    }
  },

  ['inspect-csk-collection-archive']: async (
    common: BaseHandlerArg,
    downloadUrl: string,
  ): HandlerResponse<CskCollectionInspectResult> => {
    let tempRoot = '';

    try {
      const extracted = await downloadAndExtractCskArchive(downloadUrl);
      tempRoot = extracted.tempRoot;

      const pluginPath = findFileByRelativePath(
        extracted.extractDir,
        CSK_PLUGIN_RELATIVE_PATH,
      );

      if (!pluginPath) {
        return createErrorResponse(
          ErrorCodes.PLUGIN_INSTALL_FAILED,
          'CSK Collection plugin file was not found in the archive',
        );
      }

      return {
        success: true,
        availableMods: listCskModFolders(extracted.extractDir),
        pluginFileName: path.basename(pluginPath),
      };
    } catch (error) {
      handleError(error, 'inspect-csk-collection-archive');
      return createErrorResponse(
        ErrorCodes.PLUGIN_INSTALL_FAILED,
        error.message,
      );
    } finally {
      cleanupTempDir(tempRoot);
    }
  },

  ['install-csk-collection']: async (
    common: BaseHandlerArg,
    downloadUrl: string,
    pluginsPath: string,
    modsPath: string,
    selectedMods: string[],
    targetVersion: string | null,
  ): HandlerResponse<CskCollectionInstallResult> => {
    let tempRoot = '';

    try {
      const resolvedPluginsPath = resolveVirtualPath(pluginsPath);
      const resolvedModsPath = resolveVirtualPath(modsPath);

      if (!resolvedPluginsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Plugins folder not configured',
        );
      }

      if (!resolvedModsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Mods folder not configured',
        );
      }

      const extracted = await downloadAndExtractCskArchive(downloadUrl);
      tempRoot = extracted.tempRoot;

      const pluginSourcePath = findFileByRelativePath(
        extracted.extractDir,
        CSK_PLUGIN_RELATIVE_PATH,
      );

      if (!pluginSourcePath) {
        return createErrorResponse(
          ErrorCodes.PLUGIN_INSTALL_FAILED,
          'CSK Collection plugin file was not found in the archive',
        );
      }

      const cskModsRoot = findCskModsRoot(extracted.extractDir);
      const availableMods = new Set(listCskModFolders(extracted.extractDir));
      const safeSelectedMods = (selectedMods || []).filter((modName) =>
        availableMods.has(modName),
      );
      const safeSelectedModSet = new Set(safeSelectedMods);

      fs.mkdirSync(resolvedPluginsPath, { recursive: true });
      fs.mkdirSync(resolvedModsPath, { recursive: true });

      const pluginFileName = path.basename(pluginSourcePath);
      const pluginDestPath = path.join(resolvedPluginsPath, pluginFileName);

      if (fs.existsSync(pluginDestPath)) {
        const backupPath = `${pluginDestPath}.backup`;
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.copyFileSync(pluginDestPath, backupPath);
        fs.unlinkSync(pluginDestPath);
      }

      fs.copyFileSync(pluginSourcePath, pluginDestPath);

      const installedMods: string[] = [];
      if (cskModsRoot) {
        const disabledModsPath = path.join(
          path.dirname(resolvedModsPath),
          '{disabled_mod}',
        );

        for (const modName of availableMods) {
          if (safeSelectedModSet.has(modName)) {
            continue;
          }

          const activeDestPath = path.join(resolvedModsPath, modName);
          const disabledDestPath = path.join(disabledModsPath, modName);

          if (fs.existsSync(activeDestPath)) {
            fs.rmSync(activeDestPath, { recursive: true, force: true });
          }

          if (fs.existsSync(disabledDestPath)) {
            fs.rmSync(disabledDestPath, { recursive: true, force: true });
          }
        }

        for (const modName of safeSelectedMods) {
          const sourcePath = path.join(cskModsRoot, modName);
          const destPath = path.join(resolvedModsPath, modName);

          if (!sourcePath.startsWith(cskModsRoot + path.sep)) {
            continue;
          }

          if (fs.existsSync(destPath)) {
            fs.rmSync(destPath, { recursive: true, force: true });
          }

          fs.cpSync(sourcePath, destPath, { recursive: true });
          installedMods.push(modName);
        }
      }

      const mappings = (store.get('pluginRepoMappings') || {}) as Record<
        string,
        string
      >;
      mappings.libthe_csk_collection = 'GameBanana/499008';
      store.set('pluginRepoMappings', mappings);

      if (targetVersion) {
        const pluginVersions = (store.get('pluginVersions') || {}) as Record<
          string,
          string
        >;
        pluginVersions.libthe_csk_collection = targetVersion;
        store.set('pluginVersions', pluginVersions);
      }

      return {
        success: true,
        pluginPath: pluginDestPath,
        installedMods,
      };
    } catch (error) {
      handleError(error, 'install-csk-collection');
      return createErrorResponse(
        ErrorCodes.PLUGIN_INSTALL_FAILED,
        error.message,
      );
    } finally {
      cleanupTempDir(tempRoot);
    }
  },

  ['install-one-slot-effects']: async (
    common: BaseHandlerArg,
    downloadUrl: string,
    pluginsPath: string,
    targetVersion: string | null,
  ): HandlerResponse<{
    pluginPath: string;
  }> => {
    let tempRoot = '';

    try {
      const resolvedPluginsPath = resolveVirtualPath(pluginsPath);

      if (!resolvedPluginsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Plugins folder not configured',
        );
      }

      const extracted = await downloadAndExtractCskArchive(downloadUrl);
      tempRoot = extracted.tempRoot;

      const pluginSourcePath = findFileByRelativePath(
        extracted.extractDir,
        ONE_SLOT_EFFECTS_PLUGIN_RELATIVE_PATH,
      );

      if (!pluginSourcePath) {
        return createErrorResponse(
          ErrorCodes.PLUGIN_INSTALL_FAILED,
          'One Slot Effects plugin file was not found in the archive',
        );
      }

      fs.mkdirSync(resolvedPluginsPath, { recursive: true });

      const pluginFileName = path.basename(pluginSourcePath);
      const pluginDestPath = path.join(resolvedPluginsPath, pluginFileName);

      if (fs.existsSync(pluginDestPath)) {
        const backupPath = `${pluginDestPath}.backup`;
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.copyFileSync(pluginDestPath, backupPath);
        fs.unlinkSync(pluginDestPath);
      }

      fs.copyFileSync(pluginSourcePath, pluginDestPath);

      const mappings = (store.get('pluginRepoMappings') || {}) as Record<
        string,
        string
      >;
      mappings.libone_slot_eff = 'GameBanana/549058';
      store.set('pluginRepoMappings', mappings);

      if (targetVersion) {
        const pluginVersions = (store.get('pluginVersions') || {}) as Record<
          string,
          string
        >;
        pluginVersions.libone_slot_eff = targetVersion;
        store.set('pluginVersions', pluginVersions);
      }

      return {
        success: true,
        pluginPath: pluginDestPath,
      };
    } catch (error) {
      handleError(error, 'install-one-slot-effects');
      return createErrorResponse(
        ErrorCodes.PLUGIN_INSTALL_FAILED,
        error.message,
      );
    } finally {
      cleanupTempDir(tempRoot);
    }
  },

  ['get-plugin-repo-mapping']: async (common: BaseHandlerArg) => {
    try {
      const mappings = store.get('pluginRepoMappings') || {};
      return { success: true, mappings };
    } catch (error) {
      handleError(error, 'get-plugin-repo-mapping');
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  ['set-plugin-repo-mapping']: async (
    common: BaseHandlerArg,
    pluginName: string,
    repoInput: string,
  ) => {
    try {
      const mappings = store.get('pluginRepoMappings') || {};

      if (repoInput) {
        const normalized = PluginUpdateChecker.normalizeRepoUrl(repoInput);
        if (normalized) {
          mappings[pluginName] = normalized;
        } else {
          return createErrorResponse(
            ErrorCodes.INVALID_PATH,
            'Invalid repository format',
          );
        }
      } else {
        delete mappings[pluginName];
      }

      store.set('pluginRepoMappings', mappings);
      return { success: true };
    } catch (error) {
      handleError(error, 'set-plugin-repo-mapping');
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },
} as const;

/**
 * Register all IPC handlers related to plugin operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerPluginHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(PluginHandlers) as Array<
    keyof typeof PluginHandlers
  >) {
    const handler = PluginHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
