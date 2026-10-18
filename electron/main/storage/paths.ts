import { app } from 'electron';
import { join } from 'node:path';

export interface AppPaths {
  settingsFile: string;
  root: string;
  database: string;
  databaseBackup: string;
  library: string;
  logs: string;
  pipelineLogs: string;
  cache: string;
}

export function defaultAppDataRoot(): string {
  return join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'DreamerStudio');
}

export function resolveAppPaths(root: string): AppPaths {
  const logs: string = join(root, 'logs');
  return {
    settingsFile: join(defaultAppDataRoot(), 'settings.json'),
    root,
    database: join(root, 'database.sqlite'),
    databaseBackup: join(root, 'database.backup.sqlite'),
    library: join(root, 'library'),
    logs,
    pipelineLogs: join(logs, 'pipelines'),
    cache: join(root, 'cache'),
  };
}

export function migrationsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'main', 'storage', 'migrations');
}
