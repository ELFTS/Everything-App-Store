
interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  status: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  progress: number;
  totalBytes: number;
  receivedBytes: number;
}

export class DownloadManager {
  private container: HTMLElement;
  private listElement: HTMLElement;
  private downloadItems: Map<string, DownloadItem> = new Map();

  constructor() {
    this.container = document.getElementById('download-manager-window')!;
    this.listElement = document.getElementById('dm-list')!;
    this.setupIpcListeners();
  }

  public show() {
    this.container.classList.add('open');
  }

  public hide() {
    this.container.classList.remove('open');
  }

  public toggle() {
    this.container.classList.toggle('open');
  }

  public startDownload(url: string, filename: string) {
    (window as any).electronAPI.startDownload(url, filename);
    this.show();
  }

  private setupIpcListeners() {
    (window as any).electronAPI.on('download-started', (item: DownloadItem) => {
      this.downloadItems.set(item.id, item);
      this.createDownloadItem(item);
      this.updateOverallProgress();
    });

    (window as any).electronAPI.on('download-progress', (item: DownloadItem) => {
      console.log('Received download progress:', item);
      const existingItem = this.downloadItems.get(item.id);
      if (existingItem) {
        Object.assign(existingItem, item);
        this.updateDownloadItem(existingItem);
      }
    });

    (window as any).electronAPI.on('download-completed', (item: DownloadItem) => {
      const existingItem = this.downloadItems.get(item.id);
      if (existingItem) {
        existingItem.status = 'completed';
        this.updateDownloadItem(existingItem);
      }
      this.updateOverallProgress();
    });

    (window as any).electronAPI.on('download-error', ({ id, error }: { id: string, error: string }) => {
      const existingItem = this.downloadItems.get(id);
      if (existingItem) {
        existingItem.status = 'interrupted';
        this.updateDownloadItem(existingItem);
        console.error(`Download error for ${existingItem.filename}: ${error}`);
      }
      this.updateOverallProgress();
    });

    (window as any).electronAPI.on('download-interrupted', ({ id, error }: { id: string, error: string }) => {
      const existingItem = this.downloadItems.get(id);
      if (existingItem) {
        existingItem.status = 'interrupted';
        this.updateDownloadItem(existingItem);
        console.error(`Download interrupted for ${existingItem.filename}: ${error}`);
      }
      this.updateOverallProgress();
    });

    (window as any).electronAPI.on('download-cancelled', (id: string) => {
      const itemElement = document.getElementById(`download-${id}`);
      if (itemElement) {
        itemElement.remove();
      }
      this.downloadItems.delete(id);
      this.updateOverallProgress();
    });
  }

  private createDownloadItem(item: DownloadItem) {
    const itemElement = document.createElement('div');
    itemElement.className = 'download-item';
    itemElement.id = `download-${item.id}`;
    itemElement.innerHTML = `
      <div class="file-info">
        <span class="file-name">${item.filename}</span>
        <span class="download-status">${item.status}</span>
      </div>
      <div class="download-controls">
        <button class="download-action-btn pause-resume-btn" title="暂停">
          <i class="ri-pause-line pause-icon"></i>
          <i class="ri-play-line resume-icon" style="display: none;"></i>
        </button>
        <button class="download-action-btn cancel-btn" title="取消">
          <i class="ri-close-line"></i>
        </button>
      </div>
    `;

    const pauseResumeBtn = itemElement.querySelector('.pause-resume-btn') as HTMLButtonElement;
    pauseResumeBtn.addEventListener('click', () => {
      const isPaused = pauseResumeBtn.classList.toggle('paused');
      const pauseIcon = pauseResumeBtn.querySelector('.pause-icon') as HTMLElement;
      const resumeIcon = pauseResumeBtn.querySelector('.resume-icon') as HTMLElement;

      if (isPaused) {
        (window as any).electronAPI.pauseDownload(item.id);
        pauseResumeBtn.title = '继续';
        pauseIcon.style.display = 'none';
        resumeIcon.style.display = 'block';
      } else {
        (window as any).electronAPI.resumeDownload(item.id);
        pauseResumeBtn.title = '暂停';
        pauseIcon.style.display = 'block';
        resumeIcon.style.display = 'none';
      }
    });

    const cancelButton = itemElement.querySelector('.cancel-btn');
    cancelButton?.addEventListener('click', () => {
      (window as any).electronAPI.cancelDownload(item.id);
    });

    this.listElement.appendChild(itemElement);
  }

  private updateDownloadItem(item: DownloadItem) {
    const itemElement = document.getElementById(`download-${item.id}`);
    if (itemElement) {
      const statusElement = itemElement.querySelector('.download-status')!;
      statusElement.textContent = this.getReadableStatus(item);

      if (item.status === 'progressing') {
        const progressColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-soft').trim() || '#4ade80';
        itemElement.style.backgroundImage = `linear-gradient(to right, ${progressColor} ${item.progress}%, transparent ${item.progress}%)`;
      } else {
        itemElement.style.backgroundImage = 'none';
      }

      if (item.status === 'completed') {
        const controlsElement = itemElement.querySelector('.download-controls');
        if (controlsElement) {
          controlsElement.innerHTML = `
            <button class="download-action-btn open-btn" title="打开所在文件夹">
              <i class="ri-folder-open-line"></i>
            </button>`;
          const openButton = controlsElement.querySelector('.open-btn');
          openButton?.addEventListener('click', () => {
            (window as any).electronAPI.openDownload(item.id);
          });
        }
        itemElement.classList.add('completed');
      } else if (item.status === 'interrupted') {
        const controlsElement = itemElement.querySelector('.download-controls');
        if (controlsElement) {
          controlsElement.innerHTML = `
            <button class="download-action-btn retry-btn" title="重试">
              <i class="ri-refresh-line"></i>
            </button>
            <button class="download-action-btn cancel-btn" title="取消">
              <i class="ri-close-line"></i>
            </button>
          `;
          const retryButton = controlsElement.querySelector('.retry-btn');
          retryButton?.addEventListener('click', () => {
            (window as any).electronAPI.retryDownload(item.id);
          });
          const cancelButton = controlsElement.querySelector('.cancel-btn');
          cancelButton?.addEventListener('click', () => {
            (window as any).electronAPI.cancelDownload(item.id);
          });
        }
      }
    }
    this.updateOverallProgress();
  }

  private updateOverallProgress() {
    const downloadManagerBtn = document.getElementById('download-manager-btn');
    const progressRing = downloadManagerBtn?.querySelector('.progress-ring-circle-progress') as SVGCircleElement | null;
    if (!downloadManagerBtn || !progressRing) return;

    const activeDownloads = Array.from(this.downloadItems.values()).filter(item => item.status === 'progressing');

    if (activeDownloads.length === 0) {
      downloadManagerBtn.classList.remove('downloading');
      return;
    }

    downloadManagerBtn.classList.add('downloading');

    let totalBytes = 0;
    let receivedBytes = 0;
    activeDownloads.forEach(item => {
      totalBytes += item.totalBytes;
      receivedBytes += item.receivedBytes;
    });

    const overallProgress = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0;
    const radius = progressRing.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (overallProgress / 100) * circumference;

    progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
    progressRing.style.strokeDashoffset = `${offset}`;
  }

  private getReadableStatus(item: DownloadItem): string {
    switch (item.status) {
      case 'progressing':
        return `下载中... ${item.progress.toFixed(2)}% (${(item.receivedBytes / 1024 / 1024).toFixed(2)}MB / ${(item.totalBytes / 1024 / 1024).toFixed(2)}MB)`;
      case 'completed':
        return '下载完成';
      case 'cancelled':
        return '已取消';
      case 'interrupted':
        return '已中断';
      default:
        return '';
    }
  }
}
