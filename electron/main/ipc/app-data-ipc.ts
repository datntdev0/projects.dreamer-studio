import { BrowserWindow } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppDataChannel } from '@dreamer/shared/ipc/channels';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { isAbsolutePath } from '@dreamer/shared/models/settings';
import { AppDataManager } from '../app-data/app-data-manager';
import { pickFolder } from '../app/app-data-dialog';
import { AppPaths } from '../storage/paths';
import { broadcast } from './broadcast';
import { handle } from './handle';

function requirePath(channel: string, payload: unknown): string {
  if (!isAbsolutePath(payload)) {
    throw new Error(`Invalid ${channel} payload`);
  }
  return payload;
}

export function registerAppDataIpc(manager: AppDataManager): void {
  handle(AppDataChannel.PickFolder, (event): Promise<string | null> =>
    pickFolder(BrowserWindow.fromWebContents(event.sender), manager.paths().root),
  );
  handle(AppDataChannel.Inspect, (_event, payload: unknown): AppDataCandidate =>
    manager.inspect(requirePath(AppDataChannel.Inspect, payload)),
  );
  handle(AppDataChannel.Switch, async (_event, payload: unknown): Promise<AppInfo> => {
    const paths: AppPaths = await manager.switchTo(requirePath(AppDataChannel.Switch, payload), (step: AppDataStep) =>
      broadcast(AppDataChannel.Progress, step),
    );
    const info: AppInfo = { version: APP_VERSION, appDataDir: paths.root };
    broadcast(AppDataChannel.Changed, info);
    return info;
  });
  handle(AppDataChannel.Status, (): AppDataStatus => manager.status());
}
