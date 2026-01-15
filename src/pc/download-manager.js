let downloads = [];

function getDownloadApi() {
  if (window.electronAPI) return window.electronAPI;
  try {
    const { ipcRenderer } = require('electron');
    return {
      downloadFile: (url, fileName) => ipcRenderer.invoke('download-file', url, fileName),
      cancelDownload: (taskId) => ipcRenderer.invoke('cancel-download', taskId),
      pauseDownload: (taskId) => ipcRenderer.invoke('pause-download', taskId),
      resumeDownload: (taskId) => ipcRenderer.invoke('resume-download', taskId),
    };
  } catch (e) {
    return null;
  }
}

// 初始化下载管理
function initDownloadManager() {
  const downloadManagerBtn = document.getElementById('download-manager-btn');
  const downloadManagerWindow = document.getElementById('download-manager-window');
  const closeDownloadManager = document.getElementById('close-download-manager');
  
  ensureProgressRing();
  
  // 显示下载管理浮动窗口
  if (downloadManagerBtn) {
    downloadManagerBtn.addEventListener('click', function() {
      downloadManagerWindow.style.display = 'block';
      
      // 添加遮罩层
      let overlay = document.getElementById('overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'block';
      
      // 切换按钮状态
      this.classList.toggle('active');
    });
  }
  
  // 隐藏下载管理浮动窗口
  if (closeDownloadManager) {
    closeDownloadManager.addEventListener('click', function() {
      downloadManagerWindow.style.display = 'none';
      document.getElementById('overlay').style.display = 'none';
      
      // 移除按钮的激活状态
      document.getElementById('download-manager-btn').classList.remove('active');
    });
  }
  
  // 点击遮罩层关闭窗口
  document.getElementById('overlay')?.addEventListener('click', function() {
    downloadManagerWindow.style.display = 'none';
    this.style.display = 'none';
    
    // 移除按钮的激活状态
    document.getElementById('download-manager-btn').classList.remove('active');
  });
  
  // 绑定下载管理页面控件
  bindDownloadControls();
  updateDownloadManagerButtonProgress();
}

// 绑定下载管理页面控件
function bindDownloadControls() {
  document.getElementById('pause-all-downloads')?.addEventListener('click', pauseAllDownloads);
  document.getElementById('resume-all-downloads')?.addEventListener('click', resumeAllDownloads);
  document.getElementById('clear-completed')?.addEventListener('click', clearCompletedDownloads);
}

// 清除已完成的下载
function clearCompletedDownloads() {
  downloads = downloads.filter(item => item.status !== 'completed');
  renderDownloadsList();
  updateDownloadStats();
  updateDownloadManagerButtonProgress();
}

// 渲染下载列表
function renderDownloadsList() {
  const downloadsList = document.getElementById('downloads-list');
  if (!downloadsList) return;
  
  if (downloads.length === 0) {
    downloadsList.innerHTML = '<div class="no-downloads">暂无下载任务</div>';
    return;
  }
  
  // 按状态排序：下载中 -> 已暂停 -> 等待中 -> 已完成 -> 错误
  const statusOrder = { downloading: 1, paused: 2, waiting: 3, completed: 4, error: 5 };
  const sortedDownloads = [...downloads].sort((a, b) => {
    return statusOrder[a.status] - statusOrder[b.status];
  });
  
  downloadsList.innerHTML = sortedDownloads.map(item => {
    const statusText = {
      waiting: '等待中',
      downloading: '下载中',
      paused: '已暂停',
      completed: '已完成',
      error: '下载失败'
    }[item.status] || item.status;
    
    const statusClass = `download-${item.status}`;
    
    let actionButtons = '';
    if (item.status === 'downloading') {
      actionButtons = `
        <button class="download-action-btn" onclick="window.downloadModule.pauseDownload('${item.id}')" title="暂停">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        </button>
      `;
    } else if (item.status === 'paused') {
      actionButtons = `
        <button class="download-action-btn" onclick="window.downloadModule.resumeDownload('${item.id}')" title="恢复">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="5,3 19,12 5,21"></polygon>
          </svg>
        </button>
      `;
    }
    
    actionButtons += `
      <button class="download-action-btn" onclick="window.downloadModule.removeDownload('${item.id}')" title="删除">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    
    return `
      <div class="download-item ${statusClass}">
        <div class="app-icon">📁</div>
        <div class="download-info">
          <div class="download-name">${item.fileName}</div>
          <div class="download-status">${statusText} - ${Math.round(item.progress)}%</div>
          <div class="download-progress-container">
            <div class="download-progress-bar" style="width: ${item.progress}%"></div>
          </div>
          <div class="download-size">${item.fileSize}</div>
        </div>
        <div class="download-actions">
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');
}

// 更新下载统计
function updateDownloadStats() {
  const activeCount = downloads.filter(item => 
    item.status === 'downloading' || item.status === 'waiting' || item.status === 'paused'
  ).length;
  
  const completedCount = downloads.filter(item => item.status === 'completed').length;
  
  document.getElementById('active-downloads-count').textContent = activeCount;
  document.getElementById('completed-downloads-count').textContent = completedCount;
}

async function startDownload(downloadUrl, appName) {
  try {
    const urlObj = new URL(downloadUrl);
    const fileName = urlObj.pathname.split('/').pop() || `${appName}.exe`;
    const api = getDownloadApi();
    if (!api || !api.downloadFile) {
      throw new Error('下载接口未初始化');
    }
    const taskId = await api.downloadFile(downloadUrl, fileName);
    
    const downloadItem = {
      id: taskId,
      url: downloadUrl,
      fileName: fileName,
      fileSize: '未知大小',
      progress: 0,
      status: 'downloading',
      startTime: new Date()
    };
    
    downloads.push(downloadItem);
    renderDownloadsList();
    updateDownloadStats();
  updateDownloadManagerButtonProgress();
    
    // 确保下载管理窗口是打开的
    const downloadManagerWindow = document.getElementById('download-manager-window');
    const downloadManagerBtn = document.getElementById('download-manager-btn');
    if (downloadManagerWindow.style.display === 'none') {
      downloadManagerWindow.style.display = 'block';
      
      // 添加遮罩层
      let overlay = document.getElementById('overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'block';
      
      downloadManagerBtn.classList.add('active');
    }
  } catch (error) {
    console.error('下载启动失败:', error);
    showNotification(`启动下载失败: ${error.message}`);
  }
}

async function pauseDownload(taskId) {
  try {
    const api = getDownloadApi();
    if (!api || !api.pauseDownload) {
      throw new Error('暂停接口未初始化');
    }
    await api.pauseDownload(taskId);
    const downloadItem = downloads.find(item => item.id === taskId);
    if (downloadItem) {
      downloadItem.status = 'paused';
      renderDownloadsList();
    }
    updateDownloadManagerButtonProgress();
  } catch (error) {
    console.error('暂停下载失败:', error);
    showNotification(`暂停下载失败: ${error.message}`);
  }
}

async function resumeDownload(taskId) {
  try {
    const api = getDownloadApi();
    if (!api || !api.resumeDownload) {
      throw new Error('恢复接口未初始化');
    }
    await api.resumeDownload(taskId);
    const downloadItem = downloads.find(item => item.id === taskId);
    if (downloadItem) {
      downloadItem.status = 'downloading';
      renderDownloadsList();
    }
    updateDownloadManagerButtonProgress();
  } catch (error) {
    console.error('恢复下载失败:', error);
    showNotification(`恢复下载失败: ${error.message}`);
  }
}

function removeDownload(taskId) {
  const downloadItem = downloads.find(item => item.id === taskId);
  if (downloadItem && downloadItem.status === 'completed') {
    downloads = downloads.filter(item => item.id !== taskId);
  } else {
    const api = getDownloadApi();
    if (api && api.cancelDownload) {
      api.cancelDownload(taskId);
    }
    downloads = downloads.filter(item => item.id !== taskId);
  }
  renderDownloadsList();
  updateDownloadStats();
  updateDownloadManagerButtonProgress();
}

async function pauseAllDownloads() {
  const activeDownloads = downloads.filter(item => item.status === 'downloading');
  for (const item of activeDownloads) {
    await pauseDownload(item.id);
  }
}

async function resumeAllDownloads() {
  const pausedDownloads = downloads.filter(item => item.status === 'paused');
  for (const item of pausedDownloads) {
    await resumeDownload(item.id);
  }
}

let eventsAttached = false;
function attachDownloadEventListeners() {
  if (eventsAttached) return;
  const handleUpdate = (event, id, progressData) => {
    const downloadItem = downloads.find(item => item.id === id);
    if (!downloadItem) return;
    if (typeof progressData.progress === 'number' && !isNaN(progressData.progress) && progressData.progress > 0) {
      downloadItem.progress = progressData.progress;
    } else if (downloadItem.progress < 90) {
      downloadItem.progress += 2;
    }
    if (typeof progressData.downloaded === 'number' && progressData.downloaded > 0) {
      downloadItem.downloaded = progressData.downloaded;
      if (progressData.total && progressData.total > 0) {
        downloadItem.total = progressData.total;
        downloadItem.fileSize = `${formatBytes(progressData.downloaded)} / ${formatBytes(progressData.total)}`;
      } else {
        downloadItem.fileSize = `${formatBytes(progressData.downloaded)} / 大小未知`;
      }
    }
    if (downloadItem.status !== 'paused' && downloadItem.status !== 'error') {
      downloadItem.status = 'downloading';
    }
    renderDownloadsList();
    updateDownloadStats();
    updateDownloadManagerButtonProgress();
  };
  const handleComplete = (event, id, filePath) => {
    const downloadItem = downloads.find(item => item.id === id);
    if (!downloadItem) return;
    downloadItem.progress = 100;
    downloadItem.status = 'completed';
    renderDownloadsList();
    updateDownloadStats();
    showNotification(`${downloadItem.fileName} 下载完成！`);
    updateDownloadManagerButtonProgress();
  };
  const handleError = (event, id, error) => {
    const downloadItem = downloads.find(item => item.id === id);
    if (!downloadItem) return;
    downloadItem.status = 'error';
    renderDownloadsList();
    showNotification(`下载失败: ${downloadItem.fileName} - ${error}`);
    updateDownloadManagerButtonProgress();
  };
  if (window.electronAPI && window.electronAPI.onDownloadUpdate) {
    window.electronAPI.onDownloadUpdate(handleUpdate);
    window.electronAPI.onDownloadComplete(handleComplete);
    window.electronAPI.onDownloadError(handleError);
    eventsAttached = true;
    return;
  }
  try {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('download-update', handleUpdate);
    ipcRenderer.on('download-complete', handleComplete);
    ipcRenderer.on('download-error', handleError);
    eventsAttached = true;
  } catch (e) {
    // ignore
  }
}

attachDownloadEventListeners();

function ensureProgressRing() {
  const btn = document.getElementById('download-manager-btn');
  if (!btn) return;
  if (!btn.querySelector('.progress-ring-svg')) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('progress-ring-svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    const track = document.createElementNS(svgNS, 'circle');
    track.classList.add('progress-ring__track');
    track.setAttribute('cx', '18');
    track.setAttribute('cy', '18');
    track.setAttribute('r', '15');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-width', '3');
    const indicator = document.createElementNS(svgNS, 'circle');
    indicator.classList.add('progress-ring__indicator');
    indicator.setAttribute('cx', '18');
    indicator.setAttribute('cy', '18');
    indicator.setAttribute('r', '15');
    indicator.setAttribute('fill', 'none');
    indicator.setAttribute('stroke-width', '3');
    const c = 2 * Math.PI * 15;
    indicator.setAttribute('stroke-dasharray', `${c}`);
    indicator.setAttribute('stroke-dashoffset', `${c}`);
    svg.appendChild(track);
    svg.appendChild(indicator);
    btn.appendChild(svg);
  }
}

function updateDownloadManagerButtonProgress() {
  const btn = document.getElementById('download-manager-btn');
  if (!btn) return;
  ensureProgressRing();
  const indicator = btn.querySelector('.progress-ring__indicator');
  const active = downloads.filter(d => d.status !== 'completed' && d.status !== 'error');
  if (active.length === 0) {
    btn.classList.remove('has-progress');
    if (indicator) {
      const c = 2 * Math.PI * 15;
      indicator.setAttribute('stroke-dashoffset', `${c}`);
    }
    return;
  }
  let progress = 0;
  const withTotal = active.filter(d => typeof d.total === 'number' && d.total > 0 && typeof d.downloaded === 'number');
  if (withTotal.length > 0) {
    const totalSum = withTotal.reduce((sum, d) => sum + d.total, 0);
    const downloadedSum = withTotal.reduce((sum, d) => sum + d.downloaded, 0);
    progress = totalSum > 0 ? (downloadedSum / totalSum) * 100 : 0;
  } else {
    const avg = active.reduce((sum, d) => sum + (isNaN(d.progress) ? 0 : d.progress), 0) / active.length;
    progress = avg;
  }
  progress = Math.max(0, Math.min(100, progress));
  const c = 2 * Math.PI * 15;
  const offset = c * (1 - progress / 100);
  btn.classList.add('has-progress');
  if (indicator) {
    indicator.setAttribute('stroke-dashoffset', `${offset}`);
  }
}

// 格式化字节大小的辅助函数
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 显示通知的辅助函数
function showNotification(message) {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #333;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 300px;
    word-wrap: break-word;
    animation: slideInRight 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // 3秒后自动移除通知
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// 将下载管理功能挂载到window对象上
window.downloadModule = {
  initDownloadManager,
  startDownload,
  pauseDownload,
  resumeDownload,
  removeDownload,
  showNotification
};
