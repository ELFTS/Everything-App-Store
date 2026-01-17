import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startDownload: (url: string, filename: string) => ipcRenderer.send('start-download', { url, filename }),
  onDownloadStarted: (callback: (item: any) => void) => ipcRenderer.on('download-started', (_event, item) => callback(item)),
  onDownloadProgress: (callback: (item: any) => void) => ipcRenderer.on('download-progress', (_event, item) => callback(item)),
  onDownloadCompleted: (callback: (item: any) => void) => ipcRenderer.on('download-completed', (_event, item) => callback(item)),
  getInstalledSoftware: () => ipcRenderer.invoke('get-installed-software'),
  uninstallApp: (appName: string, uninstallCmd: string) => ipcRenderer.send('uninstall-app', { appName, uninstallCmd }),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  maximizeApp: () => ipcRenderer.invoke('maximize-app'),
  closeApp: () => ipcRenderer.send('close-app'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.send('set-auto-launch', enabled),
  getLocalAppList: () => ipcRenderer.invoke('get-local-app-list'),
});
