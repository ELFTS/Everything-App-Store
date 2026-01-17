
import { AppData } from './app-data';
import { AppSettings } from './app-settings';
import { DownloadTask } from './download-task';
import { SoftwareInfo } from './software-info';

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    uninstallAPI: IUninstallAPI;
    appSettings: AppSettings;
    downloadModule?: IDownloadModule;
  }
}

export interface IElectronAPI {
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

export interface IUninstallAPI {
  uninstall: (path: string) => Promise<{ success: boolean; error?: string }>;
  onUninstallProgress: (callback: (event: any, message: string) => void) => void;
  onUninstallResult: (callback: (event: any, result: { success: boolean; error?: string }) => void) => void;
  onInstalledSoftwareListUpdated: (callback: () => void) => void;
}

export interface IDownloadModule {
  initDownloadManager: () => void;
  showNotification: (message: string) => void;
  toggleDownloadManager: () => void;
  startDownload: (url: string, appName: string) => void;
}

declare module 'icon-extractor';
