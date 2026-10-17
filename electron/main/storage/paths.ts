import { app } from 'electron';
import { join } from 'node:path';

export function appDataDir(): string {
  return join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'DreamerStudio');
}

export function logsDir(): string {
  return join(appDataDir(), 'logs');
}
