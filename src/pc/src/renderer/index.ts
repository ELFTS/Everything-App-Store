
import { DownloadManager } from './downloadManager';

document.addEventListener('DOMContentLoaded', () => {
  const downloadManager = new DownloadManager();
  (window as any).downloadManager = downloadManager;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const hotAppsContainer = document.getElementById('hot-apps-container');
  const mainContent = document.querySelector('.main-content');

  const hotApps = [
    { name: '微信', url: '#' },
    { name: 'QQ', url: '#' },
    { name: '抖音', url: '#' },
    { name: 'Visual Studio Code', url: '#' },
    { name: 'Chrome', url: '#' },
  ];

  const hotAppsList = document.getElementById('hot-apps-list');
  if (hotAppsList) {
    hotApps.forEach(app => {
      const item = document.createElement('div');
      item.className = 'hot-app-item';
      item.textContent = app.name;
      item.onclick = () => {
        console.log(`Searching for ${app.name}`);
        if (hotAppsContainer) {
          hotAppsContainer.classList.add('hidden');
        }
      };
      hotAppsList.appendChild(item);
    });
  }

  searchInput.addEventListener('focus', () => {
    if (hotAppsContainer) {
      hotAppsContainer.classList.remove('hidden');
    }
  });

  document.addEventListener('click', (event) => {
    if (mainContent && hotAppsContainer && !searchInput.contains(event.target as Node) && !hotAppsContainer.contains(event.target as Node)) {
      hotAppsContainer.classList.add('hidden');
    }
  });

  const menuItems = document.querySelectorAll('.menu-item');
  const pages = document.querySelectorAll('.page-item');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const pageId = item.getAttribute('data-page');
      pages.forEach(page => page.classList.remove('show'));
      const targetPage = document.getElementById(pageId!);
      if (targetPage) {
        targetPage.classList.add('show');
      }

      if (pageId === 'installed-page') {
        loadInstalledSoftware();
      }
    });
  });

  async function loadInstalledSoftware() {
    const container = document.getElementById('software-list-container');
    if (!container) return;
  
    container.innerHTML = '<div class="loading-text">正在扫描本机已安装软件，请稍候...</div>';
  
    try {
      const softwareList = await (window as any).electronAPI.getInstalledSoftware();
      container.innerHTML = '';
  
      if (softwareList.length === 0) {
        container.innerHTML = '<div class="no-software">未检测到任何已安装的软件。</div>';
        return;
      }
  
      softwareList.forEach((software: any) => {
        const item = document.createElement('div');
        item.className = 'software-item';
        item.innerHTML = `
          <img src="${software.icon || './images/default-icon.png'}" alt="${software.name}" class="software-icon">
          <div class="software-info">
            <div class="software-name">${software.name}</div>
            <div class="software-version">版本: ${software.version}</div>
            <div class="software-publisher">发布商: ${software.publisher}</div>
          </div>
          <button class="uninstall-btn">卸载</button>
        `;
  
        const uninstallBtn = item.querySelector('.uninstall-btn');
        if (uninstallBtn) {
          uninstallBtn.addEventListener('click', () => {
            (window as any).electronAPI.uninstallApp(software.name, software.uninstallCmd);
          });
        }
  
        container.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load installed software:', error);
      container.innerHTML = '<div class="error-text">加载已安装软件列表失败。</div>';
    }
  }

  document.getElementById('download-manager-btn')?.addEventListener('click', () => {
    downloadManager.toggle();
  });

  document.getElementById('min-btn')?.addEventListener('click', () => {
    (window as any).electronAPI.minimizeApp();
  });

  const maxBtn = document.getElementById('max-btn');
  const maxIcon = maxBtn?.querySelector('.max-icon');
  const unmaxIcon = maxBtn?.querySelector('.unmax-icon');

  maxBtn?.addEventListener('click', async () => {
    const isMaximized = await (window as any).electronAPI.maximizeApp();
    if (isMaximized) {
      maxIcon?.classList.add('hidden');
      unmaxIcon?.classList.remove('hidden');
    } else {
      maxIcon?.classList.remove('hidden');
      unmaxIcon?.classList.add('hidden');
    }
  });

  document.getElementById('close-btn')?.addEventListener('click', () => {
    (window as any).electronAPI.closeApp();
  });

  let allApps: any[] = [];

  async function loadAndRenderApps() {
    try {
      const data = await (window as any).electronAPI.getLocalAppList();
      console.log('App data received from main process:', data);
      if (data && data.apps) {
        allApps = data.apps;
        renderAppGrid(allApps);
        setupCategoryClickHandlers();
      } else {
        console.error('No apps found in data:', data);
        document.getElementById('home-app-grid')!.innerHTML = '<p>无法加载应用列表。</p>';
      }
    } catch (error) {
      console.error('Failed to load app list:', error);
      document.getElementById('home-app-grid')!.innerHTML = '<p>加载应用列表失败。</p>';
    }
  }

  function renderAppGrid(apps: any[]) {
    const appGrid = document.getElementById('home-app-grid');
    if (!appGrid) return;
    appGrid.innerHTML = '';
    apps.forEach(app => {
      const appCard = document.createElement('div');
      appCard.className = 'app-card';
      appCard.innerHTML = `
        <img src="${app.image}" alt="${app.name}" class="app-icon">
        <div class="app-name">${app.name}</div>
        <div class="app-desc">${app.desc}</div>
        <button class="download-btn" data-url="${app.downloadUrl}" data-name="${app.name}">下载</button>
      `;
      appGrid.appendChild(appCard);
    });
  }

  function setupCategoryClickHandlers() {
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
      item.addEventListener('click', () => {
        categoryItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const category = item.getAttribute('data-category');
        const filteredApps = category === '全部' ? allApps : allApps.filter(app => app.category === category);
        console.log(`Rendering list for category: ${category} with apps:`, filteredApps);
        renderAppGrid(filteredApps);
      });
    });
  }

  const settings = {
    useLightTheme: true,
    showDownloadNotification: true,
    playDownloadSound: false,
    autoLaunch: false,
    autoCheckUpdates: true,
  };

  const settingCheckboxes = document.querySelectorAll('input[type="checkbox"][data-setting-key]');

  settingCheckboxes.forEach(checkbox => {
    const key = (checkbox as HTMLInputElement).dataset.settingKey as keyof typeof settings;
    (checkbox as HTMLInputElement).checked = settings[key];
    checkbox.addEventListener('change', () => {
      (settings[key] as boolean) = (checkbox as HTMLInputElement).checked;
      console.log('Settings updated:', settings);
      if (key === 'autoLaunch') {
        (window as any).electronAPI.setAutoLaunch((checkbox as HTMLInputElement).checked);
      }
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('download-btn')) {
      const url = target.dataset.url;
      const name = target.dataset.name;
      if (url && name) {
        (window as any).downloadManager.startDownload(url, `${name}.exe`);
      }
    }
  });

  loadAndRenderApps();
});
