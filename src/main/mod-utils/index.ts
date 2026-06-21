import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as crypto from 'crypto';
import { app } from 'electron';

import { ModInstallResult } from '../plugin-update-installer';
import { FileExtractor } from '../utils/file-extractor';
import { resolveVirtualPath } from '../utils/virtual-paths';
import { CONFLICT_WHITELIST_PATTERNS } from '../config';
import sharedStore from '../store';

interface ModInstallOptions {
  onExtractProgress?: (progress: {
    percent: number;
    fileCount?: number;
    file?: string;
  }) => void;
  isCancelled?: () => boolean;
}

interface ModInfo {
  display_name: string;
  description: string;
  s_name?: string;
  authors?: string;
  version?: string;
  category?: string;
  url?: string;
}

export interface SlotChanges {
  modifications?: Array<{
    type: string;
    originalSlot?: string | null;
    newSlot?: string;
    files?: Array<any>;
    targetSlot?: string;
  }>;
}

export interface Slot {
  path: string;
  type: 'file' | 'directory';
  name: string;
  parent: string;
}

export interface Mod {
  name: string;
  path: string;
  status: 'active' | 'disabled';
  hash?: string;
  addedAt?: number;
  modifiedAt?: number;
  folderName?: string;
}

export interface NroLimitCheckResult {
  limit: number;
  totalNroFiles: number;
  exceedsLimit: boolean;
  files: Array<{
    modName: string;
    modPath: string;
    relativePath: string;
  }>;
}

type BatchModState = 'active' | 'disabled';

interface BatchModMove {
  mod: Mod;
  sourcePath: string;
  targetPath: string;
  targetStatus: BatchModState;
  tempPath: string;
}

export default class ModUtils {
  private static readonly batchDuplicateMarker = '.fpp-batch-duplicate-';

  private static isArchiveMetadataName(name: string): boolean {
    return (
      name === '__MACOSX' ||
      name === '.DS_Store' ||
      name.startsWith('._')
    );
  }

  private static getDisplayModName(folderName: string) {
    const markerIndex = folderName.indexOf(this.batchDuplicateMarker);

    return markerIndex === -1 ? folderName : folderName.slice(0, markerIndex);
  }

  private static normalizeRelativeModPath(relativePath: string): string {
    return relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter((part) => part && part !== '.')
      .join('/');
  }

  private static async scanRelativeFilePaths(
    modPath: string,
  ): Promise<string[]> {
    const relativeFilePaths: string[] = [];
    const stack = [modPath];

    while (stack.length > 0) {
      const currentPath = stack.pop();
      if (!currentPath) continue;

      let entries: fs.Dirent[];
      try {
        entries = await fsPromises.readdir(currentPath, {
          withFileTypes: true,
        });
      } catch (error) {
        console.warn('[ModUtils] Failed to scan mod directory:', {
          modPath,
          currentPath,
          error: error?.message || String(error),
        });
        continue;
      }

      entries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isFile()) {
          const relativePath = path.relative(modPath, fullPath);
          const normalizedPath = this.normalizeRelativeModPath(relativePath);

          if (normalizedPath) {
            relativeFilePaths.push(normalizedPath);
          }
        }
      }

      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];

        if (entry.isDirectory()) {
          stack.push(path.join(currentPath, entry.name));
        }
      }
    }

    return relativeFilePaths;
  }

  private static getConflictGroupMetadata(relativeFilePath: string): {
    fighter: string;
    slot: string;
  } {
    const pathParts = relativeFilePath.split('/');
    const fileName = path.basename(relativeFilePath);
    const charaUiMatch = fileName.match(
      /^chara_\d+_([a-z_]+?)_(\d{2,3})(?:\.[^.]+)$/i,
    );
    const fighterIndex = pathParts.indexOf('fighter');
    const fighter =
      fighterIndex !== -1 && pathParts.length > fighterIndex + 1
        ? pathParts[fighterIndex + 1]
        : charaUiMatch?.[1] || 'unknown';
    const pathSlot =
      fighterIndex !== -1
        ? pathParts
            .slice(fighterIndex + 2)
            .find((part) => /^c\d{2,3}$/i.test(part))
        : pathParts.find((part) => /^c\d{2,3}$/i.test(part));
    const slot = pathSlot || (charaUiMatch ? `c${charaUiMatch[2]}` : null);

    return {
      fighter,
      slot: slot || 'unknown',
    };
  }

  private static getDirectorySize(dirPath: string): number {
    let total = 0;

    if (!fs.existsSync(dirPath)) {
      return total;
    }

    const stack = [dirPath];
    while (stack.length) {
      const currentPath = stack.pop();
      if (!currentPath) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile()) {
          try {
            total += fs.statSync(fullPath).size;
          } catch {
            // File may still be in the middle of extraction.
          }
        }
      }
    }

    return total;
  }

  private static _gatherDirsWithModFiles(rootDir: string): string[] {
    if (this.isArchiveMetadataName(path.basename(rootDir))) {
      return [];
    }

    const checkIfModDir = (dir: string): boolean => {
      return (
        fs.existsSync(path.join(dir, 'config.json')) ||
        fs.existsSync(path.join(dir, 'ui')) ||
        fs.existsSync(path.join(dir, 'stage')) ||
        fs.existsSync(path.join(dir, 'sound')) ||
        fs.existsSync(path.join(dir, 'fighter'))
      );
    };

    const modDirs: string[] = [];

    // If the root directory itself contains mod files, return it and skip subdirectories
    if (checkIfModDir(rootDir)) {
      return [rootDir];
    }

    const items = fs
      .readdirSync(rootDir)
      .filter((item) => !this.isArchiveMetadataName(item));

    for (const item of items) {
      const itemPath = path.join(rootDir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        if (checkIfModDir(itemPath)) {
          // Found a directory with mod files, add it and skip its subdirectories
          modDirs.push(itemPath);
        } else {
          // This directory doesn't have mod files, recursively search its subdirectories
          const nested = this._gatherDirsWithModFiles(itemPath);
          modDirs.push(...nested);
        }
      }
    }

    return modDirs;
  }

  /**
   * Get the path to the disabled mods folder
   * @param {string} activeModsPath - Path to the active mods folder
   * @returns {string} Path to the disabled mods folder
   */
  static getDisabledModsFolder(activeModsPath) {
    activeModsPath = resolveVirtualPath(activeModsPath);
    const parentDir = path.dirname(activeModsPath);
    return path.join(parentDir, '{disabled_mod}');
  }

  /**
   * Read all mods from a folder
   * @param {string} folderPath - Path to the folder containing mods
   * @param {string} status - Status of the mods ('active' or 'disabled')
   * @returns {Array<Object>} Array of mod objects with name, path, and status
   */
  static readModsFromFolder(
    folderPath: string,
    status: 'active' | 'disabled' = 'active',
  ) {
    const requestedFolderPath = folderPath;
    folderPath = resolveVirtualPath(folderPath);
    if (folderPath !== requestedFolderPath) {
      console.log('[ModUtils] Folder path resolved:', {
        requestedPath: requestedFolderPath,
        resolvedPath: folderPath,
        status,
      });
    }

    const mods: Mod[] = [];

    if (!fs.existsSync(folderPath)) {
      console.warn('[ModUtils] Mods folder does not exist:', {
        requestedPath: requestedFolderPath,
        resolvedPath: folderPath,
        status,
      });
      return mods;
    }

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      entries.forEach((entry) => {
        if (entry.isDirectory()) {
          const modPath = path.join(folderPath, entry.name);
          let addedAt = 0;
          let modifiedAt = 0;

          try {
            const stats = fs.statSync(modPath);
            addedAt =
              stats.birthtimeMs && stats.birthtimeMs > 0
                ? stats.birthtimeMs
                : stats.ctimeMs;
            modifiedAt = stats.mtimeMs;
          } catch (error) {
            console.warn('[ModUtils] Failed to read mod timestamps:', {
              modPath,
              error: error?.message || String(error),
            });
          }

          const displayName = this.getDisplayModName(entry.name);
          const hash = crypto
            .createHash('sha256')
            .update(`${status}:${entry.name}`)
            .digest('hex')
            .substring(0, 12);
          mods.push({
            name: displayName,
            path: modPath,
            status: status,
            hash,
            addedAt,
            modifiedAt,
            folderName: entry.name,
          });
        }
      });
    } catch (error) {
      console.error('[ModUtils] Error reading mods folder:', {
        requestedPath: requestedFolderPath,
        resolvedPath: folderPath,
        status,
        error: error?.message || String(error),
      });
    }

    console.log('[ModUtils] Mods folder scanned:', {
      requestedPath: requestedFolderPath,
      resolvedPath: folderPath,
      status,
      count: mods.length,
    });

    return mods;
  }

  /**
   * Get the path to the preview image for a mod
   * @param {string} modPath - Path to the mod folder
   * @returns {string|null} Path to the preview image or null if not found
   */
  static getPreviewImagePath(modPath: string) {
    try {
      const previewPath = path.join(modPath, 'preview.webp');

      if (fs.existsSync(previewPath)) {
        return previewPath;
      }

      return null;
    } catch (error) {
      console.error('Error getting preview path:', error);
      return null;
    }
  }

  /**
   * Convert a file path to a file:// URL
   * @param {string} filePath - File path to convert
   * @returns {string|null} File URL or null if path is invalid
   */
  static pathToFileUrl(filePath: string) {
    if (!filePath) return null;

    const normalizedPath = filePath.replace(/\\/g, '/');
    return 'file://' + normalizedPath;
  }

  /**
   * Read mod information from info.toml file
   * @param {string} modPath - Path to the mod folder
   * @returns {Object|null} Mod info object or null if not found/error
   */
  static readModInfo(modPath: string): ModInfo | null {
    try {
      const infoPath = path.join(modPath, 'info.toml');

      if (!fs.existsSync(infoPath)) {
        return null;
      }

      const content = fs.readFileSync(infoPath, 'utf8');

      const info: Partial<ModInfo> = {};
      const lines = content.split('\n');

      let currentKey: string | null = null;
      let multilineValue = '';
      let inMultiline = false;

      lines.forEach((line: string) => {
        const originalLine = line;
        line = line.trim();

        if (!inMultiline && (!line || line.startsWith('#'))) return;

        const tripleQuoteCount = (line.match(/"""/g) || []).length;

        if (tripleQuoteCount > 0) {
          if (!inMultiline) {
            const equalsIndex = line.indexOf('=');

            if (equalsIndex !== -1) {
              currentKey = line.substring(0, equalsIndex).trim();
              inMultiline = true;

              const afterEquals = line.substring(equalsIndex + 1).trim();

              if (afterEquals === '"""') {
              } else if (tripleQuoteCount === 2) {
                const startQuote = afterEquals.indexOf('"""');
                const endQuote = afterEquals.lastIndexOf('"""');
                if (
                  startQuote !== -1 &&
                  endQuote !== -1 &&
                  startQuote !== endQuote
                ) {
                  info[currentKey] = afterEquals.substring(
                    startQuote + 3,
                    endQuote,
                  );
                  inMultiline = false;
                  currentKey = null;
                }
              }
            }
          } else {
            if (currentKey && (line === '"""' || line.endsWith('"""'))) {
              info[currentKey] = multilineValue.trim();
              multilineValue = '';
              inMultiline = false;
              currentKey = null;
            }
          }
        } else if (inMultiline) {
          multilineValue += originalLine + '\n';
        } else if (line.includes('=')) {
          const equalsIndex = line.indexOf('=');
          const key = line.substring(0, equalsIndex).trim();
          let value = line.substring(equalsIndex + 1).trim();

          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          info[key] = value;
        }
      });

      return info as ModInfo;
    } catch (error) {
      console.error('Error reading mod info:', error);
      return null;
    }
  }

  /**
   * Read all mods (active and disabled) from a mods directory
   * @param {string} activeModsPath - Path to the active mods folder
   * @returns {Object} Object with activeMods and disabledMods arrays
   */
  static readAllMods(activeModsPath: string) {
    activeModsPath = resolveVirtualPath(activeModsPath);
    const activeMods = this.readModsFromFolder(activeModsPath, 'active');

    const disabledModsPath = this.getDisabledModsFolder(activeModsPath);
    const disabledMods = this.readModsFromFolder(disabledModsPath, 'disabled');

    console.log(`Found ${activeMods.length} active mods`);
    console.log(`Found ${disabledMods.length} disabled mods`);

    return {
      activeMods,
      disabledMods,
    };
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

  private static createBatchDuplicatePath(targetBasePath: string, modName: string) {
    const safeLabel = modName.replace(/[^a-z0-9._-]/gi, '_');
    let candidate = path.join(
      targetBasePath,
      `${modName}${this.batchDuplicateMarker}${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}_${safeLabel}`,
    );

    while (fs.existsSync(candidate)) {
      candidate = path.join(
        targetBasePath,
        `${modName}${this.batchDuplicateMarker}${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}_${safeLabel}`,
      );
    }

    return candidate;
  }

  private static rollbackBatchMoves(moves: BatchModMove[]) {
    for (let i = moves.length - 1; i >= 0; i -= 1) {
      const move = moves[i];

      try {
        if (fs.existsSync(move.tempPath)) {
          fs.renameSync(move.tempPath, move.sourcePath);
        } else if (fs.existsSync(move.targetPath)) {
          fs.renameSync(move.targetPath, move.sourcePath);
        }
      } catch (error) {
        console.error('[ModUtils] Failed to rollback batch move:', error);
      }
    }
  }

  static applyModBatchState(activeModsPath: string, enabledModNames: string[]) {
    activeModsPath = resolveVirtualPath(activeModsPath);
    const { activeMods, disabledMods } = this.readAllMods(activeModsPath);
    const enabledSet = new Set(enabledModNames);
    const disabledModsPath = this.getDisabledModsFolder(activeModsPath);

    const allMods = [...activeMods, ...disabledMods];
    const nameCounts = new Map<string, number>();

    for (const mod of allMods) {
      nameCounts.set(mod.name, (nameCounts.get(mod.name) || 0) + 1);
    }

    const plannedMoves: BatchModMove[] = [];
    const reservedTargetPaths = new Set<string>();

    for (const mod of allMods) {
      const hasDuplicateName = (nameCounts.get(mod.name) || 0) > 1;
      const folderName = mod.folderName || path.basename(mod.path);
      const isBatchDuplicateFolder = folderName.includes(
        this.batchDuplicateMarker,
      );
      const shouldBeActive =
        enabledSet.has(mod.path) ||
        enabledSet.has(folderName) ||
        enabledSet.has(`active:${mod.name}`) &&
          (mod.status === 'active' || isBatchDuplicateFolder) ||
        (!hasDuplicateName && enabledSet.has(mod.name));
      const shouldMove =
        (mod.status === 'active' && !shouldBeActive) ||
        (mod.status === 'disabled' && shouldBeActive);

      if (!shouldMove) {
        continue;
      }

      const targetStatus: BatchModState = shouldBeActive
        ? 'active'
        : 'disabled';
      const targetBasePath =
        targetStatus === 'active' ? activeModsPath : disabledModsPath;
      let targetPath = path.join(targetBasePath, mod.name);

      while (fs.existsSync(targetPath) || reservedTargetPaths.has(targetPath)) {
        targetPath = this.createBatchDuplicatePath(targetBasePath, mod.name);
      }

      reservedTargetPaths.add(targetPath);

      plannedMoves.push({
        mod,
        sourcePath: mod.path,
        targetPath,
        targetStatus,
        tempPath: this.createTempPath(mod.path, mod.name),
      });
    }

    if (plannedMoves.some((move) => move.targetStatus === 'active')) {
      fs.mkdirSync(activeModsPath, { recursive: true });
    }

    if (plannedMoves.some((move) => move.targetStatus === 'disabled')) {
      fs.mkdirSync(disabledModsPath, { recursive: true });
    }

    const stagedMoves: BatchModMove[] = [];
    const finalizedMoves: BatchModMove[] = [];

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

    return this.readAllMods(activeModsPath);
  }

  static async detectConflicts(
    activeMods: Mod[],
    whitelistPatterns: string[] = [],
  ) {
    const conflictGroups: Map<
      string,
      {
        fighter: string;
        slot: string;
        conflicts: {
          filePath: string;
          mods: { name: string; path: string }[];
        }[];
      }
    > = new Map();

    const fileToMods = new Map<
      string,
      Array<{
        modIndex: number;
        modName: string;
        modPath: string;
      }>
    >();

    const allWhitelistPatterns = [
      ...CONFLICT_WHITELIST_PATTERNS,
      ...whitelistPatterns,
    ];

    const scanResults = await Promise.all(
      activeMods.map(async (mod, modIndex) => {
        if (mod.path && fs.existsSync(mod.path)) {
          return {
            modIndex,
            files: await this.scanRelativeFilePaths(mod.path),
          };
        }

        return {
          modIndex,
          files: [],
        };
      }),
    );

    function _addToFileMap(modIndex: number, filePath: string) {
      const normalizedFilePath = ModUtils.normalizeRelativeModPath(filePath);

      if (!normalizedFilePath) {
        return;
      }

      if (
        allWhitelistPatterns.some((pattern) => {
          const regex = new RegExp(pattern);
          return regex.test(normalizedFilePath);
        })
      ) {
        return;
      }

      if (!fileToMods.has(normalizedFilePath)) {
        fileToMods.set(normalizedFilePath, []);
      }

      const fileList = fileToMods.get(normalizedFilePath);

      if (fileList) {
        fileList.push({
          modIndex,
          modName: activeMods[modIndex].name,
          modPath: activeMods[modIndex].path,
        });
      }
    }

    for (const scanResult of scanResults) {
      for (const relativeFilePath of scanResult.files) {
        _addToFileMap(scanResult.modIndex, relativeFilePath);
      }
    }

    fileToMods.forEach((modsList, filePath) => {
      if (modsList.length > 1) {
        const { fighter, slot } = this.getConflictGroupMetadata(filePath);
        const groupKey = `${fighter}-${slot}`;

        if (!conflictGroups.has(groupKey)) {
          conflictGroups.set(groupKey, {
            fighter,
            slot,
            conflicts: [],
          });
        }

        conflictGroups.get(groupKey)!.conflicts.push({
          filePath: filePath,
          mods: modsList.map((m) => ({
            name: m.modName,
            path: m.modPath,
          })),
        });
      }
    });

    // Convert to array format for return
    return Array.from(conflictGroups.values()).sort((groupA, groupB) => {
      if (groupA.fighter === groupB.fighter) {
        return groupA.slot.localeCompare(groupB.slot);
      }

      if (groupA.fighter === 'unknown') return 1;
      if (groupB.fighter === 'unknown') return -1;

      return groupA.fighter.localeCompare(groupB.fighter);
    });
  }

  static async checkNroLimit(
    activeMods: Mod[],
    limit = 64,
  ): Promise<NroLimitCheckResult> {
    const files: NroLimitCheckResult['files'] = [];

    const scanResults = await Promise.all(
      activeMods.map(async (mod) => {
        if (!mod.path || !fs.existsSync(mod.path)) {
          return { mod, files: [] };
        }

        return {
          mod,
          files: await this.scanRelativeFilePaths(mod.path),
        };
      }),
    );

    for (const scanResult of scanResults) {
      for (const relativePath of scanResult.files) {
        if (!relativePath.toLowerCase().endsWith('.nro')) {
          continue;
        }

        files.push({
          modName: scanResult.mod.name,
          modPath: scanResult.mod.path,
          relativePath: this.normalizeRelativeModPath(relativePath),
        });
      }
    }

    files.sort((a, b) => {
      const modDelta = a.modName.localeCompare(b.modName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (modDelta !== 0) return modDelta;

      return a.relativePath.localeCompare(b.relativePath, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    return {
      limit,
      totalNroFiles: files.length,
      exceedsLimit: files.length > limit,
      files,
    };
  }

  static copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = stats && stats.isDirectory();

    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      fs.readdirSync(src).forEach((childItemName) => {
        this.copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName),
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  static async copyRecursive(
    src: string,
    dest: string,
    isCancelled?: () => boolean,
  ) {
    if (isCancelled?.()) {
      throw new Error('Installation cancelled');
    }

    const stats = await fsPromises.stat(src);

    if (stats.isDirectory()) {
      await fsPromises.mkdir(dest, { recursive: true });

      const children = (await fsPromises.readdir(src)).filter(
        (childItemName) => !this.isArchiveMetadataName(childItemName),
      );
      for (const childItemName of children) {
        if (isCancelled?.()) {
          throw new Error('Installation cancelled');
        }

        await this.copyRecursive(
          path.join(src, childItemName),
          path.join(dest, childItemName),
          isCancelled,
        );
      }
    } else {
      await fsPromises.copyFile(src, dest);
    }
  }

  static async installFromArchive(
    sourceArchivePath: string,
    modsPath: string,
    options: ModInstallOptions = {},
  ) {
    let tempExtractDir: string | null;

    console.log(
      '[installFromArchive] Installing mod from archive:',
      sourceArchivePath,
    );

    tempExtractDir = path.join(
      app.getPath('temp'),
      'fightplanner-extract',
      `mod-${Date.now()}`,
    );

    await fsPromises.mkdir(tempExtractDir, { recursive: true });
    if (options.isCancelled?.()) {
      throw new Error('Installation cancelled');
    }

    const estimatedSize =
      await FileExtractor.estimateArchiveUncompressedSize(sourceArchivePath);
    let lastProgress = -1;
    let lastLoggedProgress = -1;
    console.log('[extract-progress][mod-utils] extraction prepared', {
      archive: sourceArchivePath,
      tempExtractDir,
      estimatedSize,
    });

    const reportProgress = (
      percent: number,
      file?: string,
      source: 'initial' | 'poll' | 'node-7z' | 'complete' = 'node-7z',
      extractedSize?: number,
    ) => {
      const nextProgress = Math.max(0, Math.min(100, Math.round(percent)));
      if (nextProgress <= lastProgress && nextProgress !== 100) return;

      lastProgress = nextProgress;
      if (
        nextProgress === 0 ||
        nextProgress === 100 ||
        nextProgress - lastLoggedProgress >= 5
      ) {
        lastLoggedProgress = nextProgress;
        console.log('[extract-progress][mod-utils] report', {
          source,
          percent: nextProgress,
          archive: sourceArchivePath,
          file,
          extractedSize,
          estimatedSize,
        });
      }
      options.onExtractProgress?.({ percent: nextProgress, file });
    };

    reportProgress(0, undefined, 'initial');
    const progressTimer = setInterval(() => {
      if (options.isCancelled?.()) return;
      if (estimatedSize <= 0) return;

      const extractedSize = this.getDirectorySize(tempExtractDir!);
      const percent = Math.min(95, (extractedSize / estimatedSize) * 100);
      reportProgress(percent, undefined, 'poll', extractedSize);
    }, 250);

    try {
      try {
        await FileExtractor.extractArchive(sourceArchivePath, tempExtractDir, {
          isCancelled: options.isCancelled,
          onProgress: ({ percent, file }) => {
            if (options.isCancelled?.()) return;
            reportProgress(percent >= 100 ? 95 : percent, file, 'node-7z');
          },
        });
      } finally {
        clearInterval(progressTimer);
      }
    } catch (error) {
      try {
        await fsPromises.rm(tempExtractDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(
          '[installFromArchive] Failed to cleanup cancelled extraction:',
          cleanupError.message,
        );
      }
      throw error;
    }

    if (options.isCancelled?.()) {
      throw new Error('Installation cancelled');
    }

    reportProgress(
      100,
      undefined,
      'complete',
      this.getDirectorySize(tempExtractDir),
    );
    if (options.isCancelled?.()) {
      throw new Error('Installation cancelled');
    }

    const extractedItems = (await fsPromises.readdir(tempExtractDir)).filter(
      (item) => !this.isArchiveMetadataName(item),
    );
    let isSingleFolderExtract = false;

    if (extractedItems.length === 1) {
      const firstItemStat = await fsPromises.stat(
        path.join(tempExtractDir, extractedItems[0]),
      );
      isSingleFolderExtract = firstItemStat.isDirectory();
    }

    const topLevelModDir = isSingleFolderExtract
      ? path.join(tempExtractDir, extractedItems[0])
      : tempExtractDir;

    const resultingMods: {
      modPath: string;
      modName: string;
    }[] = [];

    const dirsWithModFiles =
      this._gatherDirsWithModFiles(tempExtractDir) || tempExtractDir;

    async function _prepareModPath(modDirectory: string) {
      if (options.isCancelled?.()) {
        throw new Error('Installation cancelled');
      }

      const modName = path.basename(modDirectory);
      const modPath = path.join(modsPath, modName);

      resultingMods.push({
        modPath,
        modName,
      });

      try {
        await fsPromises.access(modPath);
        console.log(
          `[installFromArchive] Mod ${modName} already exists, removing old version`,
        );
        await fsPromises.rm(modPath, { recursive: true, force: true });
      } catch {}

      return modPath;
    }

    if (!dirsWithModFiles.length) {
      console.log(
        '[installFromArchive] Copying multiple items to mods folder...',
      );
      await this.copyRecursive(
        tempExtractDir,
        await _prepareModPath(tempExtractDir),
        options.isCancelled,
      );
    } else {
      for (const dir of dirsWithModFiles) {
        if (options.isCancelled?.()) {
          throw new Error('Installation cancelled');
        }

        console.log(
          `[installFromArchive] Copying mod files from ${dir} to mods folder...`,
        );

        const modPath = await _prepareModPath(dir);
        await this.copyRecursive(dir, modPath, options.isCancelled);

        if (dir !== topLevelModDir) {
          const infoTomlSource = path.join(topLevelModDir, 'info.toml');
          const infoTomlDest = path.join(modPath, 'info.toml');

          try {
            await fsPromises.access(infoTomlSource);
            try {
              await fsPromises.access(infoTomlDest);
            } catch {
              await fsPromises.copyFile(infoTomlSource, infoTomlDest);
              console.log(
                '[installFromArchive] Copied info.toml from top level directory',
              );
            }
          } catch {}

          const previewSource = path.join(topLevelModDir, 'preview.webp');
          const previewDest = path.join(modPath, 'preview.webp');

          try {
            await fsPromises.access(previewSource);
            try {
              await fsPromises.access(previewDest);
            } catch {
              await fsPromises.copyFile(previewSource, previewDest);
              console.log(
                '[installFromArchive] Copied preview.webp from top level directory',
              );
            }
          } catch {}
        }
      }
    }

    if (tempExtractDir) {
      try {
        await fsPromises.rm(tempExtractDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(
          '[installFromArchive] Failed to cleanup temp directory:',
          err.message,
        );
      }
    }

    try {
      await fsPromises.unlink(sourceArchivePath);
      console.log('[installFromArchive] Deleted original archive file');
    } catch (err) {
      console.warn(
        '[installFromArchive] Failed to delete original archive:',
        err.message,
      );
    }

    return resultingMods;
  }

  static async installFromDirectory(sourceDirPath: string, modsPath: string) {
    modsPath = resolveVirtualPath(modsPath);
    console.log('Installing mod from directory:', sourceDirPath);
    const modName = path.basename(sourceDirPath);

    let modPath = path.join(modsPath, modName);

    if (fs.existsSync(modPath)) {
      console.log('Mod already exists, removing old version');
      fs.rmSync(modPath, { recursive: true, force: true });
    }

    console.log('Moving mod directory to mods folder...');
    fs.renameSync(sourceDirPath, modPath);

    return { modPath, modName };
  }

  /**
   * Install a mod from a source path (archive or directory) to the mods directory
   * @param {string} sourcePath - Source path (archive file or directory)
   * @param {string} modsPath - Destination mods directory
   * @returns {Promise<Object>} Result object with success status, modPath, and modName
   */
  static async installModFromPath(
    sourcePath: string,
    modsPath: string,
    options: ModInstallOptions = {},
  ): Promise<ModInstallResult> {
    try {
      console.log('[ModUtils] Install mod requested:', {
        sourcePath,
        modsPath,
      });
      modsPath = resolveVirtualPath(modsPath);
      console.log('[ModUtils] Install mod destination resolved:', modsPath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }

      if (!modsPath) {
        throw new Error(
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      if (!fs.existsSync(modsPath)) {
        throw new Error('Mods folder does not exist');
      }

      const stats = fs.statSync(sourcePath);
      const isDirectory = stats.isDirectory();
      const ext = path.extname(sourcePath).toLowerCase();
      const isArchive = ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext);

      let resultingMods: Awaited<ReturnType<typeof this.installFromArchive>>;

      if (isArchive) {
        resultingMods = await this.installFromArchive(
          sourcePath,
          modsPath,
          options,
        );
      } else if (isDirectory) {
        resultingMods = [await this.installFromDirectory(sourcePath, modsPath)];
      } else {
        throw new Error(
          'Source path must be an archive file (.zip, .rar, .7z, etc.) or a directory',
        );
      }

      for (let i = 0; i < resultingMods.length; i++) {
        const { modPath, modName } = resultingMods[i];

        if (/^mod-\d+$/.test(modName) && fs.existsSync(modPath)) {
          const modInfo = this.readModInfo(modPath);

          if (modInfo) {
            const newName = modInfo.s_name || modInfo.display_name;

            if (newName) {
              const sanitizedName = newName
                .replace(/[<>:"/\\|?*]/g, '_')
                .trim();

              if (sanitizedName && sanitizedName !== modName) {
                const newModPath = path.join(modsPath, sanitizedName);

                if (!fs.existsSync(newModPath)) {
                  try {
                    fs.renameSync(modPath, newModPath);

                    console.log(
                      `Mod renamed from ${modName} to ${sanitizedName}`,
                    );

                    resultingMods[i].modPath = newModPath;
                    resultingMods[i].modName = sanitizedName;
                  } catch (renameErr) {
                    console.warn(`Failed to rename mod: ${renameErr.message}`);
                  }
                }
              }
            }
          }
        }

        console.log('Mod installed successfully to:', modPath);

        if (sharedStore.get('autoDisableNewMods')) {
          try {
            const modName = path.basename(modPath);
            const parentDir = path.dirname(modsPath);
            const disabledModsPath = path.join(parentDir, '{disabled_mod}');

            if (!fs.existsSync(disabledModsPath)) {
              fs.mkdirSync(disabledModsPath, { recursive: true });
            }

            const targetPath = path.join(disabledModsPath, modName);

            if (!fs.existsSync(targetPath)) {
              fs.renameSync(modPath, targetPath);

              console.log(
                `[AutoDisable] Moved ${modName} to disabled mods folder`,
              );

              resultingMods[i].modPath = targetPath;
            } else {
              console.warn(
                `[AutoDisable] Cannot move ${modName}, target already exists`,
              );
            }
          } catch (disableError) {
            console.error('[AutoDisable] Failed to disable mod:', disableError);
          }
        }
      }

      return {
        success: true,
        resultingMods,
      };
    } catch (error) {
      console.error('Error installing mod from path:', error);
      return { success: false, error: error.message };
    }
  }
}
