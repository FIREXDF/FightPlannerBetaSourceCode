import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const LEGACY_APP_NAMES = ['FightPlanner', 'fightplanner'];

function copyMissingEntries(from: string, to: string): void {
  if (!fs.existsSync(from)) return;

  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);

    try {
      if (entry.isDirectory()) {
        copyMissingEntries(source, destination);
      } else if (!fs.existsSync(destination)) {
        fs.copyFileSync(source, destination);
      }
    } catch (error) {
      console.error(
        `[user-data-migration] Could not copy ${entry.name}:`,
        error,
      );
    }
  }
}

export function migrateLegacyUserData(): void {
  try {
    const currentUserData = app.getPath('userData');
    const appDataDir = app.getPath('appData');

    for (const legacyAppName of LEGACY_APP_NAMES) {
      const legacyUserData = path.join(appDataDir, legacyAppName);

      if (path.normalize(legacyUserData) === path.normalize(currentUserData)) {
        continue;
      }

      if (!fs.existsSync(legacyUserData)) {
        continue;
      }

      console.log(
        `[user-data-migration] Importing legacy data from ${legacyUserData}`,
      );
      copyMissingEntries(legacyUserData, currentUserData);
      return;
    }
  } catch (error) {
    console.error('[user-data-migration] Failed to import legacy data:', error);
  }
}

migrateLegacyUserData();
