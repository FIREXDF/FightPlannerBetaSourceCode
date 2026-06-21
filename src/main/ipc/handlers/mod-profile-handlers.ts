import { app, IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import store from '../../store';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';
import { BaseHandlerArg, GenericHandler, HandlerResponse } from '../../types/common';

type ModProfileEntry = {
  name: string;
  hash?: string;
  enabled: boolean;
};

type ModProfile = {
  id: string;
  name: string;
  mods: ModProfileEntry[];
  plugins: ModProfileEntry[];
  createdAt: string;
  updatedAt: string;
};

type ModProfilesFile = {
  profiles: ModProfile[];
  activeProfileId: string | null;
};

const LEGACY_PROFILES_KEY = 'modProfiles';
const LEGACY_ACTIVE_PROFILE_KEY = 'activeModProfileId';

function getProfilesFilePath() {
  return path.join(app.getPath('userData'), 'mod-profiles.json');
}

function getEmptyProfilesFile(): ModProfilesFile {
  return {
    profiles: [],
    activeProfileId: null,
  };
}

function normalizeProfilesFile(value: unknown): ModProfilesFile {
  if (!value || typeof value !== 'object') {
    return getEmptyProfilesFile();
  }

  const data = value as Partial<ModProfilesFile>;
  return {
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    activeProfileId:
      typeof data.activeProfileId === 'string' ? data.activeProfileId : null,
  };
}

function readProfilesFile(): ModProfilesFile {
  const filePath = getProfilesFilePath();

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return normalizeProfilesFile(JSON.parse(raw));
  }

  const legacyProfiles = store.get(LEGACY_PROFILES_KEY);
  const legacyActiveProfileId = store.get(LEGACY_ACTIVE_PROFILE_KEY);
  const migratedData = normalizeProfilesFile({
    profiles: legacyProfiles,
    activeProfileId: legacyActiveProfileId,
  });

  writeProfilesFile(migratedData);

  if (Array.isArray(legacyProfiles)) {
    store.delete(LEGACY_PROFILES_KEY);
  }
  if (typeof legacyActiveProfileId === 'string') {
    store.delete(LEGACY_ACTIVE_PROFILE_KEY);
  }

  return migratedData;
}

function writeProfilesFile(data: ModProfilesFile) {
  const filePath = getProfilesFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export type ModProfileHandlers = typeof ModProfileHandlers;

const ModProfileHandlers = {
  ['load-mod-profiles']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<ModProfilesFile & { filePath: string }> => {
    try {
      return {
        success: true,
        ...readProfilesFile(),
        filePath: getProfilesFilePath(),
      };
    } catch (error) {
      handleError(error, 'load-mod-profiles');
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  ['save-mod-profiles']: async (
    common: BaseHandlerArg,
    data: ModProfilesFile,
  ): HandlerResponse<{ filePath: string }> => {
    try {
      const normalizedData = normalizeProfilesFile(data);
      writeProfilesFile(normalizedData);

      return {
        success: true,
        filePath: getProfilesFilePath(),
      };
    } catch (error) {
      handleError(error, 'save-mod-profiles');
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },
} as const;

export function registerModProfileHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ModProfileHandlers) as Array<
    keyof typeof ModProfileHandlers
  >) {
    const handler = ModProfileHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
