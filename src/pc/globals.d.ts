
interface SoftwareInfo {
  name: string;
  version: string;
  publisher: string;
  installPath: string;
  uninstallCmd: string;
  icon: string;
  path: string;
}

interface IUninstallAPI {
  uninstall: (path: string) => Promise<{ success: boolean; error?: string }>;
  onUninstallProgress: (callback: (event: any, message: string) => void) => void;
  onUninstallResult: (callback: (event: any, result: { success: boolean; error?: string }) => void) => void;
  onInstalledSoftwareListUpdated: (callback: () => void) => void;
}

interface AppData {
  name: string;
  category: string;
  image: string;
  desc: string;
  downloadUrl: string;
}

interface DownloadTask {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
  totalLength: number;
  downloadedLength: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';
}

interface IElectronAPI {
  closeApp: () => Promise<void>;
  minimizeApp: () => Promise<void>;
  maximizeApp: () => Promise<boolean>;
  unmaximizeApp: () => Promise<boolean>;
  getInstalledSoftware: () => Promise<SoftwareInfo[]>;
  installApp: (appName: string) => Promise<void>;
  uninstallApp: (appName: string, uninstallCmd: string) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  getLocalAppList: () => Promise<{ apps: AppData[] }>;
  downloadFile: (url: string, filePath: string) => Promise<string>;
  cancelDownload: (taskId: string) => Promise<void>;
  pauseDownload: (taskId: string) => Promise<void>;
  resumeDownload: (taskId: string) => Promise<void>;
  getDownloadStatus: (taskId: string) => Promise<DownloadTask | undefined>;
  onDownloadUpdate: (callback: (event: any, ...args: any[]) => void) => void;
  onDownloadComplete: (callback: (event: any, ...args: any[]) => void) => void;
  onDownloadError: (callback: (event: any, ...args: any[]) => void) => void;
  getAutoLaunchStatus: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
}

interface IDownloadModule {
  initDownloadManager: () => void;
  showNotification: (message: string) => void;
  toggleDownloadManager: () => void;
  startDownload: (url: string, appName: string) => void;
}

interface AppSettings {
  useLightTheme: boolean;
  showDownloadNotification: boolean;
  playDownloadSound: boolean;
  autoLaunch: boolean;
  autoCheckUpdates: boolean;
  [key: string]: boolean;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    uninstallAPI: IUninstallAPI;
    appSettings: AppSettings;
    downloadModule?: IDownloadModule;
  }
}

declare module 'icon-extractor';
