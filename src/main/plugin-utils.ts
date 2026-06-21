import * as fs from 'fs';
import * as path from 'path';
import { resolveVirtualPath } from './utils/virtual-paths';

export interface SimplePlugin {
  name: string;
  path: string;
  size: string;
}

type BatchPluginState = 'active' | 'disabled';

interface BatchPluginMove {
  name: string;
  sourcePath: string;
  targetPath: string;
  targetStatus: BatchPluginState;
  tempPath: string;
}

export default class PluginUtils {
  /**
   * Read all plugins from a folder (active and disabled)
   * @param {string} pluginsPath - Path to the plugins folder
   * @returns {object} Object with activePlugins and disabledPlugins arrays
   */
  static readAllPlugins(pluginsPath: string) {
    const requestedPluginsPath = pluginsPath;
    pluginsPath = resolveVirtualPath(pluginsPath);
    if (pluginsPath !== requestedPluginsPath) {
      console.log('[PluginUtils] Plugins path resolved:', {
        requestedPath: requestedPluginsPath,
        resolvedPath: pluginsPath,
      });
    }

    const result: {
      activePlugins: SimplePlugin[];
      disabledPlugins: SimplePlugin[];
    } = {
      activePlugins: [],
      disabledPlugins: [],
    };

    try {
      if (fs.existsSync(pluginsPath)) {
        const files = fs.readdirSync(pluginsPath);

        files.forEach((file) => {
          const filePath = path.join(pluginsPath, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile() && path.extname(file).toLowerCase() === '.nro') {
            result.activePlugins.push({
              name: file,
              path: filePath,
              size: this.formatFileSize(stats.size),
            });
          }
        });
      } else {
        console.warn('[PluginUtils] Plugins folder does not exist:', {
          requestedPath: requestedPluginsPath,
          resolvedPath: pluginsPath,
        });
      }

      const disabledPluginsPath = this.getDisabledPluginsFolder(pluginsPath);

      if (fs.existsSync(disabledPluginsPath)) {
        const files = fs.readdirSync(disabledPluginsPath);

        files.forEach((file) => {
          const filePath = path.join(disabledPluginsPath, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile() && path.extname(file).toLowerCase() === '.nro') {
            result.disabledPlugins.push({
              name: file,
              path: filePath,
              size: this.formatFileSize(stats.size),
            });
          }
        });
      }

      console.log('[PluginUtils] Plugins folders scanned:', {
        requestedPath: requestedPluginsPath,
        resolvedPath: pluginsPath,
        activeCount: result.activePlugins.length,
        disabledCount: result.disabledPlugins.length,
      });

      return result;
    } catch (error) {
      console.error('[PluginUtils] Error reading plugins:', {
        requestedPath: requestedPluginsPath,
        resolvedPath: pluginsPath,
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  static getDisabledPluginsFolder(pluginsBasePath: string) {
    pluginsBasePath = resolveVirtualPath(pluginsBasePath);
    const parentDir = path.dirname(pluginsBasePath);
    return path.join(parentDir, 'disabled_plugins');
  }

  private static createTempPath(sourcePath: string, label: string) {
    const parentDir = path.dirname(sourcePath);
    const safeLabel = label.replace(/[^a-z0-9._-]/gi, '_');
    let candidate = path.join(
      parentDir,
      `.fpp_batch_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeLabel}`,
    );

    while (fs.existsSync(candidate)) {
      candidate = path.join(
        parentDir,
        `.fpp_batch_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeLabel}`,
      );
    }

    return candidate;
  }

  private static rollbackBatchMoves(moves: BatchPluginMove[]) {
    for (let i = moves.length - 1; i >= 0; i -= 1) {
      const move = moves[i];

      try {
        if (fs.existsSync(move.tempPath)) {
          fs.renameSync(move.tempPath, move.sourcePath);
        } else if (fs.existsSync(move.targetPath)) {
          fs.renameSync(move.targetPath, move.sourcePath);
        }
      } catch (error) {
        console.error('[PluginUtils] Failed to rollback batch move:', error);
      }
    }
  }

  static applyPluginBatchState(
    pluginsBasePath: string,
    enabledPluginNames: string[],
  ) {
    pluginsBasePath = resolveVirtualPath(pluginsBasePath);
    const currentState = this.readAllPlugins(pluginsBasePath);
    const activePlugins = currentState.activePlugins;
    const disabledPluginsPath = this.getDisabledPluginsFolder(pluginsBasePath);
    const disabledPlugins = currentState.disabledPlugins;
    const enabledSet = new Set(enabledPluginNames);
    const allPlugins = [
      ...activePlugins.map((plugin) => ({ ...plugin, status: 'active' as const })),
      ...disabledPlugins.map((plugin) => ({ ...plugin, status: 'disabled' as const })),
    ];

    const seenNames = new Set<string>();
    for (const plugin of allPlugins) {
      if (seenNames.has(plugin.name)) {
        throw new Error(
          `Duplicate plugin name detected: "${plugin.name}". Batch testing requires unique plugin names.`,
        );
      }
      seenNames.add(plugin.name);
    }

    const plannedMoves: BatchPluginMove[] = [];

    for (const plugin of allPlugins) {
      const shouldBeActive = enabledSet.has(plugin.name);
      const shouldMove =
        (plugin.status === 'active' && !shouldBeActive) ||
        (plugin.status === 'disabled' && shouldBeActive);

      if (!shouldMove) {
        continue;
      }

      const targetStatus: BatchPluginState = shouldBeActive ? 'active' : 'disabled';
      const targetBasePath =
        targetStatus === 'active' ? pluginsBasePath : disabledPluginsPath;
      const targetPath = path.join(targetBasePath, plugin.name);

      if (fs.existsSync(targetPath)) {
        throw new Error(
          `Batch state collision: "${plugin.name}" already exists in the ${targetStatus === 'active' ? 'active' : 'disabled'} plugins folder.`,
        );
      }

      plannedMoves.push({
        name: plugin.name,
        sourcePath: plugin.path,
        targetPath,
        targetStatus,
        tempPath: this.createTempPath(plugin.path, plugin.name),
      });
    }

    if (plannedMoves.some((move) => move.targetStatus === 'active')) {
      fs.mkdirSync(pluginsBasePath, { recursive: true });
    }

    if (plannedMoves.some((move) => move.targetStatus === 'disabled')) {
      fs.mkdirSync(disabledPluginsPath, { recursive: true });
    }

    const stagedMoves: BatchPluginMove[] = [];
    const finalizedMoves: BatchPluginMove[] = [];

    try {
      for (const move of plannedMoves) {
        fs.renameSync(move.sourcePath, move.tempPath);
        stagedMoves.push(move);
      }

      for (const move of stagedMoves) {
        fs.renameSync(move.tempPath, move.targetPath);
        finalizedMoves.push(move);
      }
    } catch (error) {
      this.rollbackBatchMoves(finalizedMoves);
      this.rollbackBatchMoves(
        stagedMoves.filter((move) => !finalizedMoves.includes(move)),
      );
      throw error;
    }

    return this.readAllPlugins(pluginsBasePath);
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Toggle plugin status (enable/disable)
   * @param {string} pluginPath - Full path to the plugin file
   * @param {string} pluginsBasePath - Base path of the plugins folder
   * @returns {object} Result with success status
   */
  static togglePlugin(pluginPath: string, pluginsBasePath: string) {
    try {
      console.log('[PluginUtils] Toggle plugin requested:', {
        pluginPath,
        pluginsBasePath,
      });
      pluginsBasePath = resolveVirtualPath(pluginsBasePath);
      const pluginName = path.basename(pluginPath);
      const parentDir = path.dirname(pluginsBasePath);
      const disabledPluginsPath = path.join(parentDir, 'disabled_plugins');

      const isActive = pluginPath.startsWith(pluginsBasePath);

      let targetPath;
      if (isActive) {
        if (!fs.existsSync(disabledPluginsPath)) {
          fs.mkdirSync(disabledPluginsPath, { recursive: true });
        }
        targetPath = path.join(disabledPluginsPath, pluginName);
      } else {
        targetPath = path.join(pluginsBasePath, pluginName);
      }

      if (fs.existsSync(targetPath)) {
        return {
          success: false,
          error:
            'A plugin with this name already exists in the target location',
        };
      }

      fs.renameSync(pluginPath, targetPath);
      console.log('[PluginUtils] Toggle plugin complete:', {
        pluginPath,
        targetPath,
        isNowActive: !isActive,
      });
      return {
        success: true,
        newPath: targetPath,
        isNowActive: !isActive,
      };
    } catch (error) {
      console.error('Error toggling plugin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a plugin file
   * @param {string} pluginPath - Full path to the plugin file
   * @returns {object} Result with success status
   */
  static deletePlugin(pluginPath) {
    try {
      if (!fs.existsSync(pluginPath)) {
        return { success: false, error: 'Plugin file does not exist' };
      }

      fs.unlinkSync(pluginPath);
      return { success: true };
    } catch (error) {
      console.error('Error deleting plugin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Copy a plugin file to the plugins folder
   * @param {string} sourcePath - Source file path
   * @param {string} targetFolder - Target plugins folder
   * @returns {object} Result with success status
   */
  static copyPlugin(sourcePath, targetFolder) {
    try {
      targetFolder = resolveVirtualPath(targetFolder);
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      if (path.extname(sourcePath).toLowerCase() !== '.nro') {
        return {
          success: false,
          error: 'Only .nro files are supported',
        };
      }

      const fileName = path.basename(sourcePath);
      const targetPath = path.join(targetFolder, fileName);

      if (fs.existsSync(targetPath)) {
        return {
          success: false,
          error: 'A plugin with this name already exists',
        };
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      fs.copyFileSync(sourcePath, targetPath);
      return { success: true, targetPath };
    } catch (error) {
      console.error('Error copying plugin:', error);
      return { success: false, error: error.message };
    }
  }
}
