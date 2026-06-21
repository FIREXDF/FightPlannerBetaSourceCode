import { shell, dialog, ipcMain, IpcMainInvokeEvent, app, IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import ModUtils, { Mod } from '../../mod-utils';
import store from '../../store';
import downloadsStore from '../../store-downloads';
import ProtocolHandler from '../../protocol-handler';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { resolveVirtualPath } from '../../utils/virtual-paths';
import FppHandler from '../../fpp-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import {
  ModScanner,
  PathData,
  ScanModResult,
} from '../../mod-utils/mod-scanner';
import { SlotChanger } from '../../mod-utils/slot-changer';

export type ModHandlers = typeof ModHandlers;

const ModHandlers = {
  ['read-mods-folder']: async (
    common: BaseHandlerArg,
    modsPath: string,
  ): HandlerResponse<{
    activeMods: Mod[];
    disabledMods: Mod[];
  }> => {
    try {
      console.log('[ModHandlers] Reading mods folder:', modsPath);
      const result = ModUtils.readAllMods(modsPath);
      console.log('[ModHandlers] Mods folder read complete:', {
        modsPath,
        activeCount: result.activeMods.length,
        disabledCount: result.disabledMods.length,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      handleError(error, 'read-mods-folder');
      return {
        success: false,
        error: error.message,
      };
    }
  },

  ['apply-mod-batch-state']: async (
    common: BaseHandlerArg,
    modsPath: string,
    enabledModNames: string[],
  ): HandlerResponse<{
    activeMods: Mod[];
    disabledMods: Mod[];
  }> => {
    try {
      const result = ModUtils.applyModBatchState(modsPath, enabledModNames);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      handleError(error, 'apply-mod-batch-state');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['ensure-mods-folder-available']: async (
    common: BaseHandlerArg,
    modsPath: string,
  ): HandlerResponse => {
    try {
      console.log('[ModHandlers] Ensuring mods folder is available:', modsPath);
      const resolvedModsPath = modsPath ? resolveVirtualPath(modsPath) : '';
      if (!resolvedModsPath || !fs.existsSync(resolvedModsPath) || !fs.statSync(resolvedModsPath).isDirectory()) {
        console.error('[ModHandlers] Mods folder unavailable:', {
          requestedPath: modsPath,
          resolvedPath: resolvedModsPath,
        });
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          `Mods folder is not available. Reconnect your Switch and make sure this folder exists: ${modsPath}`,
        );
      }

      console.log('[ModHandlers] Mods folder is available:', {
        requestedPath: modsPath,
        resolvedPath: resolvedModsPath,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'ensure-mods-folder-available');
      return createErrorResponse(ErrorCodes.FOLDER_NOT_FOUND, error.message);
    }
  },

  ['get-preview-image']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const previewPath = ModUtils.getPreviewImagePath(modPath);
      if (previewPath) {
        const mtime = fs.statSync(previewPath).mtimeMs;
        return `${ModUtils.pathToFileUrl(previewPath)}?t=${Math.round(mtime)}`;
      }
      return null;
    } catch (error) {
      handleError(error, 'get-preview-image');
      return null;
    }
  },

  ['get-mod-info']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      return ModUtils.readModInfo(modPath);
    } catch (error) {
      handleError(error, 'get-mod-info');
      return null;
    }
  },

  ['save-mod-info']: async (
    common: BaseHandlerArg,
    modPath: string,
    infoData,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      let tomlContent = '';

      if (infoData.display_name)
        tomlContent += `display_name = "${infoData.display_name}"\n`;
      if (infoData.authors) tomlContent += `authors = "${infoData.authors}"\n`;
      if (infoData.version) tomlContent += `version = "${infoData.version}"\n`;
      if (infoData.category)
        tomlContent += `category = "${infoData.category}"\n`;
      if (infoData.url) tomlContent += `url = "${infoData.url}"\n`;
      if (infoData.description)
        tomlContent += `description = """\n${infoData.description}\n"""\n`;

      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['read-mod-info-raw']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      if (!fs.existsSync(infoPath)) return '';
      const content = fs.readFileSync(infoPath, 'utf8');
      return content;
    } catch (error) {
      handleError(error, 'read-mod-info-raw');
      return '';
    }
  },

  ['save-mod-info-raw']: async (
    common: BaseHandlerArg,
    modPath,
    tomlContent,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info-raw');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['save-mod-preview']: async (
    common: BaseHandlerArg,
    modPath: string,
    previewData: ArrayBuffer | Uint8Array,
  ): HandlerResponse<{ previewPath: string }> => {
    try {
      if (!modPath || !fs.existsSync(modPath) || !fs.statSync(modPath).isDirectory()) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Mod folder does not exist',
        );
      }

      const previewPath = path.join(modPath, 'preview.webp');
      const buffer = Buffer.from(previewData instanceof Uint8Array
        ? previewData
        : new Uint8Array(previewData));

      fs.writeFileSync(previewPath, buffer);

      return {
        success: true,
        previewPath: ModUtils.pathToFileUrl(previewPath) || previewPath,
      };
    } catch (error) {
      handleError(error, 'save-mod-preview');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['createFpp']: async (
    _common: BaseHandlerArg,
    name: string,
    fppVersion: string,
    thumbnailPath: string | null,
    modPaths: string[],
  ): HandlerResponse<{ filePath?: string }> => {
    try {
      if (!name || !modPaths || !Array.isArray(modPaths) || modPaths.length === 0) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'Name and modPaths array are required',
        );
      }

      const mainWindow = BrowserWindow.fromWebContents(_common.event.sender);
      if (!mainWindow) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'No main window found',
        );
      }

      const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save FPP File',
        defaultPath: `${safeName}.fpp`,
        filters: [{ name: 'FightPlanner Pack', extensions: ['fpp'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }

      console.log(`Creating FPP pack: ${name} (v${fppVersion}) with ${modPaths.length} mods`);

      const outputPath = saveResult.filePath;
      const result = await FppHandler.createFpp(name, fppVersion, thumbnailPath, modPaths, outputPath, mainWindow);

      return {
        success: result.success,
        filePath: result.filePath,
      };
    } catch (error) {
      handleError(error, 'create-fpp');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['rename-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    newName: string,
  ): HandlerResponse<{
    newPath: string;
  }> => {
    try {
      const parentDir = path.dirname(modPath);
      const newPath = path.join(parentDir, newName);
      if (fs.existsSync(newPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists',
        );
      }
      fs.renameSync(modPath, newPath);
      return { success: true, newPath };
    } catch (error) {
      handleError(error, 'rename-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['delete-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse => {
    try {
      if (!fs.existsSync(modPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Mod folder does not exist',
        );
      }
      fs.rmSync(modPath, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      handleError(error, 'delete-mod');
      return createErrorResponse(ErrorCodes.MOD_DELETE_ERROR, error.message);
    }
  },

  ['delete-conflict-file']: async (
    common: BaseHandlerArg,
    modPath: string,
    conflictFilePath: string,
  ): HandlerResponse => {
    try {
      if (!modPath || !fs.existsSync(modPath) || !fs.statSync(modPath).isDirectory()) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Mod folder does not exist',
        );
      }

      if (!conflictFilePath || path.isAbsolute(conflictFilePath)) {
        return createErrorResponse(
          ErrorCodes.MOD_DELETE_ERROR,
          'Invalid conflict file path',
        );
      }

      const modRoot = path.resolve(modPath);
      const targetPath = path.resolve(modRoot, conflictFilePath);
      const relativeTarget = path.relative(modRoot, targetPath);

      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        return createErrorResponse(
          ErrorCodes.MOD_DELETE_ERROR,
          'Conflict file path is outside the mod folder',
        );
      }

      if (!fs.existsSync(targetPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Conflict file does not exist',
        );
      }

      fs.rmSync(targetPath, { recursive: true, force: true });

      return { success: true };
    } catch (error) {
      handleError(error, 'delete-conflict-file');
      return createErrorResponse(ErrorCodes.MOD_DELETE_ERROR, error.message);
    }
  },

  ['toggle-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    modsBasePath: string,
  ): HandlerResponse<{
    newPath: string;
    isNowActive: boolean;
  }> => {
    try {
      console.log('[ModHandlers] Toggle mod requested:', {
        modPath,
        modsBasePath,
      });
      const resolvedModsBasePath = resolveVirtualPath(modsBasePath);
      const modName = path.basename(modPath);
      const parentDir = path.dirname(resolvedModsBasePath);
      const disabledModsPath = path.join(parentDir, '{disabled_mod}');
      const isInActiveMods =
        modPath.includes(resolvedModsBasePath) && !modPath.includes('{disabled_mods}');

      let targetPath;
      if (isInActiveMods) {
        if (!fs.existsSync(disabledModsPath)) {
          fs.mkdirSync(disabledModsPath, { recursive: true });
        }
        targetPath = path.join(disabledModsPath, modName);
      } else {
        targetPath = path.join(resolvedModsBasePath, modName);
      }

      if (fs.existsSync(targetPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists in the target location',
        );
      }

      fs.renameSync(modPath, targetPath);
      console.log('[ModHandlers] Toggle mod complete:', {
        modPath,
        targetPath,
        isNowActive: !isInActiveMods,
      });

      return {
        success: true,
        newPath: targetPath,
        isNowActive: !isInActiveMods,
      };
    } catch (error) {
      handleError(error, 'toggle-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['scan-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<{
    data: ScanModResult;
  }> => {
    try {
      const data = await ModScanner.scanModFiles(modPath);
      return { success: true, data };
    } catch (error) {
      handleError(error, 'scan-mod-slots');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['change-slots']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
    deletedSlots: Map<string, Set<string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.removeSlots(modPath, deletedSlots, pathData);

      for (const [fighterName, slots] of deletedSlots) {
        for (const slot of slots) {
          const fighterAssignments = slotAssignments.get(fighterName);

          if (fighterAssignments) {
            fighterAssignments.delete(slot);
          }
        }
      }

      await SlotChanger.changeSlots(modPath, slotAssignments, pathData);

      return { success: true };
    } catch (error) {
      handleError(error, 'change-slots');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['detect-conflicts']: async (
    common: BaseHandlerArg,
    modsPath: string,
    whitelistPatterns: string[] = [],
  ): HandlerResponse<{
    conflictGroups: {
      fighter: string;
      slot: string;
      conflicts: {
        filePath: string;
        mods: {
          name: string;
          path: string;
        }[];
      }[];
    }[];
    totalConflicts: number;
    activeModsCount: number;
  }> => {
    try {
      const result = ModUtils.readAllMods(modsPath);

      const conflictGroups = await ModUtils.detectConflicts(
        result.activeMods,
        whitelistPatterns,
      );

      // Calculate total conflicts across all groups
      const totalConflicts = conflictGroups.reduce(
        (sum, group) => sum + group.conflicts.length,
        0,
      );

      return {
        success: true,
        conflictGroups,
        totalConflicts,
        activeModsCount: result.activeMods.length,
      };
    } catch (error) {
      handleError(error, 'detect-conflicts');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['check-nro-limit']: async (
    common: BaseHandlerArg,
    modsPath: string,
    limit = 64,
  ): HandlerResponse<{
    limit: number;
    totalNroFiles: number;
    exceedsLimit: boolean;
    files: Array<{
      modName: string;
      modPath: string;
      relativePath: string;
    }>;
    activeModsCount: number;
  }> => {
    try {
      const result = ModUtils.readAllMods(modsPath);
      const nroLimitResult = await ModUtils.checkNroLimit(
        result.activeMods,
        limit,
      );

      return {
        success: true,
        ...nroLimitResult,
        activeModsCount: result.activeMods.length,
      };
    } catch (error) {
      handleError(error, 'check-nro-limit');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['install-mod-from-path']: async (
    common: BaseHandlerArg,
    sourcePath: string,
    modsPath: string,
  ) => {
    try {
      return await ModUtils.installModFromPath(sourcePath, modsPath);
    } catch (error) {
      handleError(error, 'install-mod-from-path');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },

  ['handle-files-dropped']: async (common: BaseHandlerArg, filePaths) => {
    try {
      const modsPath = store.get('modsPath') as string | null;
      if (!modsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      const results: {
        filePath: string;
        result: any;
      }[] = [];

      for (const filePath of filePaths) {
        try {
          const installResult = await ModUtils.installModFromPath(
            filePath,
            modsPath,
          );

          results.push({ filePath, result: installResult });
        } catch (error) {
          results.push({
            filePath,
            result: { success: false, error: error.message },
          });
        }
      }
      return { success: true, results };
    } catch (error) {
      handleError(error, 'handle-files-dropped');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to mod operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerModHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ModHandlers) as Array<
    keyof typeof ModHandlers
  >) {
    const handler = ModHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
