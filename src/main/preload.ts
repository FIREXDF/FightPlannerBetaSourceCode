import { contextBridge, ipcRenderer, webUtils } from 'electron';

import { FileHandlers } from './ipc/handlers/file-handlers';
import { ModHandlers } from './ipc/handlers/mod-handlers';
import { PluginHandlers } from './ipc/handlers/plugin-handlers';
import { StoreHandlers } from './ipc/handlers/store-handlers';
import { AppHandlers } from './ipc/handlers/app-handlers';
import { SystemHandlers } from './ipc/handlers/system-handlers';
import { ProtocolHandlers } from './ipc/handlers/protocol-handlers';
import { FtpHandlers, MtpHandlers } from './ipc/handlers/ftp-handlers';
import { UpdateHandlers } from './ipc/handlers/update-handlers';
import { TutorialHandlers } from './ipc/handlers/tutorial-handlers';
import { MigrationHandlers } from './ipc/handlers/migration-handlers';
import { FppHandlers } from './ipc/handlers/fpp-handlers';
import { StageHandlers } from './ipc/handlers/stage-handlers';
import { CharacterCssHandlers } from './ipc/handlers/character-css-handlers';
import { ModProfileHandlers } from './ipc/handlers/mod-profile-handlers';
import { ConfigBackupHandlers } from './ipc/handlers/config-backup-handlers';
import { FeedbackHandlers } from './ipc/handlers/feedback-handlers';
import { ParamsWithoutFirstArg } from './types/common';
import { WindowHandlers } from './ipc/handlers/window-handlers';
import { DiscordHandlers } from './ipc/handlers/discord-handlers';
import { AnalyticsHandlers } from './ipc/handlers/analytics-handlers';
import { ProtocolHandlerEvents } from './protocol-handler';
import { MainEvents } from './main';
import { AnimationEvents } from './animations/animation-handler';
import { UpdateEvents } from './auto-updater';

/**
 * Wraps an IPC invoke call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature.
 *
 * @returns A curried function that first accepts a channel, then returns a function
 * that invokes the IPC channel with the correct parameters and return type as defined by the handler.
 *
 * @example
 * const invoke = wrapInvoke<MyHandlers>();
 * const myHandler = invoke('my-channel');
 * const result = await myHandler(arg1, arg2);
 */
function wrapInvoke<
  Handlers extends Record<string, (...args: any[]) => any>,
>() {
  return <K extends keyof Handlers>(channel: K) => {
    return ((...args: any[]) =>
      ipcRenderer.invoke(channel as string, ...args)) as (
        ...args: ParamsWithoutFirstArg<Handlers[K]>
      ) => ReturnType<Handlers[K]>;
  };
}

/**
 * Wraps an IPC on call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature.
 *
 * @returns A curried function that first accepts a channel, then returns a function
 * that sets up an IPC listener for that channel with the correct parameters as defined by the handler.
 *
 * @example
 * const wrap = wrapEventCallback<MyHandlers>();
 * const myHandler = wrap('my-channel');
 * myHandler((arg1, arg2) => { ... });
 */
function wrapEventCallback<Events extends Record<string, any>>() {
  return <K extends keyof Events>(channel: K) => {
    return (callback: (data: Events[typeof channel]) => any) =>
      ipcRenderer.on(channel as string, (event, data: Events[typeof channel]) =>
        callback(data),
      );
  };
}

const invokeFileHandler = wrapInvoke<FileHandlers>();
const invokeModHandler = wrapInvoke<ModHandlers>();
const invokePluginHandler = wrapInvoke<PluginHandlers>();
const invokeStoreHandler = wrapInvoke<StoreHandlers>();
const invokeAppHandler = wrapInvoke<AppHandlers>();
const invokeSystemHandler = wrapInvoke<SystemHandlers>();
const invokeProtocolHandler = wrapInvoke<ProtocolHandlers>();
const invokeFtpHandler = wrapInvoke<FtpHandlers>();
const invokeMtpHandler = wrapInvoke<MtpHandlers>();
const invokeUpdateHandler = wrapInvoke<UpdateHandlers>();
const invokeTutorialHandler = wrapInvoke<TutorialHandlers>();
const invokeMigrationHandler = wrapInvoke<MigrationHandlers>();
const invokeWindowHandler = wrapInvoke<WindowHandlers>();
const invokeDiscordHandler = wrapInvoke<DiscordHandlers>();
const invokeAnalyticsHandler = wrapInvoke<AnalyticsHandlers>();
const invokeFppHandler = wrapInvoke<FppHandlers>();
const invokeStageHandler = wrapInvoke<StageHandlers>();
const invokeCharacterCssHandler = wrapInvoke<CharacterCssHandlers>();
const invokeModProfileHandler = wrapInvoke<ModProfileHandlers>();
const invokeConfigBackupHandler = wrapInvoke<ConfigBackupHandlers>();
const invokeFeedbackHandler = wrapInvoke<FeedbackHandlers>();

const registerProtocolCallback = wrapEventCallback<ProtocolHandlerEvents>();
const registerMainCallback = wrapEventCallback<MainEvents>();
const registerAnimationCallback = wrapEventCallback<AnimationEvents>();
const registerRendererCallback = wrapEventCallback<UpdateEvents>();

const electronAPI = {
  selectGameFile: invokeFileHandler('select-game-file'),
  selectFolder: invokeFileHandler('select-folder'),
  selectEmulatorFile: invokeFileHandler('select-emulator-file'),
  readModsFolder: invokeModHandler('read-mods-folder'),
  getPreviewImage: invokeModHandler('get-preview-image'),
  saveModPreview: invokeModHandler('save-mod-preview'),
  getModInfo: invokeModHandler('get-mod-info'),
  saveModInfo: invokeModHandler('save-mod-info'),
  readModInfoRaw: invokeModHandler('read-mod-info-raw'),
  saveModInfoRaw: invokeModHandler('save-mod-info-raw'),
  openFolder: invokeFileHandler('open-folder'),
  folderExists: invokeFileHandler('folder-exists'),
  openFile: invokeFileHandler('open-file'),
  openUrl: invokeSystemHandler('open-url'),
  openFightPlannerLink: invokeSystemHandler('open-fightplanner-link'),
  renameMod: invokeModHandler('rename-mod'),
  deleteMod: invokeModHandler('delete-mod'),
  deleteConflictFile: invokeModHandler('delete-conflict-file'),
  toggleMod: invokeModHandler('toggle-mod'),
  applyModBatchState: invokeModHandler('apply-mod-batch-state'),
  ensureModsFolderAvailable: invokeModHandler('ensure-mods-folder-available'),
  readPluginsFolder: invokePluginHandler('read-plugins-folder'),
  selectPluginFile: invokePluginHandler('select-plugin-file'),
  togglePlugin: invokePluginHandler('toggle-plugin'),
  applyPluginBatchState: invokePluginHandler('apply-plugin-batch-state'),
  ensurePluginsFolderAvailable: invokePluginHandler(
    'ensure-plugins-folder-available',
  ),
  deletePlugin: invokePluginHandler('delete-plugin'),
  checkPluginUpdates: invokePluginHandler('check-plugin-updates'),
  updatePlugin: invokePluginHandler('update-plugin'),
  inspectCskCollectionArchive: invokePluginHandler(
    'inspect-csk-collection-archive',
  ),
  installCskCollection: invokePluginHandler('install-csk-collection'),
  installOneSlotEffects: invokePluginHandler('install-one-slot-effects'),
  getPluginRepoMapping: invokePluginHandler('get-plugin-repo-mapping'),
  setPluginRepoMapping: invokePluginHandler('set-plugin-repo-mapping'),
  getAppVersion: invokeAppHandler('get-app-version'),
  relaunchApp: invokeAppHandler('relaunch-app'),
  scanMod: invokeModHandler('scan-mod'),
  changeSlots: invokeModHandler('change-slots'),
  detectConflicts: invokeModHandler('detect-conflicts'),
  checkNroLimit: invokeModHandler('check-nro-limit'),
  openTutorialWindow: invokeTutorialHandler('open-tutorial-window'),
  cancelDownload: invokeSystemHandler('cancel-download'),
  resumeDownload: invokeSystemHandler('resume-download'),
  sendModsToSwitch: invokeFtpHandler('send-mods-to-switch'),
  prepareMtpTransfer: invokeMtpHandler('prepare-mtp-transfer'),
  readMtpTransferFile: invokeMtpHandler('read-mtp-transfer-file'),
  installModFromPath: invokeModHandler('install-mod-from-path'),
  selectModFile: invokeFileHandler('select-mod-file'),
  handleFilesDropped: invokeModHandler('handle-files-dropped'),
  getLogsPath: invokeSystemHandler('get-logs-path'),
  readLogFile: invokeSystemHandler('read-log-file'),
  selectCustomFile: invokeFileHandler('select-custom-file'),
  readCustomFile: invokeFileHandler('read-custom-file'),
  clearTempFiles: invokeSystemHandler('clear-temp-files'),
  confirmProtocolInstall: invokeProtocolHandler('confirm-protocol-install'),
  cancelProtocolInstall: invokeProtocolHandler('cancel-protocol-install'),
  fetchGameBananaPreview: invokeProtocolHandler('fetch-gamebanana-preview'),
  fetchGameBananaDetails: invokeProtocolHandler('fetch-gamebanana-details'),
  fetchGameBananaFiles: invokeProtocolHandler('fetch-gamebanana-files'),
  scanGameBananaReadme: invokeProtocolHandler('scan-gamebanana-readme'),
  launchEmulator: invokeSystemHandler('launch-emulator'),
  loadLocale: invokeSystemHandler('load-locale'),
  getAvailableDrives: invokeSystemHandler('get-available-drives'),
  checkPathAccessible: invokeSystemHandler('check-path-accessible'),
  saveFileDialog: invokeFileHandler('save-file-dialog'),
  writeFile: invokeFileHandler('write-file'),
  checkForUpdates: invokeUpdateHandler('check-for-updates'),
  downloadUpdate: invokeUpdateHandler('download-update'),
  installUpdate: invokeUpdateHandler('install-update'),
  getUpdateInfo: invokeUpdateHandler('get-update-info'),
  setAutoCheckEnabled: invokeUpdateHandler('set-auto-check-enabled'),
  getAutoCheckEnabled: invokeUpdateHandler('get-auto-check-enabled'),
  setUpdateChannel: invokeUpdateHandler('set-update-channel'),
  getUpdateChannel: invokeUpdateHandler('get-update-channel'),
  setForceUpdate: invokeUpdateHandler('set-force-update'),
  getForceUpdate: invokeUpdateHandler('get-force-update'),
  simulateUpdate: invokeUpdateHandler('simulate-update'),
  minimize: invokeWindowHandler('minimize-window'),
  maximize: invokeWindowHandler('maximize-window'),
  close: invokeWindowHandler('close-window'),
  updateDiscordRPC: invokeDiscordHandler('discord-rpc-update'),

  // Analytics
  trackEvent: invokeAnalyticsHandler('analytics-track-event'),
  trackError: invokeAnalyticsHandler('analytics-track-error'),
  testPosthogEvent: invokeAnalyticsHandler('analytics-test-event'),
  testPosthogError: invokeAnalyticsHandler('analytics-test-error'),
  getAnalyticsEnabled: invokeAnalyticsHandler('analytics-get-enabled'),
  setAnalyticsEnabled: invokeAnalyticsHandler('analytics-set-enabled'),

  openConfigFile: invokeSystemHandler('open-config-file'),

  createFpp: (name: string, fppVersion: string, thumbnailPath: string | null, modPaths: string[]) => ipcRenderer.invoke('createFpp', name, fppVersion, thumbnailPath, modPaths),
  readFpp: (fppPath: string) => ipcRenderer.invoke('read-fpp', fppPath),
  installFpp: invokeFppHandler('install-fpp'),
  selectFppFile: invokeFppHandler('select-fpp-file'),
  getStageLayout: invokeStageHandler('get-stage-layout'),
  importStageLayoutSource: invokeStageHandler('import-stage-layout-source'),
  saveStageLayout: invokeStageHandler('save-stage-layout'),
  loadStageLayoutPreset: invokeStageHandler('load-stage-layout-preset'),
  saveStageLayoutPreset: invokeStageHandler('save-stage-layout-preset'),
  getCharacterCssLayout: invokeCharacterCssHandler('get-character-css-layout'),
  selectCharacterCssSourceFile: invokeCharacterCssHandler('select-character-css-source-file'),
  importCharacterCssSourceFiles: invokeCharacterCssHandler('import-character-css-source-files'),
  saveCharacterCssLayout: invokeCharacterCssHandler('save-character-css-layout'),
  duplicateCharacterCssEntry: invokeCharacterCssHandler('duplicate-character-css-entry'),
  removeCharacterCssEntry: invokeCharacterCssHandler('remove-character-css-entry'),
  loadModProfiles: invokeModProfileHandler('load-mod-profiles'),
  saveModProfiles: invokeModProfileHandler('save-mod-profiles'),
  exportConfigBackup: invokeConfigBackupHandler('export-config-backup'),
  restoreConfigBackup: invokeConfigBackupHandler('restore-config-backup'),
  submitFeedback: invokeFeedbackHandler('submit-feedback'),

  store: {
    get: invokeStoreHandler('store-get'),
    set: invokeStoreHandler('store-set'),
    delete: invokeStoreHandler('store-delete'),
    clear: invokeStoreHandler('store-clear'),
  },

  getPathForFile(file: File) {
    return webUtils.getPathForFile(file);
  },

  onModInstallStart: registerProtocolCallback('mod-install-start'),
  onModDownloadProgress: registerProtocolCallback('mod-download-progress'),
  onModDownloadPaused: registerProtocolCallback('mod-download-paused'),
  onModExtractStart: registerProtocolCallback('mod-extract-start'),
  onModExtractComplete: registerProtocolCallback('mod-extract-complete'),
  onModInstallSuccess: registerProtocolCallback('mod-install-success'),
  onModInstallError: registerProtocolCallback('mod-install-error'),

  onMainLog: registerMainCallback('main-log'),

  onModInstallConfirmRequest: registerProtocolCallback(
    'mod-install-confirm-request',
  ),

  onGameBananaPairingSuccess: registerProtocolCallback(
    'gamebanana-pairing-success',
  ),

  onStartIntroAnimation: registerAnimationCallback('start-intro-animation'),

  onFppInstallProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('fpp-install-progress', (event, data) => callback(data)),
  onFppCreateProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('fpp-create-progress', (event, data) => callback(data)),
  onFppDownloadLink: (callback: (data: any) => void) =>
    ipcRenderer.on('fpp-download-link', (event, data) => callback(data)),
  onOpenFppFile: (callback: (data: { filePath: string }) => void) =>
    ipcRenderer.on('open-fpp-file', (event, data) => callback(data)),
  onFtpTransferProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('ftp-transfer-progress', (event, data) => callback(data)),
  onTutorialWindowClosed: (callback: () => void) =>
    ipcRenderer.on('tutorial-window-closed', () => callback()),

  onUpdateChecking: registerRendererCallback('update-checking'),
  onUpdateAvailable: registerRendererCallback('update-available'),
  onUpdateNotAvailable: registerRendererCallback('update-not-available'),
  onUpdateDownloadProgress: registerRendererCallback(
    'update-download-progress',
  ),

  onUpdateDownloaded: registerRendererCallback('update-downloaded'),
  onUpdateError: registerRendererCallback('update-error'),
} as const;

const tutorialAPI = {
  // Settings & File System
  selectFolder: invokeFileHandler('select-folder'),
  saveSetting: invokeStoreHandler('store-set'),
  getSetting: invokeStoreHandler('store-get'),

  // ARCropolis Installation
  detectSdDrives: invokeTutorialHandler('detect-sd-drives'),
  detectYuzuPath: invokeTutorialHandler('detect-yuzu-path'),
  detectRyujinxPath: invokeTutorialHandler('detect-ryujinx-path'),
  getGithubRelease: invokeTutorialHandler('get-github-release'),
  getSkylineRelease: invokeTutorialHandler('get-skyline-release'),
  downloadArcropolis: invokeTutorialHandler('download-arcropolis'),
  extractArcropolis: invokeTutorialHandler('extract-arcropolis'),
  extractSkyline: invokeTutorialHandler('extract-skyline'),
  createDirectory: invokeTutorialHandler('create-directory'),
  checkArcropolisInstalled: invokeTutorialHandler('check-arcropolis-installed'),
  checkArcropolisFolder: invokeTutorialHandler('check-arcropolis-folder'),
  selectDrive: invokeTutorialHandler('select-drive'),
  joinPath: invokeTutorialHandler('join-path'),
  getTempDir: invokeTutorialHandler('get-temp-dir'),
  openUrl: invokeSystemHandler('open-url'),

  store: {
    get: invokeStoreHandler('store-get'),
    set: invokeStoreHandler('store-set'),
    delete: invokeStoreHandler('store-delete'),
    clear: invokeStoreHandler('store-clear'),
  },

  closeTutorial: invokeTutorialHandler('close-tutorial-window'),
  skipTutorial: invokeTutorialHandler('skip-tutorial'),
  tutorialIntroComplete: invokeTutorialHandler('tutorial-intro-complete'),
  getMigrationStatus: invokeMigrationHandler('get-migration-status'),
} as const;

export type ElectronAPI = typeof electronAPI;
export type TutorialAPI = typeof tutorialAPI;

const windowType = process.argv
  .find((arg) => arg.startsWith('--window-type='))
  ?.split('=')[1];

if (windowType === 'main') {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
}

if (windowType === 'tutorial') {
  console.log('Tutorial preload.js loaded!');
  contextBridge.exposeInMainWorld('tutorialAPI', tutorialAPI);
  console.log('tutorialAPI exposed to window');
}
