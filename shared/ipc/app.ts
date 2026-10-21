export interface AppInfo {
  version: string;
  buildDate: string | null;
  author: string;
  appDataDir: string;
  electron: string;
  chrome: string;
  node: string;
  os: string;
  schemaVersion: string | null;
}
