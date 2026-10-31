import { IpcController } from './ipc-controller';
import { BrowserWindow, shell } from 'electron';
import { arch, release, type } from 'node:os';
import { AppInfo } from '@dreamer/shared/ipc/app';
import { AppChannel, AppDataChannel } from '@dreamer/shared/ipc/channels';
import { ABOUT_LINKS, isAboutLink } from '@dreamer/shared/models/about';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { isAbsolutePath } from '@dreamer/shared/models/settings';
import { AppDataManager } from '../app/app-data-manager';
import { AppDataSession } from '../app/app-data-session';
import { pickFolder } from '../app/dialogs/app-data-dialog';
import { createLogger, Logger } from '../logging/logger';
import { readSchemaVersion } from '@storage/migrator';
import { defaultAppDataRoot } from '@storage/paths';
import { Broadcaster } from './broadcast-provider';
import { handle } from './handle';

const logger: Logger = createLogger('app');
const osName: string = process.platform === 'win32' ? 'Windows' : type();

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

function appInfo(manager: AppDataManager): AppInfo {
  const session: AppDataSession | null = manager.current();
  return {
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    author: APP_AUTHOR,
    appDataDir: manager.paths().root,
    settingsDir: defaultAppDataRoot(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    os: `${osName} ${release()} (${arch()})`,
    schemaVersion: session ? readSchemaVersion(session.db) : null,
  };
}

function requireLink(payload: unknown): string {
  if (!isAboutLink(payload)) {
    throw new Error(`Invalid ${AppChannel.OpenLink} payload`);
  }
  return ABOUT_LINKS[payload];
}

export class AppController implements IpcController {
  constructor(
    private readonly manager: AppDataManager,
    private readonly broadcaster: Broadcaster,
  ) {}

  register(): void {
    handle(AppChannel.Info, (): AppInfo => appInfo(this.manager));
    handle(AppChannel.OpenLogs, (): Promise<void> => openFolder(this.manager.paths().logs));
    handle(AppChannel.OpenDataDir, (): Promise<void> => openFolderOrThrow(this.manager.paths().root));
    handle(AppChannel.OpenLink, (_event, payload: unknown): Promise<void> => shell.openExternal(requireLink(payload)));
    handle(AppDataChannel.PickFolder, (event): Promise<string | null> =>
      pickFolder(BrowserWindow.fromWebContents(event.sender), this.manager.paths().root),
    );
    handle(AppDataChannel.Inspect, (_event, payload: unknown): AppDataCandidate =>
      this.manager.inspect(requirePath(AppDataChannel.Inspect, payload)),
    );
    handle(AppDataChannel.Switch, async (_event, payload: unknown): Promise<AppInfo> => {
      await this.manager.switchTo(requirePath(AppDataChannel.Switch, payload), (step: AppDataStep) =>
        this.broadcaster.send(AppDataChannel.Progress, step),
      );
      const info: AppInfo = appInfo(this.manager);
      this.broadcaster.send(AppDataChannel.Changed, info);
      return info;
    });
    handle(AppDataChannel.Status, (): AppDataStatus => this.manager.status());
  }
}
