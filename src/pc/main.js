const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')
const { exec } = require('child_process');
const iconv = require('iconv-lite');

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

// 卸载逻辑（兼容unins000.exe）
ipcMain.on('uninstall-software', (event, uninstallCmd) => {
  // 空命令校验
  if (!uninstallCmd || uninstallCmd.trim() === '') {
    event.sender.send('uninstall-result', { 
      success: false, 
      msg: '该软件无有效卸载程序！' 
    });
    return;
  }

  // 精准提取所有.exe完整路径
  let fixedUninstallCmd = uninstallCmd.trim();
  const exePathMatch = fixedUninstallCmd.match(/^(.+?\.exe)(\s+.*)?$/i);
  if (exePathMatch) {
    const exePath = exePathMatch[1];
    const args = exePathMatch[2] || '';
    fixedUninstallCmd = `"${exePath}"${args}`;
  } else {
    if (!fixedUninstallCmd.startsWith('"')) {
      fixedUninstallCmd = `"${fixedUninstallCmd}"`;
    }
  }

  // 执行卸载命令
  exec(fixedUninstallCmd, { 
    encoding: 'buffer',
    windowsHide: true,
    cwd: path.dirname(fixedUninstallCmd.replace(/"/g, ''))
  }, (err, stdout, stderr) => {
    if (err) {
      const errorMsg = iconv.decode(stderr || Buffer.from(err.message), 'gbk');
      let finalMsg = '';
      if (errorMsg.includes('不是内部或外部命令')) {
        finalMsg = `卸载失败：找不到卸载程序（如unins000.exe），请检查路径是否正确！\n原始路径：${uninstallCmd}`;
      } else if (errorMsg.includes('拒绝访问')) {
        finalMsg = '卸载失败：权限不足，请以管理员身份运行本程序！';
      } else if (errorMsg.includes('系统找不到指定文件')) {
        finalMsg = `卸载失败：卸载程序（如unins000.exe）不存在，请手动卸载！`;
      } else {
        finalMsg = `卸载失败：${errorMsg || '卸载程序执行异常，请手动卸载！'}`;
      }
      event.sender.send('uninstall-result', { 
        success: false, 
        msg: finalMsg 
      });
      return;
    }
    event.sender.send('uninstall-result', { 
      success: true, 
      msg: '卸载程序已启动，请按照向导提示完成卸载！' 
    });
  });
});

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })