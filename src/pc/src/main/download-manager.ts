import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { app, BrowserWindow, DownloadItem } from 'electron';
import { URL } from 'url';

export interface DownloadTask {
  id: string;
  url: string;
  filePath: string;
  filename: string;
  totalLength: number;
  downloadedLength: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error' | 'interrupted';
  request?: http.ClientRequest;
  fileStream?: fs.WriteStream;
  downloadItem?: DownloadItem;
}

export class DownloadManager {
  private downloadTasks = new Map<string, DownloadTask>();
  private downloadsDir: string;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.downloadsDir = path.join(app.getPath('userData'), 'downloads');
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
  }

  public createTaskFromElectronDownload(item: DownloadItem): DownloadTask {
    const taskId = Date.now().toString();
    const filename = item.getFilename();
    const filePath = path.join(this.downloadsDir, filename);
    
    const task: DownloadTask = {
      id: taskId,
      url: item.getURL(),
      filePath,
      filename,
      totalLength: item.getTotalBytes(),
      downloadedLength: 0,
      status: 'downloading',
      downloadItem: item,
    };

    this.downloadTasks.set(taskId, task);
    this.mainWindow.webContents.send('download-started', task);

    item.setSavePath(filePath);

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        task.downloadedLength = item.getReceivedBytes();
        task.totalLength = item.getTotalBytes();
        const progress = task.totalLength > 0 ? (task.downloadedLength / task.totalLength) * 100 : 0;
        this.mainWindow.webContents.send('download-progress', {
          id: task.id,
          status: 'progressing',
          progress,
          receivedBytes: task.downloadedLength,
          totalBytes: task.totalLength,
        });
      }
    });

    item.on('done', (event, state) => {
      if (state === 'completed') {
        task.status = 'completed';
        this.mainWindow.webContents.send('download-completed', { id: task.id, filePath });
      } else if (state === 'cancelled') {
        this.cancel(task.id);
      } else {
        task.status = 'error';
        this.mainWindow.webContents.send('download-error', { id: task.id, error: `Download failed: ${state}` });
      }
    });

    return task;
  }

  private startRequestForTask(task: DownloadTask, redirectCount: number = 0): void {
    const { url, filePath } = task;
    let { downloadedLength } = task;

    if (redirectCount >= 5) {
      this.mainWindow.webContents.send('download-error', { id: task.id, error: 'Too many redirects' });
      task.status = 'error';
      return;
    }

    let startByte = 0;
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        startByte = stats.size;
      } catch (e) {
        console.error(`Failed to get file stats for ${filePath}:`, e);
      }
    }
    task.downloadedLength = startByte;

    const headers: http.RequestOptions['headers'] = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };
    if (startByte > 0) {
      headers.Range = `bytes=${startByte}-`;
    }

    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { headers }, (response) => {
      const { statusCode, headers: responseHeaders } = response;

      if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
        const location = responseHeaders.location;
        if (location) {
          task.url = new URL(location, url).toString();
          this.startRequestForTask(task, redirectCount + 1);
        } else {
          this.mainWindow.webContents.send('download-error', { id: task.id, error: 'Redirect location missing' });
          task.status = 'error';
        }
        return;
      }

      if (statusCode !== 200 && statusCode !== 206) {
        this.mainWindow.webContents.send('download-error', { id: task.id, error: `Download failed with status: ${statusCode}` });
        task.status = 'error';
        return;
      }

      const isPartial = statusCode === 206;
      if (startByte > 0 && !isPartial) {
        task.downloadedLength = 0;
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.error(`Failed to delete file ${filePath}:`, e);
          }
        }
      }

      const fileStream = fs.createWriteStream(filePath, { flags: isPartial ? 'a' : 'w' });
      response.pipe(fileStream);

      let totalLength = task.totalLength;
      const contentLength = responseHeaders['content-length'];
      if (contentLength) {
        totalLength = parseInt(contentLength, 10);
      } else {
        const contentRange = responseHeaders['content-range'];
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)/);
          if (match) {
            totalLength = parseInt(match[1], 10);
          }
        }
      }
      task.totalLength = totalLength;
      task.request = request;
      task.fileStream = fileStream;
      task.status = 'downloading';

      response.on('data', (chunk) => {
        if (task.status !== 'downloading') return;
        task.downloadedLength += chunk.length;
        const progress = totalLength > 0 ? (task.downloadedLength / totalLength) * 100 : 0;
        if (this.mainWindow && this.mainWindow.webContents) {
          this.mainWindow.webContents.send('download-progress', {
            id: task.id,
            status: 'progressing',
            progress,
            receivedBytes: task.downloadedLength,
            totalBytes: totalLength,
          });
        }
      });

      fileStream.on('finish', () => {
        if (task.status === 'downloading' && task.downloadedLength >= totalLength) {
          task.status = 'completed';
          this.mainWindow.webContents.send('download-completed', { id: task.id, filePath });
        }
      });

      fileStream.on('error', (err) => {
        if (task.status === 'paused' || task.status === 'cancelled') return;
        task.status = 'interrupted';
        this.mainWindow.webContents.send('download-interrupted', { id: task.id, error: err.message });
      });
    });

    request.on('error', (err) => {
      console.error(`下载请求失败: ${url}`, err);
      if (task.status === 'paused' || task.status === 'cancelled') return;
      task.status = 'error';
      this.mainWindow.webContents.send('download-error', { id: task.id, error: err.message });
    });

    task.request = request;
  }

  public createTask(downloadUrl: string, filename: string): DownloadTask {
    const taskId = Date.now().toString();
    const filePath = path.join(this.downloadsDir, filename);

    const task: DownloadTask = {
      id: taskId,
      url: downloadUrl,
      filePath,
      filename,
      totalLength: 0,
      downloadedLength: 0,
      status: 'downloading',
    };

    this.downloadTasks.set(taskId, task);
    this.mainWindow.webContents.send('download-started', task);
    return task;
  }

  public start(downloadUrl: string, filename: string): string {
    const task = this.createTask(downloadUrl, filename);
    this.startRequestForTask(task);
    return task.id;
  }

  public pause(taskId: string): void {
    const task = this.downloadTasks.get(taskId);
    if (task && task.status === 'downloading') {
      if (task.downloadItem) {
        task.downloadItem.pause();
        task.status = 'paused';
      } else if (task.request && !task.request.destroyed) {
        task.status = 'paused';
        task.request.destroy();
        if (task.fileStream) {
          try { task.fileStream.close(); } catch (e) {}
        }
      }
    }
  }

  public resume(taskId: string): void {
    const task = this.downloadTasks.get(taskId);
    if (task && task.status === 'paused') {
      if (task.downloadItem) {
        task.downloadItem.resume();
        task.status = 'downloading';
      } else {
        task.status = 'downloading';
        this.startRequestForTask(task);
      }
    }
  }

  public cancel(taskId: string): void {
    const task = this.downloadTasks.get(taskId);
    if (task) {
      if (task.downloadItem) {
        task.downloadItem.cancel();
      }
      task.status = 'cancelled';
      if (task.request) {
        task.request.destroy();
      }
      if (task.fileStream) {
        task.fileStream.close(() => {
          if (fs.existsSync(task.filePath)) {
            fs.unlink(task.filePath, (err) => {
              if (err) {
                console.error(`Failed to delete cancelled download file: ${task.filePath}`, err);
              }
            });
          }
        });
      } else if (fs.existsSync(task.filePath)) {
        fs.unlink(task.filePath, () => {});
      }
      this.downloadTasks.delete(taskId);
      this.mainWindow.webContents.send('download-cancelled', taskId);
    }
  }

  public getTask(taskId: string): DownloadTask | undefined {
    return this.downloadTasks.get(taskId);
  }

  public retry(taskId: string): void {
    const oldTask = this.downloadTasks.get(taskId);
    if (oldTask && (oldTask.status === 'interrupted' || oldTask.status === 'error')) {
      const { url, filename } = oldTask;
      
      // 先从任务列表中移除旧任务
      this.downloadTasks.delete(taskId);
      this.mainWindow.webContents.send('download-cancelled', taskId);

      // 延迟一小段时间再开始新的下载，以确保UI有时间移除旧项
      setTimeout(() => {
        this.start(url, filename);
      }, 100);
    }
  }
}
