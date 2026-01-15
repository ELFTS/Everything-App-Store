const { ipcRenderer, shell } = require('electron')
window.onload = () => {
  // ============ 基础DOM获取 & 全局变量定义 ============
  const minBtn = document.getElementById('min-btn')
  const maxBtn = document.getElementById('max-btn')
  const closeBtn = document.getElementById('close-btn')
  const appContainer = document.getElementById('app-container')
  const maxIcon = maxBtn.querySelector('.max-icon')
  const unmaxIcon = maxBtn.querySelector('.unmax-icon')
  const softwareListContainer = document.getElementById('software-list-container');
  const homeAppContainer = document.getElementById('home-app-grid');
  const categoryItems = document.querySelectorAll('.category-item'); // 新增：分类按钮

  // 新增：分类相关全局变量
  let allApps = []; // 存储从GitHub加载的所有应用数据
  let currentCategory = "全部"; // 默认选中分类
  let isFirstLoadInstalled = true;
  let isAppListLoaded = false; // 标记应用列表是否已加载

  // ============ 标题栏搜索框 + 热门软件逻辑 ============
  const searchInput = document.getElementById('search-input');
  const hotAppsContainer = document.getElementById('hot-apps-container');
  const hotAppsList = document.getElementById('hot-apps-list');

  // 定义热门软件列表（可从GitHub配置读取，此处先静态定义）
  const hotApps = [
    { name: '微信', downloadUrl: 'https://pc.weixin.qq.com/' },
    { name: 'QQ', downloadUrl: 'https://im.qq.com/pcqq/' },
    { name: 'Chrome浏览器', downloadUrl: 'https://www.google.cn/chrome/' },
    { name: 'Edge浏览器', downloadUrl: 'https://www.microsoft.com/zh-cn/microsoft-edge/download' },
    { name: '腾讯视频', downloadUrl: 'https://v.qq.com/download.html' },
    { name: '网易云音乐', downloadUrl: 'https://music.163.com/#/download' },
    { name: 'WPS Office', downloadUrl: 'https://www.wps.cn/' },
    { name: '7-Zip', downloadUrl: 'https://www.7-zip.org/' }
  ];

  // 渲染热门软件列表
  function renderHotApps() {
    hotAppsList.innerHTML = '';
    hotApps.forEach(app => {
      const item = document.createElement('div');
      item.className = 'hot-app-item';
      item.textContent = app.name;
      item.setAttribute('data-url', app.downloadUrl);
      hotAppsList.appendChild(item);
    });

    // 绑定热门软件点击事件
    document.querySelectorAll('.hot-app-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.getAttribute('data-url');
        // 优先使用preload暴露的API，兼容原有shell调用
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(url);
        } else {
          shell.openExternal(url);
        }
        hotAppsContainer.classList.add('hidden'); // 点击后隐藏弹窗
      });
    });
  }

  // 搜索框交互
  searchInput.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发标题栏拖拽
    renderHotApps(); // 每次点击重新渲染
    hotAppsContainer.classList.remove('hidden');
  });

  // 点击页面其他区域关闭热门软件弹窗
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !hotAppsContainer.contains(e.target)) {
      hotAppsContainer.classList.add('hidden');
    }
  });

  // 搜索框失焦延迟关闭（解决点击热门软件时先失焦关闭的问题）
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      hotAppsContainer.classList.add('hidden');
    }, 200);
  });

  // 阻止热门软件弹窗内点击事件冒泡
  hotAppsContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // ============ 原有窗口控制逻辑（完全保留） ============
  minBtn.addEventListener('click', () => { ipcRenderer.send('window-control', 'minimize') })
  maxBtn.addEventListener('click', () => { ipcRenderer.send('window-control', 'maximize') })
  closeBtn.addEventListener('click', () => { ipcRenderer.send('window-control', 'close') })

  ipcRenderer.on('window-status', (event, isMaximized) => {
    if (isMaximized) {
      appContainer.classList.add('maximized')
      maxIcon.classList.add('hidden')
      unmaxIcon.classList.remove('hidden')
    } else {
      appContainer.classList.remove('maximized')
      maxIcon.classList.remove('hidden')
      unmaxIcon.classList.add('hidden')
    }
  })

  // ============ 侧边栏+页面切换逻辑（完全保留，无修改） ============
  const menuItems = document.querySelectorAll('.sidebar-menu-item.menu-item')
  const pageItems = document.querySelectorAll('.page-item')
  menuItems[0].classList.add('active')

  menuItems.forEach(item => {
    item.addEventListener('click', function() {
      menuItems.forEach(menu => menu.classList.remove('active'))
      this.classList.add('active')
      const targetPage = this.getAttribute('data-page')
      pageItems.forEach(page => page.classList.remove('show'))
      document.getElementById(targetPage).classList.add('show')

      if (targetPage === 'installed-page' && isFirstLoadInstalled) {
        isFirstLoadInstalled = false;
        ipcRenderer.send('get-installed-software');
      }

      if (targetPage === 'home-page' && !isAppListLoaded) {
        isAppListLoaded = true;
        loadAppListFromGitHub();
      }
    })
  })

  async function loadAppListFromGitHub() {
    homeAppContainer.innerHTML = '<div class="loading-text col-span-full">正在加载应用列表...</div>';
    let localData = null;
    if (window.electronAPI?.getLocalAppList) {
      try {
        localData = window.electronAPI.getLocalAppList();
      } catch (e) {
        localData = null;
      }
    }
    if (localData && Array.isArray(localData.apps) && localData.apps.length > 0) {
      allApps = localData.apps;
      renderFilteredAppList(currentCategory);
      bindCategoryEvent();
      return;
    }
    const appListUrl = 'https://elfts.github.io/Everything-App-Store/app-list.json';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(appListUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`请求失败：${response.status}`);
      const data = await response.json();
      allApps = data.apps || [];
      renderFilteredAppList(currentCategory);
      bindCategoryEvent();
    } catch (error) {
      clearTimeout(timeoutId);
      if (localData && Array.isArray(localData.apps)) {
        allApps = localData.apps;
        renderFilteredAppList(currentCategory);
        bindCategoryEvent();
        return;
      }
      if (error.name === 'AbortError') {
        homeAppContainer.innerHTML = '<div class="empty-text col-span-full">请求超时，请检查网络</div>';
      } else {
        homeAppContainer.innerHTML = '<div class="empty-text col-span-full">加载失败，请检查网络或稍后重试</div>';
      }
    }
  }

  // ============ 核心2：新增 - 分类筛选 + 渲染列表 核心函数 ============
  function renderFilteredAppList(category) {
    homeAppContainer.innerHTML = '';
    // 筛选逻辑：选中「全部」则显示所有，否则筛选对应分类的应用
    let filteredApps = category === '全部' ? allApps : allApps.filter(app => app.category === category);

    if (filteredApps.length === 0) {
      homeAppContainer.innerHTML = '<div class="empty-text col-span-full">该分类暂无应用</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredApps.forEach(app => {
      const card = document.createElement('div');
      card.className = 'app-card';
      card.innerHTML = `
        <div class="img-placeholder"></div>
        <img data-src="${app.image}" alt="${app.name}" class="hidden">
        <div class="p-4">
          <h3 class="font-bold text-lg mb-2 text-gray-800">${app.name}</h3>
          <p class="text-gray-500 text-xs mb-3 line-clamp-2">${app.desc}</p>
          <button class="download-btn" data-url="${app.downloadUrl}">立即下载</button>
        </div>
      `;
      fragment.appendChild(card);
    });
    homeAppContainer.appendChild(fragment);

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const downloadUrl = this.getAttribute('data-url');
        const appName = this.closest('.app-card')?.querySelector('h3')?.textContent || '应用';
        if (window.downloadModule?.startDownload) {
          window.downloadModule.startDownload(downloadUrl, appName);
        } else if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(downloadUrl);
        } else {
          shell.openExternal(downloadUrl);
        }
      });
    });

    // 图片懒加载
    lazyLoadImages();
  }

  // ============ 核心3：新增 - 分类按钮点击事件绑定 ============
  function bindCategoryEvent() {
    categoryItems.forEach(item => {
      item.addEventListener('click', function() {
        // 移除所有分类的选中样式，给当前点击的添加
        categoryItems.forEach(ci => ci.classList.remove('active'));
        this.classList.add('active');
        // 更新当前选中分类并重新渲染列表
        currentCategory = this.getAttribute('data-category');
        renderFilteredAppList(currentCategory);
      });
    });
  }

  // ============ 图片懒加载+缓存（完全保留） ============
  const imageCache = new Map();
  function lazyLoadImages() {
    const imgElements = document.querySelectorAll('img[data-src]');
    imgElements.forEach(img => {
      const src = img.getAttribute('data-src');
      if (imageCache.has(src)) {
        img.src = src;
        img.classList.remove('hidden');
        img.previousElementSibling.classList.add('hidden');
        return;
      }
      const image = new Image();
      image.src = src;
      image.onload = () => {
        imageCache.set(src, src);
        img.src = src;
        img.classList.remove('hidden');
        img.previousElementSibling.classList.add('hidden');
      };
      image.onerror = () => {
        img.previousElementSibling.classList.remove('hidden');
        img.classList.add('hidden');
      };
    });
  }

  // ============ 已安装软件+卸载逻辑（完全保留） ============
  ipcRenderer.on('installed-software-list', (event, softwareList) => {
    softwareListContainer.innerHTML = '';
    if (softwareList.length === 0) {
      softwareListContainer.innerHTML = '<div class="empty-text">暂无已安装软件</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    softwareList.forEach(software => {
      const item = document.createElement('div');
      item.className = 'software-item';
      item.innerHTML = `
        <div class="software-info">
          <div class="software-name">${software.name}</div>
          <div class="software-desc">
            <span>版本：${software.version}</span>
            <span>发布商：${software.publisher}</span>
            <span>安装路径：${software.installPath || '未知'}</span>
          </div>
        </div>
        <button class="uninstall-btn" data-cmd="${software.uninstallCmd}">一键卸载</button>
      `;
      fragment.appendChild(item);
    });
    softwareListContainer.appendChild(fragment);

    document.querySelectorAll('.uninstall-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const uninstallCmd = this.getAttribute('data-cmd');
        const softwareName = this.closest('.software-item').querySelector('.software-name').textContent;
        
        if (confirm(`⚠️ 确认卸载【${softwareName}】吗？\n\n此操作不可逆，卸载后数据将无法恢复。\n如需恢复可在控制面板中操作。`)) {
          // 显示卸载确认
          const uninstallResultDiv = document.createElement('div');
          uninstallResultDiv.id = 'uninstall-result-message';
          uninstallResultDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            padding: 20px 30px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            min-width: 300px;
            text-align: center;
            border: 1px solid #d1d5db;
          `;
          
          uninstallResultDiv.innerHTML = `
            <div style="margin-bottom: 15px; color: #333;">正在启动卸载程序...</div>
            <div style="font-size: 14px; color: #666;">请稍候，这可能需要一些时间</div>
          `;
          
          document.body.appendChild(uninstallResultDiv);
          
          // 发送带软件名称的卸载请求
          ipcRenderer.send('uninstall-software', uninstallCmd, softwareName);
        }
      });
    });
  });

  // 接收卸载进度信息
  ipcRenderer.on('uninstall-progress', (event, progressData) => {
    const resultDiv = document.getElementById('uninstall-result-message');
    if (resultDiv) {
      let statusIcon = '⏳';
      let statusColor = '#666';
      
      switch(progressData.status) {
        case 'starting':
          statusIcon = '🔄';
          statusColor = '#3b82f6';
          break;
        case 'running':
          statusIcon = '⚙️';
          statusColor = '#3b82f6';
          break;
        case 'completed':
          statusIcon = '✅';
          statusColor = '#10B981';
          break;
        case 'error':
          statusIcon = '❌';
          statusColor = '#EF4444';
          break;
      }
      
      resultDiv.innerHTML = `
        <div style="margin-bottom: 15px; color: ${statusColor};">
          ${statusIcon} ${progressData.message}
        </div>
        <div style="font-size: 14px; color: #666;">请稍候...</div>
      `;
    }
  });

  ipcRenderer.on('uninstall-result', (event, result) => {
    const resultDiv = document.getElementById('uninstall-result-message');
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div style="margin-bottom: 15px; color: ${result.success ? '#10B981' : '#EF4444'};">
          ${result.success ? '✅' : '❌'} ${result.msg}
        </div>
      `;
      
      // 3秒后自动关闭提示
      setTimeout(() => {
        if (resultDiv.parentNode) {
          resultDiv.parentNode.removeChild(resultDiv);
        }
      }, 3000);
    } else {
      // 如果没有进度提示，则直接显示结果
      alert(result.msg);
    }
    
    // 如果卸载成功，刷新已安装软件列表
    if (result.success) {
      setTimeout(() => {
        ipcRenderer.send('get-installed-software');
      }, 1500);
    }
  });

  // 当收到软件列表更新通知时，重新加载列表
  ipcRenderer.on('installed-software-list-updated', () => {
    ipcRenderer.send('get-installed-software');
  });

  // 初始加载首页应用列表
  if (document.getElementById('home-page').classList.contains('show') && !isAppListLoaded) {
    isAppListLoaded = true;
    loadAppListFromGitHub();
  }
};

// 选择器缓存
const selectors = {
  searchInput: '#search-input',
  hotAppsContainer: '#hot-apps-container',
  hotAppsList: '#hot-apps-list',
  appGrid: '#home-app-grid',
  categoryItems: '.category-item',
  menuItem: '.menu-item',
};

// 搜索框事件处理
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector(selectors.searchInput);
  const hotAppsContainer = document.querySelector(selectors.hotAppsContainer);
  
  if (searchInput && hotAppsContainer) {
    // 搜索框聚焦时显示热门软件
    searchInput.addEventListener('focus', () => {
      hotAppsContainer.classList.remove('hidden');
    });
    
    // 点击其他地方隐藏热门软件
    document.addEventListener('click', (event) => {
      if (!searchInput.contains(event.target) && !hotAppsContainer.contains(event.target)) {
        hotAppsContainer.classList.add('hidden');
      }
    });
    
    // 搜索框输入事件
    searchInput.addEventListener('input', debounce((e) => {
      const searchTerm = e.target.value.trim();
      if (searchTerm) {
        performSearch(searchTerm);
      } else {
        loadHomePage(); // 显示首页内容
      }
    }, 300));
  }
  
  // 初始化下载管理功能，确保模块已加载
  if (window.downloadModule) {
    window.downloadModule.initDownloadManager();
  } else {
    // 如果模块还未加载，延迟重试
    setTimeout(() => {
      if (window.downloadModule) {
        window.downloadModule.initDownloadManager();
      }
    }, 100);
  }
});

// 添加防抖函数（如果还没有的话）
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============ 下载管理功能 ============
// （此部分内容已移至 download-manager.js 模块中）

// 启动下载（从应用卡片）
// （此功能已移至 download-manager.js 模块中）

// 格式化字节大小的辅助函数
// （此功能已移至 download-manager.js 模块中）

// 显示通知的辅助函数
// （此功能已移至 download-manager.js 模块中）

// 暂停下载
// （此功能已移至 download-manager.js 模块中）

// 恢复下载
// （此功能已移至 download-manager.js 模块中）

// 删除下载任务
// （此功能已移至 download-manager.js 模块中）
