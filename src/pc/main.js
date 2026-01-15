const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const iconv = require('iconv-lite');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const url = require('url');
const { handleUninstall } = require('./uninstall-handler'); // 引入卸载处理模块

let mainWindow = null
let isWindowMaximized = false
const winSize = { width: 1200, height: 760 }
let originalWinInfo = { x: 0, y: 0, width: winSize.width, height: winSize.height }

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
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false, // 开发阶段允许跨域（生产环境可关闭）
    }
  })

  originalWinInfo = mainWindow.getBounds()
  mainWindow.loadFile('index.html')
  // 开发阶段可打开调试工具
  // mainWindow.webContents.openDevTools()
  mainWindow.on('closed', () => { mainWindow = null })
}

// 窗口控制 - 最小化/最大化/关闭
ipcMain.on('window-control', (event, action) => {
  switch (action) {
    case 'minimize':
      mainWindow.minimize()
      break
    case 'maximize':
      if (!isWindowMaximized) {
        originalWinInfo = mainWindow.getBounds()
        mainWindow.maximize()
        isWindowMaximized = true
      } else {
        mainWindow.setBounds(originalWinInfo)
        isWindowMaximized = false
      }
      event.sender.send('window-status', isWindowMaximized)
      break
    case 'close':
      mainWindow.close()
      break
  }
})

// 注册表读取异步化 + 分批处理（兼容unins000.exe识别）
ipcMain.on('get-installed-software', async (event) => {
  const softwareList = [];
  const regPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ];

  const readRegPath = (regPath) => {
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

              if (nameMatch && nameMatch[1] && !nameMatch[1].includes('更新') && !nameMatch[1].includes('补丁')) {
                let uninstallCmd = uninstallMatch ? uninstallMatch[1].trim() : '';
                // 兼容uninist.exe→uninst.exe等拼写错误
                const fixUninstallExeNames = (cmd) => {
                  if (!cmd) return cmd;
                  return cmd.replace(/uninist\.exe/gi, 'uninst.exe');
                };
                uninstallCmd = fixUninstallExeNames(uninstallCmd);

                const software = {
                  name: nameMatch[1].trim(),
                  version: versionMatch ? versionMatch[1].trim() : '未知版本',
                  publisher: publisherMatch ? publisherMatch[1].trim() : '未知发布商',
                  installPath: installPathMatch ? installPathMatch[1].trim() : '未知路径',
                  uninstallCmd: uninstallCmd
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

  // 分批读取注册表，避免一次性占用资源
  for (const regPath of regPaths) await readRegPath(regPath);
  
  softwareList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  event.sender.send('installed-software-list', softwareList);
});

// 卸载逻辑（兼容unins000.exe、uninst.exe等常见卸载程序）
ipcMain.on('uninstall-software', (event, uninstallCmd, softwareName) => {
  handleUninstall(event, uninstallCmd, softwareName);
});

// 下载管理相关变量
let downloadTasks = new Map(); // 存储下载任务
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

function startRequestForTask(task, startByte = 0, currentUrl = null, redirectCount = 0) {
  const reqUrl = currentUrl || task.url;
  const headers = { ...defaultHeaders };
  if (startByte && startByte > 0) {
    headers.Range = `bytes=${startByte}-`;
  }

  const parsed = new URL(reqUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  const request = client.get(reqUrl, { headers }, (response) => {
    const status = response.statusCode || 0;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      if (!location) {
        downloadTasks.delete(task.id);
        if (mainWindow) mainWindow.webContents.send('download-error', task.id, 'Redirect location missing');
        return;
      }
      if (redirectCount >= 5) {
        downloadTasks.delete(task.id);
        if (mainWindow) mainWindow.webContents.send('download-error', task.id, 'Too many redirects');
        return;
      }
      const nextUrl = new URL(location, reqUrl).toString();
      task.url = nextUrl;
      startRequestForTask(task, startByte, nextUrl, redirectCount + 1);
      return;
    }

    if (![200, 206].includes(status)) {
      downloadTasks.delete(task.id);
      if (mainWindow) mainWindow.webContents.send('download-error', task.id, `Failed to download: ${status}`);
      return;
    }

    const isPartial = status === 206;
    let flags = 'w';
    if (startByte > 0 && isPartial) {
      flags = 'a';
    } else if (startByte > 0 && !isPartial) {
      startByte = 0;
      flags = 'w';
      task.downloadedLength = 0;
      if (fs.existsSync(task.filePath)) {
        try { fs.unlinkSync(task.filePath); } catch (e) {}
      }
    }

    const fileStream = fs.createWriteStream(task.filePath, { flags });
    response.pipe(fileStream);

    const totalLengthHeader = response.headers['content-length'];
    let totalLength = totalLengthHeader ? parseInt(totalLengthHeader, 10) || 0 : task.totalLength || 0;
    const contentRange = response.headers['content-range'];
    if (contentRange) {
      const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
      if (match) {
        const parsedTotal = parseInt(match[1], 10);
        if (!isNaN(parsedTotal) && parsedTotal > 0) {
          totalLength = parsedTotal;
        }
      }
    }

    task.totalLength = totalLength;
    task.request = request;
    task.fileStream = fileStream;
    task.status = 'downloading';

    response.on('data', (chunk) => {
      if (task.status === 'cancelled' || task.status === 'paused') return;
      task.downloadedLength += chunk.length;
      const progress = totalLength ? (task.downloadedLength / totalLength) * 100 : 0;
      if (mainWindow) {
        mainWindow.webContents.send('download-update', task.id, {
          progress,
          downloaded: task.downloadedLength,
          total: totalLength
        });
      }
    });

    fileStream.on('finish', () => {
      if (task.status !== 'downloading') {
        return;
      }
      if (task.totalLength > 0 && task.downloadedLength < task.totalLength) {
        return;
      }
      task.status = 'completed';
      if (mainWindow) mainWindow.webContents.send('download-complete', task.id, task.filePath);
      downloadTasks.delete(task.id);
    });

    fileStream.on('error', (err) => {
      if (task.status === 'paused' || task.status === 'cancelled') {
        return;
      }
      downloadTasks.delete(task.id);
      if (mainWindow) mainWindow.webContents.send('download-error', task.id, err.message);
    });
  });

  request.on('error', (err) => {
    if (task.status === 'paused' || task.status === 'cancelled') {
      return;
    }
    downloadTasks.delete(task.id);
    if (mainWindow) mainWindow.webContents.send('download-error', task.id, err.message);
  });

  task.request = request;
  downloadTasks.set(task.id, task);
}
// 下载文件
ipcMain.handle('download-file', async (event, downloadUrl, fileName) => {
  const taskId = Date.now().toString();
  const filePath = path.join(downloadsDir, fileName);
  const task = {
    id: taskId,
    url: downloadUrl,
    filePath,
    fileName,
    totalLength: 0,
    downloadedLength: 0,
    status: 'downloading',
    request: null,
    fileStream: null
  };
  startRequestForTask(task, 0, downloadUrl, 0);
  return taskId;
});

// 取消下载
ipcMain.handle('cancel-download', (event, taskId) => {
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
ipcMain.handle('pause-download', (event, taskId) => {
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
ipcMain.handle('resume-download', (event, taskId) => {
  const task = downloadTasks.get(taskId);
  if (task && task.status === 'paused') {
    let startByte = 0;
    try {
      if (task.filePath && fs.existsSync(task.filePath)) {
        const stat = fs.statSync(task.filePath);
        startByte = stat.size || 0;
      }
    } catch (e) {}
    task.downloadedLength = startByte;
    startRequestForTask(task, startByte, task.url, 0);
  }
});

// 获取下载状态
ipcMain.handle('get-download-status', (event, taskId) => {
  const task = downloadTasks.get(taskId);
  return task ? task : null;
});

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
