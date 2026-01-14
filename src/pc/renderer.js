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

  // ============ 核心1：从GitHub Pages加载应用列表（修改，存储所有应用） ============
  async function loadAppListFromGitHub() {
    // 替换为你的GitHub Pages地址！！！
    const appListUrl = 'https://elfts.github.io/Everything-App-Store/app-list.json';
    homeAppContainer.innerHTML = '<div class="loading-text col-span-full">正在加载应用列表...</div>';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(appListUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`请求失败：${response.status}`);
      const data = await response.json();
      allApps = data.apps; // 把所有应用存入全局变量
      renderFilteredAppList(currentCategory); // 默认渲染「全部应用」
      bindCategoryEvent(); // 绑定分类点击事件
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('加载失败：', error);
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

    // 绑定下载按钮事件
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        shell.openExternal(url);
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
        if (confirm(`确认卸载该软件吗？\n卸载后可在控制面板恢复。`)) {
          ipcRenderer.send('uninstall-software', uninstallCmd);
        }
      });
    });
  });

  ipcRenderer.on('uninstall-result', (event, result) => {
    alert(result.msg);
    ipcRenderer.send('get-installed-software');
  });

  // 初始加载首页应用列表
  if (document.getElementById('home-page').classList.contains('show') && !isAppListLoaded) {
    isAppListLoaded = true;
    loadAppListFromGitHub();
  }
};