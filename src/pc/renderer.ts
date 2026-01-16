/// <reference path="globals.d.ts" />

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

const minBtn = document.getElementById('min-btn') as HTMLButtonElement | null;
const maxBtn = document.getElementById('max-btn') as HTMLButtonElement | null;
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement | null;
const downloadManagerBtn = document.getElementById('download-manager-btn') as HTMLButtonElement | null;
const appContainer = document.getElementById('app-container') as HTMLDivElement | null;
const softwareListContainer = document.getElementById('software-list-container') as HTMLDivElement | null;
const homeAppContainer = document.getElementById('home-app-grid') as HTMLDivElement | null;
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const hotAppsContainer = document.getElementById('hot-apps-container') as HTMLDivElement | null;
const hotAppsList = document.getElementById('hot-apps-list') as HTMLDivElement | null;

const SETTINGS_STORAGE_KEY = 'everythingAppStore.settings';
const defaultSettings: AppSettings = {
  useLightTheme: true,
  showDownloadNotification: true,
  playDownloadSound: false,
  autoLaunch: false,
  autoCheckUpdates: true
};

let allApps: AppData[] = [];
let currentCategory = "全部";
let isFirstLoadInstalled = true;
let isAppListLoaded = false;

function updateMaxIcon(isMaximized: boolean) {
  if (!appContainer || !maxBtn) return;
  const maxIcon = maxBtn.querySelector('.max-icon') as HTMLElement;
  const unmaxIcon = maxBtn.querySelector('.unmax-icon') as HTMLElement;
  if (isMaximized) {
    appContainer.classList.add('maximized');
    maxIcon.classList.add('hidden');
    unmaxIcon.classList.remove('hidden');
  } else {
    appContainer.classList.remove('maximized');
    maxIcon.classList.remove('hidden');
    unmaxIcon.classList.add('hidden');
  }
}

window.onload = () => {
  if (minBtn && maxBtn && closeBtn && downloadManagerBtn && appContainer && softwareListContainer && homeAppContainer && searchInput && hotAppsContainer && hotAppsList) {
    function loadStoredSettings(): Partial<AppSettings> | null {
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
      } catch (e: any) {
        return null;
      }
    }
    let appSettings: AppSettings = Object.assign({}, defaultSettings, loadStoredSettings() || {});
    (window as any).appSettings = appSettings;
    function applyTheme(useLight: boolean) {
      const root = document.documentElement;
      if (!root) return;
      if (useLight) {
        root.classList.remove('theme-dark');
      } else {
        root.classList.add('theme-dark');
      }
    }
    function syncSettingsToUI() {
      const inputs = document.querySelectorAll('.settings-page input[type="checkbox"][data-setting-key]') as NodeListOf<HTMLInputElement>;
      inputs.forEach(input => {
        const key = input.getAttribute('data-setting-key');
        if (!key) return;
        const value = appSettings[key];
        input.checked = !!value;
      });
      applyTheme(appSettings.useLightTheme);
    }
    function persistSettings() {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
      } catch (e) {}
    }
    function handleSettingChange(key: string, value: boolean) {
      appSettings[key] = value;
      (window as any).appSettings = appSettings;
      if (key === 'useLightTheme') {
        applyTheme(value);
      }
      if (key === 'autoLaunch' && (window as any).electronAPI && (window as any).electronAPI.setAutoLaunch) {
        (window as any).electronAPI.setAutoLaunch(value);
      }
      if (key === 'autoCheckUpdates' && value && (window as any).downloadModule && typeof (window as any).downloadModule.showNotification === 'function') {
        (window as any).downloadModule.showNotification('已自动检查更新，当前为最新版本 v1.0.0');
      }
      persistSettings();
    }
    syncSettingsToUI();
    if (appSettings.autoCheckUpdates && (window as any).downloadModule && typeof (window as any).downloadModule.showNotification === 'function') {
      (window as any).downloadModule.showNotification('已自动检查更新，当前为最新版本 v1.0.0');
    }
    const settingsInputs = document.querySelectorAll('.settings-page input[type="checkbox"][data-setting-key]') as NodeListOf<HTMLInputElement>;
    settingsInputs.forEach(input => {
      const key = input.getAttribute('data-setting-key');
        if (!key) return;
        input.addEventListener('change', () => {
          handleSettingChange(key, input.checked);
        });
    });
    if ((window as any).electronAPI && (window as any).electronAPI.getAutoLaunchStatus) {
      (window as any).electronAPI.getAutoLaunchStatus().then((value: boolean) => {
        if (typeof value === 'boolean') {
          appSettings.autoLaunch = value;
          (window as any).appSettings = appSettings;
          syncSettingsToUI();
          persistSettings();
        }
      }).catch(() => {});
    }
    
    const hotApps: { name: string; downloadUrl: string }[] = [
      { name: '微信', downloadUrl: 'https://pc.weixin.qq.com/' },
      { name: 'QQ', downloadUrl: 'https://im.qq.com/pcqq/' },
      { name: 'Chrome浏览器', downloadUrl: 'https://www.google.cn/chrome/' },
      { name: 'Edge浏览器', downloadUrl: 'https://www.microsoft.com/zh-cn/microsoft-edge/download' },
      { name: '腾讯视频', downloadUrl: 'https://v.qq.com/download.html' },
      { name: '网易云音乐', downloadUrl: 'https://music.163.com/#/download' },
      { name: 'WPS Office', downloadUrl: 'https://www.wps.cn/' },
      { name: '7-Zip', downloadUrl: 'https://www.7-zip.org/' }
    ];

    function renderHotApps() {
      if (!hotAppsList) return;
      hotAppsList.innerHTML = '';
      hotApps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'hot-app-item';
        item.textContent = app.name;
        item.setAttribute('data-url', app.downloadUrl);
        hotAppsList.appendChild(item);
      });

      document.querySelectorAll('.hot-app-item').forEach(item => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url');
          if (url && (window as any).electronAPI?.openExternalUrl) {
            (window as any).electronAPI.openExternalUrl(url);
          }
          if (hotAppsContainer) hotAppsContainer.classList.add('hidden');
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        renderHotApps();
        if (hotAppsContainer) hotAppsContainer.classList.remove('hidden');
      });

      searchInput.addEventListener('blur', () => {
        setTimeout(() => {
          if (hotAppsContainer) hotAppsContainer.classList.add('hidden');
        }, 200);
      });
    }

    document.addEventListener('click', (e: MouseEvent) => {
      if (searchInput && !searchInput.contains(e.target as Node) && hotAppsContainer && !hotAppsContainer.contains(e.target as Node)) {
        hotAppsContainer.classList.add('hidden');
      }
    });

    if (hotAppsContainer) {
      hotAppsContainer.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
      });
    }

    if (minBtn) minBtn.addEventListener('click', () => { (window as any).electronAPI.minimizeApp() })
    if (maxBtn) maxBtn.addEventListener('click', async () => { 
      const isMax = await (window as any).electronAPI.maximizeApp();
      updateMaxIcon(isMax);
    })
    if (closeBtn) closeBtn.addEventListener('click', () => { (window as any).electronAPI.closeApp() })
    if (downloadManagerBtn) {
      // The click event is handled internally by download-manager.js
    }

    const menuItems = document.querySelectorAll('.sidebar-menu-item.menu-item') as NodeListOf<HTMLDivElement>;
    const pageItems = document.querySelectorAll('.page-item') as NodeListOf<HTMLDivElement>;
    menuItems[0].classList.add('active');

    function renderHotAppsList() {
      const hotAppNames = ['微信', 'QQ', 'Chrome浏览器', 'Edge浏览器', '腾讯视频', '网易云音乐', 'WPS Office', '7-Zip'];
      const hotApps = allApps.filter(app => hotAppNames.includes(app.name));
      renderFilteredAppList('热门应用', hotApps);
    }

    menuItems.forEach(item => {
      item.addEventListener('click', function() {
        menuItems.forEach(menu => menu.classList.remove('active'));
        this.classList.add('active');
        const targetPage = this.getAttribute('data-page');
        if (targetPage) {
          pageItems.forEach(page => page.classList.remove('show'));
          const pageToShow = document.getElementById(targetPage);
          if (pageToShow) {
            pageToShow.classList.add('show');
          }

          if (targetPage === 'installed-page' && isFirstLoadInstalled) {
            isFirstLoadInstalled = false;
            loadInstalledSoftware();
          }

          if (targetPage === 'home-page' && !isAppListLoaded) {
            isAppListLoaded = true;
            loadAppListFromGitHub();
          } else if (targetPage === 'hot-apps-page') {
            const homePage = document.getElementById('home-page');
            if (homePage) {
              homePage.classList.add('show');
            }
            if (isAppListLoaded) {
              renderHotAppsList();
            } else {
              loadAppListFromGitHub().then(() => {
                isAppListLoaded = true;
                renderHotAppsList();
              });
            }
          }
        }
      })
    });
  }
}

async function loadAppListFromGitHub() {
  if (!homeAppContainer) return;
  homeAppContainer.innerHTML = '<div class="loading-text col-span-full">正在加载应用列表...</div>';
  let localData: { apps: AppData[] } | null = null;
  if ((window as any).electronAPI?.getLocalAppList) {
    try {
      localData = await (window as any).electronAPI.getLocalAppList();
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
  } catch (error: any) {
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

function renderFilteredAppList(category: string, appsToShow?: AppData[]) {
  console.log('Rendering list for category:', category, 'with apps:', appsToShow);
  if (!homeAppContainer) return;
  homeAppContainer.innerHTML = '';
  
  let filteredApps = appsToShow 
    ? appsToShow 
    : (category === '全部' ? allApps : allApps.filter(app => app.category === category));

  if (filteredApps.length === 0) {
    const message = category.startsWith('搜索：') 
      ? `未找到与 "${category.substring(3)}" 相关的应用`
      : '该分类暂无应用';
    homeAppContainer.innerHTML = `<div class="empty-text col-span-full">${message}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredApps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.innerHTML = `
      <div class="img-placeholder"></div>
      <img data-src="${app.image}" alt="${app.name}" class="hidden">
      <div class="card-content">
        <h3 class="card-title">${app.name}</h3>
        <p class="card-desc line-clamp-2">${app.desc}</p>
        <button class="download-btn" data-url="${app.downloadUrl}">立即下载</button>
      </div>
    `;
    fragment.appendChild(card);
  });
  homeAppContainer.appendChild(fragment);

  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const downloadUrl = button.getAttribute('data-url');
      const appName = button.closest('.app-card')?.querySelector('h3')?.textContent || '应用';
      if (downloadUrl) {
          if ((window as any).downloadModule?.startDownload) {
            (window as any).downloadModule.startDownload(downloadUrl, appName);
          } else if ((window as any).electronAPI?.openExternalUrl) {
            (window as any).electronAPI.openExternalUrl(downloadUrl);
          }
      }
    });
  });

  lazyLoadImages();
}

async function loadInstalledSoftware() {
  if (!softwareListContainer) return;
  softwareListContainer.innerHTML = '<div class="loading-text">正在加载已安装软件...</div>';
  try {
    const softwareList: SoftwareInfo[] = await (window as any).electronAPI.getInstalledSoftware();
    if (softwareList.length === 0) {
      softwareListContainer.innerHTML = '<div class="empty-text">未检测到已安装的软件</div>';
      return;
    }
    softwareListContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    softwareList.forEach(info => {
      const item = document.createElement('div');
      item.className = 'software-item';
      item.innerHTML = `
        <div class="software-icon-wrapper">
          ${info.icon ? `<img src="${info.icon}" alt="${info.name}" class="software-icon">` : '<div class="software-icon-placeholder"></div>'}
        </div>
        <div class="software-info">
          <div class="software-name">${info.name}</div>
          <div class="software-version">版本: ${info.version}</div>
          <div class="software-publisher">发布者: ${info.publisher}</div>
        </div>
        <button class="uninstall-btn" data-path="${info.path}">卸载</button>
      `;
      fragment.appendChild(item);
    });
    softwareListContainer.appendChild(fragment);
  } catch (error) {
    softwareListContainer.innerHTML = '<div class="empty-text">加载已安装软件列表失败</div>';
  }
}

function bindCategoryEvent() {
  const categoryItems = document.querySelectorAll('.category-item') as NodeListOf<HTMLDivElement>;
  categoryItems.forEach(item => {
    item.addEventListener('click', function() {
      categoryItems.forEach(ci => ci.classList.remove('active'));
      this.classList.add('active');
      const category = this.getAttribute('data-category') || '全部';
      currentCategory = category;
      renderFilteredAppList(category);
    });
  });
}

function lazyLoadImages() {
  const lazyImages = document.querySelectorAll('img[data-src]') as NodeListOf<HTMLImageElement>;
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.getAttribute('data-src');
        if (src) {
          img.src = src;
          img.classList.remove('hidden');
          const placeholder = img.previousElementSibling as HTMLDivElement;
          if (placeholder && placeholder.classList.contains('img-placeholder')) {
            placeholder.style.display = 'none';
          }
        }
        observer.unobserve(img);
      }
    });
  });
  lazyImages.forEach(img => observer.observe(img));
}

