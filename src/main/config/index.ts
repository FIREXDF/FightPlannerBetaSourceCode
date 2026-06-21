import * as path from 'path';
import { app } from 'electron';

export const CONFLICT_WHITELIST_PATTERNS = [
  'ui_chara_db.prcxml',
  'info.toml',
  'preview.webp',
  'msg_name.xmsbt',
  'config.json',
  'msg_bgm.xmsbt',
  'ui_chara_db.prcx',
  'plugin.nro',
  'victory.toml',
  'README.txt',
  'READ ME.txt',
  'Preview.webp',
  '.DS_Store',
  'Readme.txt',
];

export const TEMP_FOLDERS = ['fightplanner-downloads', 'fightplanner-extract'];

export const PATHS = {
  logsDir: () => path.join(app.getPath('userData'), 'logs'),
  tempDir: () => app.getPath('temp'),
  localesDir: () => path.join(app.getAppPath(), 'assets', 'locales'),
  dataDir: () => path.join(app.getAppPath(), 'assets', 'data'),
};

export const ENV = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production' || !process.env.NODE_ENV,
};

export function validateConfig() {
  try {
    if (!app.isReady()) {
      throw new Error('App is not ready');
    }
    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    return false;
  }
}
