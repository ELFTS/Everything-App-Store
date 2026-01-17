export interface DownloadTask {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
  totalLength: number;
  downloadedLength: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';
}
