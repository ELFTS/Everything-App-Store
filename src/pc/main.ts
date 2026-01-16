
import { app, BrowserWindow, ipcMain, dialog, net, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { handleUninstall } from './uninstall-handler';
import * as extractor from 'icon-extractor';

let mainWindow: BrowserWindow | null = null;
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
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 开发阶段允许跨域（生产环境可关闭）
    }
  });

  if (mainWindow) {
    originalWinInfo = mainWindow.getBounds();
  }
  mainWindow.loadFile('index.html');
  // 开发阶段可打开调试工具
  // mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
};

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
    const filePath = path.join(__dirname, 'app-list.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.apps)) {
        return data;
      }
    }
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

interface DownloadTask {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
  totalLength: number;
  downloadedLength: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';
  request: http.ClientRequest;
  fileStream: fs.WriteStream;
}

const downloadTasks = new Map<string, DownloadTask>(); // 存储下载任务
let downloadsDir = path.join(app.getPath('userData'), 'downloads');

// 确保下载目录存在
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept': '*/*',
  'Connection': 'keep-alive'
};

function startRequestForTask(task: DownloadTask, redirectCount: number = 0): void {
  const { url, filePath } = task;
  let { downloadedLength } = task;

  if (redirectCount >= 5) {
    if (mainWindow) {
          mainWindow.webContents.send('download-error', task.id, 'Too many redirects');
        }
    downloadTasks.delete(task.id);
    return;
  }

  let startByte = 0;
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      startByte = stats.size;
    } catch (e) {
      console.error(`Failed to get file stats for ${filePath}:`, e);
    }
  }
  downloadedLength = startByte;

  const headers: http.RequestOptions['headers'] = { ...defaultHeaders };
  if (startByte > 0) {
    headers.Range = `bytes=${startByte}-`;
  }

  const client = url.startsWith('https:') ? https : http;
  const request = client.get(url, { headers }, (response) => {
    const { statusCode, headers: responseHeaders } = response;

    if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
      const location = responseHeaders.location;
      if (location) {
        task.url = new URL(location, url).toString();
        startRequestForTask(task, redirectCount + 1);
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('download-error', task.id, 'Redirect location missing');
        }
        downloadTasks.delete(task.id);
      }
      return;
    }

    if (statusCode !== 200 && statusCode !== 206) {
      if (mainWindow) {
        mainWindow.webContents.send('download-error', task.id, `Download failed with status: ${statusCode}`);
      }
      downloadTasks.delete(task.id);
      return;
    }

    const isPartial = statusCode === 206;
    if (startByte > 0 && !isPartial) {
      downloadedLength = 0;
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error(`Failed to delete file ${filePath}:`, e);
        }
      }
    }

    const fileStream = fs.createWriteStream(filePath, { flags: isPartial ? 'a' : 'w' });
    response.pipe(fileStream);

    let totalLength = task.totalLength;
    const contentLength = responseHeaders['content-length'];
    if (contentLength) {
      totalLength = parseInt(contentLength, 10);
    } else {
      const contentRange = responseHeaders['content-range'];
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)/);
        if (match) {
          totalLength = parseInt(match[1], 10);
        }
      }
    }
    task.totalLength = totalLength;
    task.request = request;
    task.fileStream = fileStream;
    task.status = 'downloading';

    response.on('data', (chunk) => {
      if (task.status !== 'downloading') return;
      downloadedLength += chunk.length;
      task.downloadedLength = downloadedLength;
      const progress = totalLength > 0 ? (downloadedLength / totalLength) * 100 : 0;
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('download-update', task.id, {
          progress,
          downloaded: downloadedLength,
          total: totalLength,
        });
      }
    });

    fileStream.on('finish', () => {
      if (task.status === 'downloading' && downloadedLength >= totalLength) {
        task.status = 'completed';
        if (mainWindow) {
          mainWindow.webContents.send('download-complete', task.id, filePath);
        }
        downloadTasks.delete(task.id);
      }
    });

    fileStream.on('error', (err) => {
      if (task.status === 'paused' || task.status === 'cancelled') return;
      task.status = 'error';
      if (mainWindow) {
        mainWindow.webContents.send('download-error', task.id, err.message);
      }
      downloadTasks.delete(task.id);
    });
  });

  request.on('error', (err) => {
    if (task.status === 'paused' || task.status === 'cancelled') return;
    task.status = 'error';
    if (mainWindow) {
      mainWindow.webContents.send('download-error', task.id, err.message);
    }
    downloadTasks.delete(task.id);
  });

  task.request = request;
}
// 下载文件
ipcMain.handle('download-file', async (event: IpcMainInvokeEvent, downloadUrl: string, fileName: string): Promise<string> => {
  const taskId = Date.now().toString();
  const filePath = path.join(downloadsDir, fileName);

  // 确保下载目录存在
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const task: DownloadTask = {
    id: taskId,
    url: downloadUrl,
    filePath,
    fileName,
    totalLength: 0,
    downloadedLength: 0,
    status: 'downloading',
    request: new http.ClientRequest(new URL(downloadUrl)),
    fileStream: fs.createWriteStream(filePath),
  };

  downloadTasks.set(taskId, task);
  startRequestForTask(task);

  return taskId;
});

// 取消下载
ipcMain.handle('cancel-download', (event: IpcMainInvokeEvent, taskId: string) => {
  const task = downloadTasks.get(taskId);
  if (task && (task.status === 'downloading' || task.status === 'paused')) {
    if (task.request && !task.request.destroyed) {
      task.request.destroy();
    }
    if (task.fileStream) {
      try { task.fileStream.close(); } catch (e) {}
    }
    if (task.filePath && fs.existsSync(task.filePath)) {
      fs.unlink(task.filePath, () => {});
    }
    task.status = 'cancelled';
    downloadTasks.delete(taskId);
  }
});

// 暂停下载
ipcMain.handle('pause-download', (event: IpcMainInvokeEvent, taskId: string) => {
  const task = downloadTasks.get(taskId);
  if (task && task.status === 'downloading') {
    task.status = 'paused';
    if (task.request && !task.request.destroyed) {
      task.request.destroy();
    }
    if (task.fileStream) {
      try { task.fileStream.close(); } catch (e) {}
    }
  }
});

// 恢复下载
ipcMain.handle('resume-download', (event: IpcMainInvokeEvent, taskId: string) => {
  const task = downloadTasks.get(taskId);
  if (task && task.status === 'paused') {
    task.status = 'downloading';
    startRequestForTask(task);
  }
});

// 获取下载状态
ipcMain.handle('get-download-status', (event: IpcMainInvokeEvent, taskId: string): DownloadTask | undefined => {
  return downloadTasks.get(taskId);
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
