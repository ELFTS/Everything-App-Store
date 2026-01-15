// 检查是否在渲染进程中
if (typeof window !== 'undefined') {
  // 搜索框动画效果
  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
      // 当搜索框获得焦点时，稍微放大并改变边框颜色
      searchInput.addEventListener('focus', () => {
        searchInput.style.transform = 'scaleX(1.05)';
        searchInput.style.borderColor = '#165DFF';
        searchInput.parentElement.style.width = '105%';
        searchInput.parentElement.style.maxWidth = '315px';
      });
      
      // 当搜索框失去焦点时，恢复原始状态
      searchInput.addEventListener('blur', () => {
        searchInput.style.transform = 'scaleX(1)';
        searchInput.style.borderColor = '#d1d5db';
        searchInput.parentElement.style.width = '100%';
        searchInput.parentElement.style.maxWidth = '300px';
      });
      
      // 悬停效果
      searchInput.addEventListener('mouseenter', () => {
        if (!searchInput.matches(':focus')) {
          searchInput.parentElement.style.width = '102.5%';
          searchInput.parentElement.style.maxWidth = '307.5px';
        }
      });
      
      searchInput.addEventListener('mouseleave', () => {
        if (!searchInput.matches(':focus')) {
          searchInput.parentElement.style.width = '100%';
          searchInput.parentElement.style.maxWidth = '300px';
        }
      });
    }
  });
}

const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  maximizeApp: () => ipcRenderer.invoke('maximize-app'),
  unmaximizeApp: () => ipcRenderer.invoke('unmaximize-app'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getInstalledSoftware: () => ipcRenderer.invoke('get-installed-software'),
  installApp: (appName) => ipcRenderer.invoke('install-app', appName),
  uninstallApp: (appName, uninstallCmd) => ipcRenderer.invoke('uninstall-app', appName, uninstallCmd),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getLocalAppList: () => {
    try {
      const filePath = path.join(__dirname, 'app-list.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  
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
  onDownloadError: (callback) => ipcRenderer.on('download-error', callback)
});

// 添加卸载进度监听器
contextBridge.exposeInMainWorld('uninstallAPI', {
  onUninstallProgress: (callback) => ipcRenderer.on('uninstall-progress', callback),
  onUninstallResult: (callback) => ipcRenderer.on('uninstall-result', callback),
  onInstalledSoftwareListUpdated: (callback) => ipcRenderer.on('installed-software-list-updated', callback)
});
