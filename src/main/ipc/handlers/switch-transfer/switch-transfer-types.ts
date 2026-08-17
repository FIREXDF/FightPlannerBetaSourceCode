export interface SwitchTransferConfig {
  switchIp: string;
  switchPort: number;
  switchFtpUser?: string | null;
  switchFtpPassword?: string | null;
  switchFtpPath?: string | null;
  switchFtpModsPath?: string | null;
  switchFtpPluginsPath?: string | null;
  switchDriveLetter: string;
  switchTransferMethod: 'ftp' | 'drive' | 'mtp';
  switchSyncMode?: 'quick' | 'full';
  modsPath: string;
  pluginsPath?: string | null;
  recentDownloads: Array<{
    id: string;
    modName: string;
    folderPath: string | null;
  }>;
}

export interface SwitchTransferProgressPayload {
  status: 'uploading' | 'copying';
  currentMod: number;
  totalMods: number;
  transferredCount: number;
  copiedCount?: number;
  totalFiles: number;
  progress: number;
  transferMethod?: 'ftp' | 'drive' | 'mtp';
  currentModName?: string;
  currentFileName?: string;
}
