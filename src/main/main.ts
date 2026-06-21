import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import store from './store';
import { initializeProtocol } from './main-protocol-setup';
import { createTutorialWindow } from './tutorial-window';
import { migrateFromV3 } from './migration';
import DiscordRPCManager from './discord-rpc';
import { registerAllHandlers } from './ipc';
import { PATHS } from './config';
import autoUpdater from './auto-updater';
import { initPosthog, identifyUser, shutdownPosthog, captureError, captureEvent } from './posthog';

// Global Error Catchers for PostHog
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error);
  captureError(error, { source: 'main_uncaught_exception', fatal: true });
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Main] Unhandled Rejection:', reason);
  captureError(reason instanceof Error ? reason : new Error(String(reason)), { source: 'main_unhandled_rejection', fatal: true });
});

app.on('render-process-gone', (event, webContents, details) => {
  console.error('[Main] Renderer Process Gone:', details);
  captureEvent('renderer_crash', { reason: details.reason, exitCode: details.exitCode });
});

app.on('child-process-gone', (event, details) => {
  console.error('[Main] Child Process Gone:', details);
  captureEvent('child_process_crash', { type: details.type, reason: details.reason, name: details.name });
});

const logsDir = PATHS.logsDir();
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function cleanOldLogs(retentionDays: number) {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('app-') || !file.endsWith('.log')) continue;

      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
}

const logRetentionDays = (store.get('logRetentionDays') as number) || 7;
cleanOldLogs(logRetentionDays);

const logFilePath = path.join(
  logsDir,
  `app-${new Date().toISOString().split('T')[0]}.log`,
);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

let mainWindow: BrowserWindow | null = null;
let discordRPC: DiscordRPCManager | null = null;

function setupWebUsbPermissions() {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return String(permission) === 'usb';
  });

  defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(String(permission) === 'usb');
    },
  );

  defaultSession.setDevicePermissionHandler((details) => {
    return details.deviceType === 'usb';
  });

  defaultSession.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();

    const mtpDevice = details.deviceList.find((device) => {
      return device.deviceClass === 0x06;
    });

    callback((mtpDevice || details.deviceList[0])?.deviceId);
  });
}

export interface MainEvents {
  'main-log': { level: string; message: string; timestamp: string };
}

function sendToRenderer(
  channel: keyof MainEvents,
  data: MainEvents[typeof channel],
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function writeLog(level, args) {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  const logLine = `[${timestamp}] [${level.toUpperCase()}] [MAIN] ${message}\n`;
  logStream.write(logLine);

  if (mainWindow && !mainWindow.isDestroyed()) {
    sendToRenderer('main-log', {
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

console.log = (...args) => {
  writeLog('log', args);
  originalConsoleLog.apply(console, args);
};

console.warn = (...args) => {
  writeLog('warn', args);
  originalConsoleWarn.apply(console, args);
};

console.error = (...args) => {
  writeLog('error', args);
  originalConsoleError.apply(console, args);
};

interface CreateWindowOptions {
  startup?: boolean;
  postTutorialIntro?: boolean;
}

function createWindow(options: CreateWindowOptions = {}) {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    icon: path.join(app.getAppPath(), 'assets', 'app-icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['--window-type=main'],
    },
    backgroundColor: '#1a1a1a',
    frame: false,
    transparent: false,
    hasShadow: true,
    show: false,
  });

  mainWindow.webContents.on('will-navigate', (event, _url) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.webContents.on(
    'will-attach-webview',
    (event, webPreferences, _params) => {
      webPreferences.nodeIntegration = false;
    },
  );

  let windowShown = false;

  const showWindow = () => {
    if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
      windowShown = true;
      mainWindow.show();

      if (options.postTutorialIntro) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('start-intro-animation');
          }
        }, 500);
      }

    }
  };

  const showTimeout = setTimeout(
    () => {
      if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
        console.log('[linux] Force showing window after timeout');
        showWindow();
      }
    },
    process.platform === 'linux' ? 2000 : 5000,
  );

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    showWindow();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (!windowShown && process.platform === 'linux') {
      console.log(
        '[linux] Window not shown yet, showing after did-finish-load',
      );
      clearTimeout(showTimeout);
      showWindow();
    }
  });

  mainWindow.webContents.on('dom-ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        document.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
        document.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      `);
    }
  });

  const loadPath = path.join(app.getAppPath(), 'assets', 'pages', 'index.html');

  const query: Record<string, string> = {};
  if (options.startup) {
    query.startup = 'true';
  }
  if (options.postTutorialIntro) {
    query.postTutorialIntro = 'true';
  }

  if (Object.keys(query).length > 0) {
    mainWindow.loadFile(loadPath, { query });
  } else {
    mainWindow.loadFile(loadPath);
  }

  if (!discordRPC) {
    discordRPC = new DiscordRPCManager();
    discordRPC.connect().catch((err) => {
      console.warn('Could not connect to Discord:', err.message);
    });
  }

  mainWindow.on('closed', () => {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
  });

  initializeProtocol(mainWindow);

  autoUpdater.setMainWindow(mainWindow);
  autoUpdater.checkForUpdatesOnStartup();

  const fppArg = process.argv.find(arg => arg.endsWith('.fpp'));
  if (fppArg && fs.existsSync(fppArg)) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-fpp-file', { filePath: fppArg });
        }
      }, 2000);
    });
  }

  return mainWindow;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    const fppFile = commandLine.find(arg => arg.endsWith('.fpp'));
    if (fppFile && fs.existsSync(fppFile) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-fpp-file', { filePath: fppFile });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupWebUsbPermissions();
    registerAllHandlers(ipcMain, discordRPC);

    // Initialize PostHog analytics
    initPosthog();
    identifyUser();

    console.log('Checking for FightPlanner 3 settings...');
    const migrationResult = await migrateFromV3();

    if (migrationResult.migrated) {
      console.log('Settings migrated from FightPlanner 3');
      console.log(
        'Migrated:',
        Object.keys(migrationResult.settings || {}).join(', '),
      );
    }

    const hasLaunchedBefore = await store.get('hasLaunchedBefore');

    if (!hasLaunchedBefore) {
      console.log('First launch - opening tutorial only');
      await store.set('hasLaunchedBefore', true);

      const tempWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
        },
      });

      const tutWindow = createTutorialWindow(tempWindow);

      tutWindow.on('closed', () => {
        tempWindow.close();

        console.log('omg he finish the tutorial lets gooo, go to the main app');
        createWindow({ postTutorialIntro: true });
      });
    } else {
      createWindow({ startup: true });
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow({ startup: true });
      }
    });
  });

  app.on('window-all-closed', function () {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('quit', async () => {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
    await shutdownPosthog();
  });
}
