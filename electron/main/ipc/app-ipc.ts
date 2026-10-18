import { ipcMain, shell } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel } from '@dreamer/shared/ipc/channels';
import { createLogger, Logger } from '../logging/logger';
import { AppPaths } from '../storage/paths';

const logger: Logger = createLogger('app');

export async function openFolder(folder: string): Promise<void> {
  const failure: string = await shell.openPath(folder);
  if (failure) {
    logger.error(`Cannot open folder ${folder}: ${failure}`);
  }
}

export function registerAppIpc(paths: AppPaths): void {
  ipcMain.handle(AppChannel.Info, (): AppInfo => ({ version: APP_VERSION }));
  ipcMain.handle(AppChannel.OpenLogs, (): Promise<void> => openFolder(paths.logs));
}
