import { BrowserWindow, shell } from 'electron';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel, AppDataChannel } from '@dreamer/shared/ipc/channels';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { isAbsolutePath } from '@dreamer/shared/models/settings';
import { AppDataManager } from '../app/app-data-manager';
import { pickFolder } from '../app/dialogs/app-data-dialog';
import { createLogger, Logger } from '../logging/logger';
import { AppPaths } from '../storage/paths';
import { broadcast } from './broadcast';
import { handle } from './handle';

const logger: Logger = createLogger('app');

async function tryOpenFolder(folder: string): Promise<string> {
  const failure: string = await shell.openPath(folder);
  if (failure) {
    logger.error(`Cannot open folder ${folder}: ${failure}`);
  }
  return failure;
}

export async function openFolder(folder: string): Promise<void> {
  await tryOpenFolder(folder);
}

async function openFolderOrThrow(folder: string): Promise<void> {
  const failure: string = await tryOpenFolder(folder);
  if (failure) {
    throw new Error(`Cannot open folder ${folder}: ${failure}`);
  }
}

function requirePath(channel: string, payload: unknown): string {
  if (!isAbsolutePath(payload)) {
    throw new Error(`Invalid ${channel} payload`);
  }
  return payload;
}

function appInfo(paths: AppPaths): AppInfo {
  return { version: APP_VERSION, appDataDir: paths.root };
}

export function registerAppIpc(manager: AppDataManager): void {
  handle(AppChannel.Info, (): AppInfo => appInfo(manager.paths()));
  handle(AppChannel.OpenLogs, (): Promise<void> => openFolder(manager.paths().logs));
  handle(AppChannel.OpenDataDir, (): Promise<void> => openFolderOrThrow(manager.paths().root));
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
    const info: AppInfo = appInfo(paths);
    broadcast(AppDataChannel.Changed, info);
    return info;
  });
  handle(AppDataChannel.Status, (): AppDataStatus => manager.status());
}
