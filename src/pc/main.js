const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const iconv = require('iconv-lite');
const { exec } = require('child_process');
const fs = require('fs');
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })