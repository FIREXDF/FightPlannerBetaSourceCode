import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { UpdateInfo } from 'electron-updater';
import store from './store';

export interface UpdateEvents {
  'update-checking': {};

  'update-available': {
    version: string;
    releaseNotes: string | string[];
    releaseDate: string;
    files: Array<{
      url: string;
      sha512: string;
    }>;
  };

  'update-not-available': {
    version: string;
    latestVersion?: string;
  };

  'update-error': {
    message: string;
  };

  'update-download-progress': {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };

  'update-downloaded': {
    version: string;
    releaseDate: string;
  };
}

class AutoUpdater {
  mainWindow: BrowserWindow | null;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  updateDownloaded: boolean;
  autoCheckEnabled: boolean;
  updateChannel: string;
  forceUpdateAvailable: boolean;
  ignoreUpdateCertErrors: boolean;
  disableUpdateSignatureCheck: boolean;

  constructor() {
    this.mainWindow = null;
    this.updateInfo = null;
    this.isChecking = false;
    this.isDownloading = false;
    this.updateDownloaded = false;
    this.autoCheckEnabled = store.get('autoCheckForUpdates', true) as boolean;
    this.updateChannel = this.normalizeUpdateChannel(
      store.get('updateChannel', 'public-beta') as string,
    );
    store.set('updateChannel', this.updateChannel);
    this.forceUpdateAvailable = store.get(
      'developer.forceUpdateAvailable',
      false,
    ) as boolean;
    const envIgnoreCertErrors =
      process.env.UPDATE_IGNORE_CERT_ERRORS === 'true';
    const envDisableSigCheck =
      process.env.UPDATE_DISABLE_SIGNATURE_CHECK === 'true';
    const argIgnoreCertErrors = process.argv.includes(
      '--update-ignore-cert-errors',
    );
    const argDisableSigCheck = process.argv.includes(
      '--update-disable-signature-check',
    );
    this.ignoreUpdateCertErrors =
      envIgnoreCertErrors ||
      argIgnoreCertErrors ||
      (store.get('developer.ignoreUpdateCertErrors', false) as boolean);
    this.disableUpdateSignatureCheck =
      envDisableSigCheck ||
      argDisableSigCheck ||
      (store.get('developer.disableUpdateSignatureCheck', false) as boolean);

    autoUpdater.requestHeaders = { 'Cache-Control': 'no-cache' };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    if (this.disableUpdateSignatureCheck) {
      if ('verifyUpdateCodeSignature' in autoUpdater) {
        autoUpdater.verifyUpdateCodeSignature = false;
      }
      process.env.ELECTRON_UPDATER_SKIP_SIGNATURE_CHECK = 'true';
    }
    if (this.ignoreUpdateCertErrors) {
      app.commandLine.appendSwitch('ignore-certificate-errors');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    autoUpdater.allowPrerelease = true;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      this.isChecking = true;
      this.sendToRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      this.isChecking = false;
      this.updateInfo = info;
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
        files: info.files,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      this.isChecking = false;
      this.sendToRenderer('update-not-available', {
        version: app.getVersion(),
        latestVersion: info?.version,
      });
    });

    autoUpdater.on('error', (error) => {
      this.isChecking = false;
      const wasDownloading = this.isDownloading;
      this.isDownloading = false;
      if (!wasDownloading) {
        console.warn('[AutoUpdater] Update check failed:', error.message);
        return;
      }
      this.sendToRenderer('update-error', {
        message: error.message,
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      this.sendToRenderer('update-download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.isDownloading = false;
      this.updateDownloaded = true;
      this.sendToRenderer('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  sendToRenderer(
    channel: keyof UpdateEvents,
    data: UpdateEvents[typeof channel] = {},
  ) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates() {
    if (this.isChecking) {
      return { success: false, checking: true };
    }
    if (!app.isPackaged) {
      return {
        success: false,
        error: 'Updates are only available in packaged builds',
      };
    }

    try {
      const previousUpdateInfo = this.updateInfo;
      this.updateInfo = null;
      const result = await autoUpdater.checkForUpdates();

      if (previousUpdateInfo?.version?.includes('simulator')) {
        this.updateInfo = previousUpdateInfo;
      }

      if (!this.updateInfo) {
        return {
          success: true,
          updateInfo: null,
          latestVersion: result?.updateInfo?.version,
        };
      }

      return { success: true, updateInfo: this.updateInfo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async downloadUpdate(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      if (!this.updateInfo) {
        const checkResult = await this.checkForUpdates();
        if (!checkResult.success) {
          return checkResult;
        }
      }

      if (
        this.updateInfo &&
        this.updateInfo.version &&
        this.updateInfo.version.includes('simulator')
      ) {
        this.isDownloading = true;
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          if (progress > 100) {
            clearInterval(interval);
            this.isDownloading = false;
            this.updateDownloaded = true;

            this.sendToRenderer('update-downloaded', {
              version: this.updateInfo!.version,
              releaseDate: this.updateInfo!.releaseDate,
            });
          } else {
            this.sendToRenderer('update-download-progress', {
              percent: progress,
              transferred: progress * 1024 * 1024,
              total: 100 * 1024 * 1024,
              bytesPerSecond: 10 * 1024 * 1024,
            });
          }
        }, 500);
        return { success: true };
      }

      if (!this.updateInfo) {
        return { success: false, error: 'No update available' };
      }

      this.isDownloading = true;
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      this.isDownloading = false;
      return { success: false, error: error.message };
    }
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
  }

  checkForUpdatesOnStartup() {
    setTimeout(async () => {
      if (this.autoCheckEnabled) {
        await this.checkForUpdates();
      }
    }, 5000);
  }

  setAutoCheckEnabled(enabled: boolean) {
    this.autoCheckEnabled = enabled;
    store.set('autoCheckForUpdates', enabled);
  }

  getAutoCheckEnabled() {
    return this.autoCheckEnabled;
  }

  setUpdateChannel(channel: string) {
    this.updateChannel = this.normalizeUpdateChannel(channel);
    store.set('updateChannel', this.updateChannel);

    autoUpdater.allowPrerelease = true;
  }

  getUpdateChannel() {
    return this.updateChannel;
  }

  private normalizeUpdateChannel(_channel: string) {
    return 'public-beta';
  }

  getUpdateInfo() {
    return this.updateInfo;
  }

  setForceUpdateAvailable(value: boolean) {
    this.forceUpdateAvailable = value;
    store.set('developer.forceUpdateAvailable', value);
  }

  getForceUpdateAvailable() {
    return this.forceUpdateAvailable;
  }

  setIgnoreUpdateCertErrors(value: boolean) {
    this.ignoreUpdateCertErrors = value;
    store.set('developer.ignoreUpdateCertErrors', value);
  }

  getIgnoreUpdateCertErrors() {
    return this.ignoreUpdateCertErrors;
  }

  setDisableUpdateSignatureCheck(value: boolean) {
    this.disableUpdateSignatureCheck = value;
    store.set('developer.disableUpdateSignatureCheck', value);
  }

  getDisableUpdateSignatureCheck() {
    return this.disableUpdateSignatureCheck;
  }

  simulateUpdate() {
    const dummyUpdateInfo: UpdateInfo = {
      version: '9.9.9-simulator',
      releaseNotes:
        '<h2>Simulation Update</h2><p>This is a simulated update to test the UI.</p><ul><li>Feature 1</li><li>Feature 2</li></ul>',
      releaseDate: new Date().toISOString(),
      files: [],
      path: '',
      sha512: '',
    };

    this.updateInfo = dummyUpdateInfo;
    this.sendToRenderer('update-available', dummyUpdateInfo);
    return { success: true };
  }
}

const autoUpdaterInstance = new AutoUpdater();

export default autoUpdaterInstance;
