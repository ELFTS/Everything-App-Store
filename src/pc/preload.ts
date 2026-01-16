
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 检查是否在渲染进程中
if (typeof window !== 'undefined') {
  // 搜索框动画效果
  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    
    if (searchInput) {
      const parentElement = searchInput.parentElement as HTMLElement;

      // 当搜索框获得焦点时，稍微放大并改变边框颜色
      searchInput.addEventListener('focus', () => {
        searchInput.style.transform = 'scaleX(1.05)';
        searchInput.style.borderColor = '#165DFF';
        parentElement.style.width = '105%';
        parentElement.style.maxWidth = '315px';
      });
      
      // 当搜索框失去焦点时，恢复原始状态
      searchInput.addEventListener('blur', () => {
        searchInput.style.transform = 'scaleX(1)';
        searchInput.style.borderColor = '#d1d5db';
        parentElement.style.width = '100%';
        parentElement.style.maxWidth = '300px';
      });
      
      // 悬停效果
      searchInput.addEventListener('mouseenter', () => {
        if (!searchInput.matches(':focus')) {
          parentElement.style.width = '102.5%';
          parentElement.style.maxWidth = '307.5px';
        }
      });
      
      searchInput.addEventListener('mouseleave', () => {
        if (!searchInput.matches(':focus')) {
          parentElement.style.width = '100%';
          parentElement.style.maxWidth = '300px';
        }
      });
    }
  });
}

export interface SoftwareInfo {
  name: string;
  version: string;
  publisher: string;
  installPath: string;
  uninstallCmd: string;
  icon: string;
  path: string;
}

export interface IUninstallAPI {
  uninstall: (path: string) => Promise<{ success: boolean; error?: string }>;
  onUninstallProgress: (callback: (event: IpcRendererEvent, message: string) => void) => void;
  onUninstallResult: (callback: (event: IpcRendererEvent, result: { success: boolean; error?: string }) => void) => void;
  onInstalledSoftwareListUpdated: (callback: () => void) => void;
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
  onDownloadUpdate: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  onDownloadComplete: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  onDownloadError: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  getAutoLaunchStatus: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
}

export interface AppData {
  name: string;
  category: string;
  image: string;
  desc: string;
  downloadUrl: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
  totalLength: number;
  downloadedLength: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';
}

const electronAPI: IElectronAPI = {
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  maximizeApp: () => ipcRenderer.invoke('maximize-app'),
  unmaximizeApp: () => ipcRenderer.invoke('unmaximize-app'),
  getInstalledSoftware: () => ipcRenderer.invoke('get-installed-software'),
  installApp: (appName) => ipcRenderer.invoke('install-app', appName),
  uninstallApp: (appName, uninstallCmd) => ipcRenderer.invoke('uninstall-app', appName, uninstallCmd),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getLocalAppList: () => ipcRenderer.invoke('get-local-app-list'),
  
  // 下载管理相关API
  downloadFile: (url, filePath) => ipcRenderer.invoke('download-file', url, filePath),
  cancelDownload: (taskId) => ipcRenderer.invoke('cancel-download', taskId),
  pauseDownload: (taskId) => ipcRenderer.invoke('pause-download', taskId),
  resumeDownload: (taskId) => ipcRenderer.invoke('resume-download', taskId),
  
  // 获取下载状态
  getDownloadStatus: (taskId) => ipcRenderer.invoke('get-download-status', taskId),
  
  // 事件监听
  onDownloadUpdate: (callback) => ipcRenderer.on('download-update', callback),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', callback),
  onDownloadError: (callback) => ipcRenderer.on('download-error', callback),
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export interface IUninstallAPI {
    uninstall: (path: string) => Promise<{ success: boolean; error?: string }>;
    onUninstallProgress: (callback: (event: IpcRendererEvent, message: string) => void) => void;
    onUninstallResult: (callback: (event: IpcRendererEvent, result: { success: boolean; error?: string }) => void) => void;
    onInstalledSoftwareListUpdated: (callback: () => void) => void;
}

const uninstallAPI: IUninstallAPI = {
    uninstall: (path: string) => ipcRenderer.invoke('uninstall-app', path),
    onUninstallProgress: (callback) => ipcRenderer.on('uninstall-progress', callback),
    onUninstallResult: (callback) => ipcRenderer.on('uninstall-result', callback),
    onInstalledSoftwareListUpdated: (callback) => ipcRenderer.on('installed-software-list-updated', callback)
};

contextBridge.exposeInMainWorld('uninstallAPI', uninstallAPI);
