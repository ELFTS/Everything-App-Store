const { contextBridge, ipcRenderer, shell } = require('electron');

// 向渲染进程暴露安全API
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  onMaxStateChange: (callback) => ipcRenderer.on('window-max-state', (e, state) => callback(state)),

  // 软件管理
  getInstalledSoftware: () => ipcRenderer.invoke('get-installed-software'),
  uninstallSoftware: (cmd) => ipcRenderer.invoke('uninstall-software', cmd),

  // 打开外部链接（下载/更新用）
  openExternal: (url) => shell.openExternal(url)
});