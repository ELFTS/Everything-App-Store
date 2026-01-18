
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, session, shell } from 'electron';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { exec } from 'child_process';
import * as fs from 'fs';
import { DownloadManager } from './download-manager';
import { handleUninstall } from './uninstall-handler';
const extractor = require('icon-extractor');

let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager | null = null;
let isWindowMaximized = false;
const winSize = { width: 1200, height: 760 };
let originalWinInfo = { x: 0, y: 0, width: winSize.width, height: winSize.height };

// 创建窗口
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: winSize.width,
    height: winSize.height,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    movable: true,
    resizable: true,
    maximizable: true,
    fullscreen: false,
    center: true,
    icon: path.join(__dirname, 'build/icon.ico'),
    transparent: false,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });

  if (mainWindow) {
    originalWinInfo = mainWindow.getBounds();
    downloadManager = new DownloadManager(mainWindow);
  }
  mainWindow.loadFile('index.html');
  // 开发阶段可打开调试工具
  // mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
};

ipcMain.on('start-download', (event, { url, filename }) => {
  if (downloadManager) {
    downloadManager.start(url, filename);
  }
});

// 窗口控制 - 最小化/最大化/关闭
ipcMain.handle('minimize-app', () => {
  mainWindow?.minimize();
});
ipcMain.handle('maximize-app', () => {
  if (mainWindow) {
    if (!isWindowMaximized) {
      originalWinInfo = mainWindow.getBounds();
      mainWindow.maximize();
      isWindowMaximized = true;
    } else {
      mainWindow.setBounds(originalWinInfo);
      isWindowMaximized = false;
    }
  }
  return isWindowMaximized;
});

ipcMain.handle('unmaximize-app', () => {
  mainWindow?.unmaximize();
  isWindowMaximized = false;
  return isWindowMaximized;
});

ipcMain.handle('close-app', () => {
  mainWindow?.close();
});

interface SoftwareInfo {
  name: string;
  version: string;
  publisher: string;
  installPath: string;
  uninstallCmd: string;
  icon: string;
  displayIcon?: string;
}

ipcMain.handle('get-installed-software', async (): Promise<SoftwareInfo[]> => {
  if (process.platform !== 'win32') {
    return [];
  }
  const softwareList: SoftwareInfo[] = [];
  const regPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ];

  const readRegPath = (regPath: string): Promise<void> => {
    return new Promise((resolve) => {
      exec(`reg query "${regPath}" /s`, { encoding: 'buffer' }, (err, stdout) => {
        if (!err) {
          const output = iconv.decode(stdout, 'gbk');
          const regItems = output.split('HKEY_');
          regItems.forEach(item => {
            if (item) {
              const fullItem = 'HKEY_' + item;
              const nameMatch = fullItem.match(/DisplayName\s+REG_SZ\s+([^\r\n]+)/);
              const versionMatch = fullItem.match(/DisplayVersion\s+REG_SZ\s+([^\r\n]+)/);
              const publisherMatch = fullItem.match(/Publisher\s+REG_SZ\s+([^\r\n]+)/);
              const installPathMatch = fullItem.match(/InstallLocation\s+REG_SZ\s+([^\r\n]+)/);
              const uninstallMatch = fullItem.match(/UninstallString\s+REG_SZ\s+([^\r\n]+)/);
              const displayIconMatch = fullItem.match(/DisplayIcon\s+REG_SZ\s+([^\r\n]+)/);

              if (nameMatch && nameMatch[1] && !nameMatch[1].includes('更新') && !nameMatch[1].includes('补丁')) {
                let uninstallCmd = uninstallMatch ? uninstallMatch[1].trim() : '';
                const fixUninstallExeNames = (cmd: string): string => {
                  if (!cmd) return cmd;
                  return cmd.replace(/uninist\.exe/gi, 'uninst.exe');
                };
                uninstallCmd = fixUninstallExeNames(uninstallCmd);

                const software: SoftwareInfo = {
                  name: nameMatch[1].trim(),
                  version: versionMatch ? versionMatch[1].trim() : '未知版本',
                  publisher: publisherMatch ? publisherMatch[1].trim() : '未知发布商',
                  installPath: installPathMatch ? installPathMatch[1].trim() : '未知路径',
                  uninstallCmd: uninstallCmd,
                  icon: '',
                  displayIcon: displayIconMatch ? displayIconMatch[1].trim() : undefined
                };
                if (!softwareList.some(s => s.name === software.name)) softwareList.push(software);
              }
            }
          });
        }
        resolve();
      });
    });
  };

  for (const regPath of regPaths) await readRegPath(regPath);

  const iconPromises = softwareList.map(async (software) => {
    const newSoftware = { ...software };
    try {
      let iconPath = newSoftware.displayIcon;
      if (iconPath) {
        iconPath = iconPath.split(',')[0].replace(/"/g, '');
      } else if (newSoftware.installPath) {
        const exeName = newSoftware.name.replace(/[^a-zA-Z0-9]/g, '') + '.exe';
        const potentialPath = path.join(newSoftware.installPath, exeName);
        if (fs.existsSync(potentialPath)) {
          iconPath = potentialPath;
        } else {
          try {
            const files = fs.readdirSync(newSoftware.installPath);
            const exeFile = files.find(f => f.toLowerCase().endsWith('.exe'));
            if (exeFile) {
              iconPath = path.join(newSoftware.installPath, exeFile);
            }
          } catch (e) {
            // ignore
          }
        }
      }

      if (iconPath && fs.existsSync(iconPath)) {
        const iconBase64 = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Icon extraction timed out for ${iconPath}`));
          }, 2000); // 2秒超时

          const listener = (data: { Path: string; Base64ImageData: string; }) => {
            if (data.Path.toLowerCase() === iconPath.toLowerCase()) {
              clearTimeout(timeout);
              extractor.emitter.removeListener('icon', listener);
              resolve(data.Base64ImageData);
            }
          };
          
          extractor.emitter.on('icon', listener);
          
          try {
            extractor.getIcon('icon', iconPath);
          } catch (e) {
            extractor.emitter.removeListener('icon', listener);
            reject(e);
          }
        });
        newSoftware.icon = `data:image/png;base64,${iconBase64}`;
      }
    } catch (e) {
      console.error(`Failed to extract icon for ${newSoftware.name}:`, e);
      newSoftware.icon = '';
    }
    delete newSoftware.displayIcon;
    return newSoftware;
  });

  const updatedSoftwareList = await Promise.all(iconPromises);
  
  updatedSoftwareList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return updatedSoftwareList;
});

interface AppData {
  name: string;
  category: string;
  image: string;
  desc: string;
  downloadUrl: string;
}

ipcMain.handle('get-local-app-list', async (): Promise<{ apps: AppData[] }> => {
  try {
    const filePath = path.join(app.getAppPath(), 'app-list.json');
    console.log(`Reading app list from: ${filePath}`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      console.log(`Raw app list data: ${raw}`);
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.apps)) {
        console.log(`Parsed app list data:`, data);
        return data;
      }
    }
    console.log('app-list.json not found or data is invalid.');
    return { apps: [] };
  } catch (e) {
    console.error('Failed to read app-list.json:', e);
    return { apps: [] };
  }
});

// 卸载逻辑（兼容unins000.exe、uninst.exe等常见卸载程序）
ipcMain.handle('uninstall-app', (event: IpcMainInvokeEvent, softwareName: string, uninstallCmd: string) => {
  handleUninstall(event, uninstallCmd, softwareName);
});

// 下载文件
ipcMain.handle('download-file', (event: IpcMainInvokeEvent, downloadUrl: string, fileName: string): string | undefined => {
  return downloadManager?.start(downloadUrl, fileName);
});

// 取消下载
ipcMain.handle('cancel-download', (event: IpcMainInvokeEvent, taskId: string) => {
  downloadManager?.cancel(taskId);
});

// 打开已下载的文件
ipcMain.handle('open-download', (event: IpcMainInvokeEvent, taskId: string) => {
  const task = downloadManager?.getTask(taskId);
  if (task && task.status === 'completed') {
    shell.openPath(task.filePath);
  }
});

// 暂停下载
ipcMain.handle('pause-download', (event: IpcMainInvokeEvent, taskId: string) => {
  downloadManager?.pause(taskId);
});

// 恢复下载
ipcMain.handle('resume-download', (event: IpcMainInvokeEvent, taskId: string) => {
  downloadManager?.resume(taskId);
});

// 重试下载
ipcMain.handle('retry-download', (event: IpcMainInvokeEvent, taskId: string) => {
  downloadManager?.retry(taskId);
});

// 获取下载状态
ipcMain.handle('get-download-status', (event: IpcMainInvokeEvent, taskId: string) => {
  return downloadManager?.getTask(taskId);
});

ipcMain.handle('get-auto-launch-status', (): boolean => {
  try {
    const settings = app.getLoginItemSettings();
    return !!settings.openAtLogin;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('set-auto-launch', (event: IpcMainInvokeEvent, enabled: boolean): boolean => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('open-external-url', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();
  const latestVersion = currentVersion;
  return {
    hasUpdate: false,
    currentVersion,
    latestVersion
  };
});

app.whenReady().then(async () => {
  await session.defaultSession.clearCache();
  
  session.defaultSession.on('will-download', (event, item, webContents) => {
    if (downloadManager) {
      downloadManager.createTaskFromElectronDownload(item);
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https://picsum.photos https://fastly.picsum.photos;"
        ]
      }
    });
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
