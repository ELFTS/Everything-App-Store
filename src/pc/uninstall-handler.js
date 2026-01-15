const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

/**
 * 卸载软件的主要逻辑函数
 * @param {Object} event - IPC事件对象
 * @param {string} uninstallCmd - 卸载命令
 * @param {string} softwareName - 软件名称
 */
function handleUninstall(event, uninstallCmd, softwareName) {
  // 空命令校验
  if (!uninstallCmd || uninstallCmd.trim() === '') {
    event.sender.send('uninstall-result', { 
      success: false, 
      msg: '该软件无有效卸载程序！' 
    });
    return;
  }

  // 验证卸载命令的安全性，防止恶意命令
  const dangerousPatterns = [/\.\.\/|\.\.\\/, /rm\s+-rf/, /del\s+\/f\s+/i];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(uninstallCmd)) {
      console.error(`危险命令被阻止: ${uninstallCmd}`);
      event.sender.send('uninstall-result', { 
        success: false, 
        msg: '检测到危险命令，已阻止执行！' 
      });
      return;
    }
  }

  // 精准提取所有.exe完整路径，兼容各种卸载程序名称
  let fixedUninstallCmd = uninstallCmd.trim();
  
  // 检测并处理不同类型的卸载程序
  const exePathMatch = fixedUninstallCmd.match(/^(.*?(?:uninst|unins\d{3}|uninstall)\.exe)(\s+.*)?$/i);
  if (exePathMatch) {
    const exePath = exePathMatch[1];
    const args = exePathMatch[2] || '';
    
    // 检查文件是否存在，如果不存在尝试寻找相似文件
    if (!fs.existsSync(exePath.replace(/"/g, ''))) {
      const dirPath = path.dirname(exePath.replace(/"/g, ''));
      const dirContents = fs.readdirSync(dirPath);
      
      // 寻找可能的卸载程序文件
      const possibleUninstallers = dirContents.filter(file => 
        /^unins\w*\.exe$/i.test(file) // 匹配 unins 开头的所有exe文件
      );
      
      if (possibleUninstallers.length > 0) {
        console.log(`找到可能的卸载程序: ${possibleUninstallers[0]}，原路径: ${exePath}`);
        fixedUninstallCmd = `"${path.join(dirPath, possibleUninstallers[0])}"${args}`;
      } else {
        event.sender.send('uninstall-result', { 
          success: false, 
          msg: `卸载程序不存在: ${exePath}\n请尝试手动卸载。` 
        });
        return;
      }
    } else {
      fixedUninstallCmd = `"${exePath}"${args}`;
    }
  } else {
    if (!fixedUninstallCmd.startsWith('"')) {
      fixedUninstallCmd = `"${fixedUninstallCmd}"`;
    }
  }

  // 发送开始卸载的通知
  event.sender.send('uninstall-progress', { status: 'starting', message: `正在准备卸载 ${softwareName || '软件'}...` });

  // 执行卸载命令并捕获子进程引用
  const childProcess = exec(fixedUninstallCmd, { 
    encoding: 'buffer',
    windowsHide: true,
    cwd: path.dirname(fixedUninstallCmd.replace(/"/g, ''))
  }, (err, stdout, stderr) => {
    // 这个回调仅在子进程结束且发生错误时触发
    // 如果命令无法启动，会进入这里
    if (err) {
      const errorMsg = iconv.decode(stderr || Buffer.from(err.message), 'gbk');
      let finalMsg = '';
      if (errorMsg.includes('不是内部或外部命令')) {
        finalMsg = `卸载失败：找不到卸载程序（如unins000.exe、uninst.exe），请检查路径是否正确！\n原始路径：${uninstallCmd}`;
      } else if (errorMsg.includes('拒绝访问') || errorMsg.includes('Access is denied')) {
        finalMsg = '卸载失败：权限不足，请以管理员身份运行本程序！';
      } else if (errorMsg.includes('系统找不到指定文件')) {
        finalMsg = `卸载失败：卸载程序（如unins000.exe、uninst.exe）不存在，请手动卸载！`;
      } else if (errorMsg.includes('被另一程序使用')) {
        finalMsg = `卸载失败：程序正在运行，请先关闭后再试！`;
      } else {
        finalMsg = `卸载失败：${errorMsg || '卸载程序执行异常，请手动卸载！'}`;
      }
      event.sender.send('uninstall-result', { 
        success: false, 
        msg: finalMsg 
      });
      return;
    }
    // 如果命令启动成功但没有错误，我们不需要在这里做任何事
    // 真正的结果处理在close事件中
  });

  // 监听子进程事件，跟踪其运行状态
  childProcess.on('spawn', () => {
    console.log(`卸载进程已启动: ${softwareName || '未知软件'}`);
    event.sender.send('uninstall-progress', { 
      status: 'running', 
      message: `正在卸载 ${softwareName || '软件'}，卸载程序已启动...` 
    });
  });

  childProcess.on('close', (code) => {
    console.log(`卸载进程已关闭，退出码: ${code}, 软件: ${softwareName || '未知软件'}`);
    
    // 延迟一小段时间以确保卸载操作真正完成
    // 因为有些卸载程序可能会启动另一个进程然后自己退出
    setTimeout(() => {
      // 执行检查，传递当前软件名称
      checkSoftwareExistence(softwareName).then((stillExists) => {
        if (code === 0 && !stillExists) {
          event.sender.send('uninstall-progress', { 
            status: 'completed', 
            message: `${softwareName || '软件'}卸载完成！正在刷新列表...` 
          });
          // 发送卸载成功的最终结果
          event.sender.send('uninstall-result', { 
            success: true, 
            msg: `${softwareName || '软件'}卸载成功！正在刷新列表...` 
          });
          // 卸载完成后，重新获取已安装软件列表
          setTimeout(() => {
            event.sender.send('installed-software-list-updated');
          }, 1500);
        } else {
          // 如果退出码不是0或者软件似乎仍在列表中，视为失败
          const additionalInfo = stillExists ? "（警告：软件仍存在于系统中）" : "";
          event.sender.send('uninstall-progress', { 
            status: 'error', 
            message: `${softwareName || '软件'}卸载可能未完成，退出码: ${code} ${additionalInfo}` 
          });
          event.sender.send('uninstall-result', { 
            success: false, 
            msg: `${softwareName || '软件'}卸载可能未完全完成${additionalInfo}，退出码: ${code}` 
          });
        }
      });
    }, 2000); // 等待2秒以确保卸载操作完成
  });

  childProcess.on('exit', (code, signal) => {
    console.log(`卸载进程退出，退出码: ${code}, 信号: ${signal}, 软件: ${softwareName || '未知软件'}`);
  });

  // 监听子进程输出，提供进度反馈
  childProcess.stdout.on('data', (data) => {
    const output = iconv.decode(data, 'gbk');
    console.log(`卸载输出: ${output}`);
  });

  childProcess.stderr.on('data', (data) => {
    const output = iconv.decode(data, 'gbk');
    console.error(`卸载错误: ${output}`);
  });
}

/**
 * 检查软件是否仍然存在于系统中
 * @param {string} currentSoftwareName - 要检查的软件名称
 * @returns {Promise<boolean>} 返回一个Promise，解析为布尔值，表示软件是否仍然存在
 */
function checkSoftwareExistence(currentSoftwareName) {
  return new Promise((resolve) => {
    const regPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ];

    let softwareStillExists = false;
    
    const checkRegPath = (regPath) => {
      return new Promise((regResolve) => {
        exec(`reg query "${regPath}" /s`, { encoding: 'buffer' }, (err, stdout) => {
          if (!err) {
            const output = iconv.decode(stdout, 'gbk');
            const regItems = output.split('HKEY_');
            regItems.forEach(item => {
              if (item) {
                const fullItem = 'HKEY_' + item;
                const nameMatch = fullItem.match(/DisplayName\s+REG_SZ\s+([^\r\n]+)/);
                
                if (nameMatch && nameMatch[1] && !nameMatch[1].includes('更新') && !nameMatch[1].includes('补丁')) {
                  const installedSoftwareName = nameMatch[1].trim();
                  
                  // 检查软件名称是否匹配
                  if (installedSoftwareName.toLowerCase().includes(currentSoftwareName.toLowerCase())) {
                    softwareStillExists = true;
                  }
                }
              }
            });
          }
          regResolve();
        });
      });
    };

    // 依次检查每个注册表路径
    const checkNextPath = async (index = 0) => {
      if (index < regPaths.length) {
        await checkRegPath(regPaths[index]);
        await checkNextPath(index + 1);
      } else {
        resolve(softwareStillExists);
      }
    };

    checkNextPath();
  });
}

module.exports = {
  handleUninstall
};