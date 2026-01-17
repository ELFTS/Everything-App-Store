export interface AppSettings {
  useLightTheme: boolean;
  showDownloadNotification: boolean;
  playDownloadSound: boolean;
  autoLaunch: boolean;
  autoCheckUpdates: boolean;
  [key: string]: boolean;
}
