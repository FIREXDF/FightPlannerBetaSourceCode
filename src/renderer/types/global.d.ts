import { LottiePlayer } from 'lottie-web';
import * as gsap from 'gsap';

import { ElectronAPI, TutorialAPI } from '../../main/preload';

import { ToastManager } from '../js/ui/toast-manager';
import { AppSoundManager } from '../js/ui/app-sound-manager';
import { ModManager } from '../js/mods/mod-manager';
import { ModalManager } from '../js/ui/modal-manager';
import { UpdateManager } from '../js/ui/update-manager';
import { StatusBarManager } from '../js/ui/status-bar-manager';
import { DownloadManager } from '../js/downloads/download-manager';
import { SettingsManager } from '../js/settings/settings-manager';
import { ConflictModalManager } from '../js/ui/conflict-modal-manager';
import { CharactersManager } from '../js/characters/characters-manager';
import { PluginManager } from '../js/mods/plugin-manager';
import { ResizeHandler } from '../js/ui/resize-handler';
import { ModInfoManager } from '../js/mods/mod-info';
import { PluginMarketplace } from '../js/mods/plugin-marketplace';
import { LogsManager } from '../js/logs/logs-manager';
import { BatchTestingManager } from '../js/settings/batch-testing-manager';
import { AnimationManager } from '../js/ui/animation-manager';
import { TutorialManager } from '../js/tutorial/tutorial-manager';
import { FightPlannerManager } from '../js/fightplanner/fightplanner-manager';
import { ModInfoEditor } from '../js/mods/mod-info-editor';
import { CustomizationManager } from '../js/customization/customization-manager';
import { ProtocolListener } from '../js/protocol/protocol-listener';
import { DiscordRPCClient } from '../js/core/discord-rpc-client';
import { HardwareConnectionManager } from '../js/core/hardware-connection-manager';
import { RemoteAnnouncementManager } from '../js/core/remote-announcement-manager';
import { ModDragDropHandler } from '../js/mods/mod-drag-drop';
import { SmartRenameManager } from '../js/mods/smart-rename-manager';
import { StagesManager } from '../js/stages/stages-manager';
import { I18nClient } from '../js/i18n/i18n-client';

import { ModOperations } from '../js/mods/mod-operations';
import { ModContextMenuHandler } from '../js/mods/mod-context-menu';
import { ModKeybindsHandler } from '../js/mods/mod-keybinds';
import { ModListRenderer } from '../js/mods/mod-list-renderer';
import { LanguageSelector } from '../js/i18n/language-selector';
import { ModProfileManager } from '../js/mods/mod-profile-manager';

import {
  ResolveSSBUFolderName,
  SSBUCharacterImages,
  SSBUCharacters,
  SSBUFolderAliases,
} from '../js/characters/characters-data';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    tutorialAPI: TutorialAPI;

    i18n: I18nClient;
    toastManager: ToastManager;
    appSoundManager: AppSoundManager;
    modManager: ModManager;
    modalManager: ModalManager;
    updateManager: UpdateManager;
    statusBarManager: StatusBarManager;
    downloadManager: DownloadManager;
    settingsManager: SettingsManager;
    conflictModalManager: ConflictModalManager;
    charactersManager: CharactersManager;
    pluginManager: PluginManager;
    resizeHandler: ResizeHandler;
    modInfoManager: ModInfoManager;
    pluginMarketplace: PluginMarketplace;
    logsManager: LogsManager;
    batchTestingManager: BatchTestingManager;
    animationManager: AnimationManager;
    tutorialManager: TutorialManager;
    fightPlannerManager: FightPlannerManager;
    modInfoEditor: ModInfoEditor;
    customizationManager: CustomizationManager;
    protocolListener: ProtocolListener;
    discordRPCClient: DiscordRPCClient;
    remoteAnnouncementManager: RemoteAnnouncementManager;
    hardwareConnectionManager: InstanceType<typeof HardwareConnectionManager>;
    modDragDropHandler: ModDragDropHandler;
    smartRenameManager: SmartRenameManager;
    stagesManager: StagesManager;
    modProfileManager: ModProfileManager;

    ModOperations: typeof ModOperations;
    ModContextMenuHandler: typeof ModContextMenuHandler;
    ModKeybindsHandler: typeof ModKeybindsHandler;
    ModListRenderer: typeof ModListRenderer;
    LanguageSelector: typeof LanguageSelector;
    HardwareConnectionManager: typeof HardwareConnectionManager;

    tutorial: {
      show: () => void;
      showInApp: () => void;
      reset: () => void;
      resetFirstLaunch: () => void;
    };

    tabLoader: {
      loadTabContent: (tabId: string) => Promise<void>;
      initializeTabs: () => Promise<void>;
    };

    startupSplashManager: {
      initialize: () => Promise<void>;
      isStartupLaunch: () => boolean;
    };

    lottie: LottiePlayer;
    gsap: typeof gsap;
    Flip?: any;
    __flipPluginRegistered?: boolean;

    SSBU_CHARACTERS: SSBUCharacters;
    CHARACTER_IMAGES: SSBUCharacterImages;
    FOLDER_ALIASES: SSBUFolderAliases;
    resolveFolderName: ResolveSSBUFolderName;
  }
}
