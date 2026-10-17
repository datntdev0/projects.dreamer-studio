import { app, ipcMain } from 'electron';
import { DevChannel } from '@dreamer/shared/ipc/channels';
import { DevCrashKind } from '@dreamer/shared/ipc/dev';

export function registerDevIpc(): void {
  if (app.isPackaged) {
    return;
  }
  ipcMain.handle(DevChannel.Crash, (event, kind: DevCrashKind): void => {
    switch (kind) {
      case 'main-exception':
        setTimeout(() => {
          throw new Error('dev:crash main-exception');
        }, 0);
        break;
      case 'main-rejection':
        void Promise.reject(new Error('dev:crash main-rejection'));
        break;
      case 'renderer-gone':
        event.sender.forcefullyCrashRenderer();
        break;
    }
  });
}
