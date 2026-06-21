import { app, BrowserWindow, dialog, IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import store from '../../store';
import {
  BaseHandlerArg,
  GenericHandler,
  HandlerResponse,
} from '../../types/common';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';

export type ConfigBackupHandlers = typeof ConfigBackupHandlers;

const BACKUP_FORMAT = 'fightplanner-config-backup';
const BACKUP_VERSION = 1;
const DATA_DIR_NAME = 'data';

interface BackedUpFile {
  relativePath: string;
  content: string;
}

interface BackedUpCustomFile {
  path: string;
  content: string;
}

interface FightPlannerConfigBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  store: Record<string, unknown>;
  dataFiles: BackedUpFile[];
  customFiles: BackedUpCustomFile[];
}

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getUserDataPath(...segments: string[]) {
  return path.join(app.getPath('userData'), ...segments);
}

function readDataFiles(): BackedUpFile[] {
  const dataDir = getUserDataPath(DATA_DIR_NAME);
  if (!fs.existsSync(dataDir)) {
    return [];
  }

  return fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(dataDir, entry.name);
      return {
        relativePath: path.posix.join(DATA_DIR_NAME, entry.name),
        content: fs.readFileSync(filePath, 'utf8'),
      };
    });
}

function readCustomFiles(): BackedUpCustomFile[] {
  const customPaths = [
    ...(((store.get('customCssPaths') as string[] | undefined) ||
      []) as string[]),
    ...(((store.get('customJsPaths') as string[] | undefined) ||
      []) as string[]),
  ];

  return [...new Set(customPaths)]
    .filter((filePath) => typeof filePath === 'string' && filePath.length > 0)
    .filter(
      (filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
    )
    .map((filePath) => ({
      path: filePath,
      content: fs.readFileSync(filePath, 'utf8'),
    }));
}

function validateBackup(value: unknown): FightPlannerConfigBackup {
  const backup = value as Partial<FightPlannerConfigBackup>;

  if (
    !backup ||
    backup.format !== BACKUP_FORMAT ||
    backup.version !== BACKUP_VERSION ||
    !backup.store ||
    !Array.isArray(backup.dataFiles)
  ) {
    throw new Error('Invalid FightPlanner backup file');
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: String(backup.exportedAt || ''),
    appVersion: String(backup.appVersion || ''),
    store: backup.store as Record<string, unknown>,
    dataFiles: backup.dataFiles,
    customFiles: Array.isArray(backup.customFiles) ? backup.customFiles : [],
  };
}

function restoreDataFiles(files: BackedUpFile[]) {
  const userDataDir = app.getPath('userData');
  const dataDir = getUserDataPath(DATA_DIR_NAME);
  if (fs.existsSync(dataDir)) {
    for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        fs.unlinkSync(path.join(dataDir, entry.name));
      }
    }
  }

  for (const file of files) {
    const relativePath = file.relativePath.replace(/\\/g, '/');
    const relativeSegments = relativePath.split('/');
    if (
      path.isAbsolute(relativePath) ||
      relativePath.startsWith('..') ||
      relativeSegments[0] !== DATA_DIR_NAME ||
      relativeSegments.length !== 2 ||
      relativeSegments.some((segment) => !segment || segment === '..')
    ) {
      throw new Error(`Unsafe backup path: ${file.relativePath}`);
    }

    const targetPath = path.join(userDataDir, ...relativeSegments);
    ensureDirectory(path.dirname(targetPath));
    fs.writeFileSync(targetPath, file.content, 'utf8');
  }
}

function restoreCustomFiles(files: BackedUpCustomFile[]) {
  let restored = 0;
  let skipped = 0;

  for (const file of files) {
    if (!file.path || !path.isAbsolute(file.path)) {
      skipped += 1;
      continue;
    }

    try {
      ensureDirectory(path.dirname(file.path));
      fs.writeFileSync(file.path, file.content, 'utf8');
      restored += 1;
    } catch (error) {
      console.warn(
        '[ConfigBackup] Failed to restore custom file:',
        file.path,
        error,
      );
      skipped += 1;
    }
  }

  return { restored, skipped };
}

const ConfigBackupHandlers = {
  ['export-config-backup']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{ filePath: string }> => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;
      const appVersion = app.getVersion();
      const defaultPath = `fightplanner-v${appVersion}-config-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const result = await dialog.showSaveDialog(win, {
        title: 'Export FightPlanner Configuration',
        defaultPath,
        filters: [
          { name: 'FightPlanner Config Backup', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const backup: FightPlannerConfigBackup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        store: store.store as Record<string, unknown>,
        dataFiles: readDataFiles(),
        customFiles: readCustomFiles(),
      };

      fs.writeFileSync(
        result.filePath,
        JSON.stringify(backup, null, 2),
        'utf8',
      );
      return { success: true, filePath: result.filePath };
    } catch (error) {
      handleError(error, 'export-config-backup');
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
    }
  },

  ['restore-config-backup']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    filePath: string;
    restoredCustomFiles: number;
    skippedCustomFiles: number;
  }> => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;
      const result = await dialog.showOpenDialog(win, {
        title: 'Restore FightPlanner Configuration',
        properties: ['openFile'],
        filters: [
          { name: 'FightPlanner Config Backup', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const backup = validateBackup(
        JSON.parse(fs.readFileSync(filePath, 'utf8')),
      );
      const currentAppVersion = app.getVersion();

      if (backup.appVersion && backup.appVersion !== currentAppVersion) {
        const warningResult = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Cancel', 'Restore anyway'],
          defaultId: 0,
          cancelId: 0,
          title: 'FightPlanner version mismatch',
          message:
            'This backup was created with a different FightPlanner version.',
          detail: `Backup version: ${backup.appVersion}\nCurrent version: ${currentAppVersion}\n\nRestoring it may break or downgrade some settings if the configuration format changed. Continue only if you trust this backup.`,
        });

        if (warningResult.response !== 1) {
          return { success: false, canceled: true };
        }
      }

      store.clear();
      Object.entries(backup.store).forEach(([key, value]) => {
        store.set(key, value);
      });

      restoreDataFiles(backup.dataFiles);
      const customResult = restoreCustomFiles(backup.customFiles);
      store.set('configRestore.completedAt', new Date().toISOString());

      return {
        success: true,
        filePath,
        restoredCustomFiles: customResult.restored,
        skippedCustomFiles: customResult.skipped,
      };
    } catch (error) {
      handleError(error, 'restore-config-backup');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },
} as const;

export function registerConfigBackupHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ConfigBackupHandlers) as Array<
    keyof typeof ConfigBackupHandlers
  >) {
    const handler = ConfigBackupHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
