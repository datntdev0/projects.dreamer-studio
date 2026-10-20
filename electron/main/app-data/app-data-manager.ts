import { existsSync } from 'node:fs';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppDataCandidate, AppDataStatus, AppDataStep } from '@dreamer/shared/models/app-data';
import { SettingsStore } from '../settings/settings-store';
import { freeBytes, isSameFolder, probeWritable, readHistoryRows } from '../storage/folder-probe';
import { AppDataSchemaInfo, classifyHistory, readSchemaVersion } from '../storage/migrator';
import { AppPaths, resolveAppPaths } from '../storage/paths';
import { createLogger, Logger } from '../logging/logger';
import { AppDataSession, AppDataSessionDeps } from './app-data-session';

const logger: Logger = createLogger('app-data');

export interface AppDataManagerDeps extends AppDataSessionDeps {
  startBackend: (paths: AppPaths) => Promise<void>;
  stopBackend: () => void;
  onReopenFailed: (error: unknown, paths: AppPaths) => Promise<void>;
}

export class AppDataManager {
  private active: AppDataSession | null = null;
  private lastPaths: AppPaths | null = null;
  private switching: boolean = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly deps: AppDataManagerDeps,
  ) {}

  open(root: string): AppDataSession {
    this.lastPaths = resolveAppPaths(root);
    this.active = AppDataSession.open(root, this.deps);
    return this.active;
  }

  current(): AppDataSession | null {
    return this.switching ? null : this.active;
  }

  session(): AppDataSession {
    const session: AppDataSession | null = this.current();
    if (!session) {
      throw new CodedError(ErrorCode.AppDataSwitching, 'app data folder is switching or not open');
    }
    return session;
  }

  paths(): AppPaths {
    return this.lastPaths as AppPaths;
  }

  inspect(path: string): AppDataCandidate {
    const info: AppDataSchemaInfo = classifyHistory(
      readHistoryRows(resolveAppPaths(path).database),
      this.deps.migrations(),
    );
    return {
      path,
      writable: this.isWritable(path),
      current: isSameFolder(path, this.paths().root),
      ...info,
    };
  }

  async switchTo(path: string, onStep: (step: AppDataStep) => void): Promise<AppPaths> {
    if (this.switching) {
      throw new CodedError(ErrorCode.AppDataSwitching, 'an app data switch is already running');
    }
    const old: AppDataSession = this.session();
    if (old.executor.hasActive()) {
      throw new CodedError(ErrorCode.AppDataPipelinesActive, 'pipelines are running');
    }
    if (!this.isWritable(path)) {
      throw new CodedError(ErrorCode.AppDataUnwritable, `${path} is missing or not writable`, path);
    }
    if (isSameFolder(path, old.paths.root)) {
      return old.paths;
    }
    this.switching = true;
    try {
      onStep('close');
      this.deps.stopBackend();
      old.close();
      this.active = null;
      return await this.openTarget(path, old.paths, onStep);
    } finally {
      this.switching = false;
    }
  }

  status(): AppDataStatus {
    const session: AppDataSession = this.session();
    const root: string = session.paths.root;
    return {
      path: root,
      freeBytes: freeBytes(root),
      writable: probeWritable(root),
      schemaVersion: readSchemaVersion(session.db),
      checkedAt: new Date().toISOString(),
    };
  }

  close(): void {
    this.active?.close();
  }

  private isWritable(path: string): boolean {
    return existsSync(path) && probeWritable(path);
  }

  private async openTarget(path: string, oldPaths: AppPaths, onStep: (step: AppDataStep) => void): Promise<AppPaths> {
    let next: AppDataSession;
    try {
      next = AppDataSession.open(path, this.deps, onStep);
      if (!next.logsWritable) {
        next.close();
        throw new CodedError(ErrorCode.AppDataUnwritable, `${next.paths.logs} is not writable`, next.paths.logs);
      }
    } catch (error) {
      onStep('rollback');
      await this.reopen(oldPaths);
      logger.error(`app data switch to ${path} failed, reopened ${oldPaths.root}`, error);
      throw error;
    }
    logger.info(`app data switched to ${path}`);
    this.active = next;
    this.lastPaths = next.paths;
    this.settings.setAppDataDir(path);
    onStep('backend');
    await this.deps.startBackend(next.paths);
    return next.paths;
  }

  private async reopen(oldPaths: AppPaths): Promise<void> {
    try {
      this.active = AppDataSession.open(oldPaths.root, this.deps);
    } catch (error) {
      await this.deps.onReopenFailed(error, oldPaths);
    }
    void this.deps.startBackend(oldPaths);
  }
}
