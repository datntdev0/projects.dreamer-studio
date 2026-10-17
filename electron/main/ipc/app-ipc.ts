import { ipcMain, shell } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel } from '@dreamer/shared/ipc/channels';
import { createLogger, Logger } from '../logging/logger';
import { logsDir } from '../storage/paths';

const logger: Logger = createLogger('app');

export async function openLogsFolder(): Promise<void> {
  const failure: string = await shell.openPath(logsDir());
  if (failure) {
    logger.error(`Cannot open the logs folder: ${failure}`);
  }
}

export function registerAppIpc(): void {
  ipcMain.handle(AppChannel.Info, (): AppInfo => ({ version: APP_VERSION }));
  ipcMain.handle(AppChannel.OpenLogs, (): Promise<void> => openLogsFolder());
}
