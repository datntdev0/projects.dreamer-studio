import { ipcMain } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel } from '@dreamer/shared/ipc/channels';

export function registerAppIpc(): void {
  ipcMain.handle(AppChannel.Info, (): AppInfo => ({ version: APP_VERSION }));
}
