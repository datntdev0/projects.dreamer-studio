import { app } from 'electron';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppPaths, defaultAppDataRoot } from '@storage/paths';
import { AppDataSession } from './app/app-data-session';
import { AppRoot } from './app/app-root';
import { resolveAppDataRoot } from './app/dialogs/app-data-dialog';
import { showFatalError } from './app/dialogs/fatal-dialog';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { handleLibraryProtocol } from './features/library/library-protocol';
import { IpcController } from './ipc/ipc-controller';
import { createLogger, Logger } from './logging/logger';

const logger: Logger = createLogger('startup');
const migrationCodes: ErrorCode[] = [ErrorCode.DbMigrationFailed, ErrorCode.DbNewerVersion];

function startupFailure(error: unknown): { code: ErrorCode; note?: string } {
  if (error instanceof CodedError) {
    return { code: error.code, note: migrationCodes.includes(error.code) ? error.details : undefined };
  }
  return { code: ErrorCode.DbMigrationFailed };
}

async function showDataFailure(error: unknown, paths: AppPaths): Promise<void> {
  logger.error('database startup failed', error);
  const { code, note } = startupFailure(error);
  await showFatalError(code, paths.database, paths, note);
}

const root: AppRoot = new AppRoot(showDataFailure);

function logSettingsNotice(): void {
  const { notice, invalid } = root.settingsLoad;
  if (notice === 'none') return;
  const detail: string =
    notice === 'unreadable'
      ? `settings.json unreadable, defaults used; invalid content is kept as ${root.manager.paths().settingsFile}.bak`
      : `settings.json invalid fields reset to defaults: ${invalid.join(', ')}`;
  logger.warn(`settings ${notice}: ${detail}`);
}

async function openAppData(path: string): Promise<AppDataSession | null> {
  try {
    return root.manager.open(path);
  } catch (error) {
    if (!(error instanceof CodedError)) {
      root.errors.reportStartupFailure(error);
    } else if (error.code === ErrorCode.AppDataUnwritable) {
      console.error(error);
      await showFatalError(error.code, error.details ?? path, root.manager.paths());
    } else {
      await showDataFailure(error, root.manager.paths());
    }
    return null;
  }
}

async function onReady(): Promise<void> {
  const dataRoot: string | null = await resolveAppDataRoot(root.settings, defaultAppDataRoot());
  if (dataRoot === null) {
    app.exit(0);
    return;
  }
  const session: AppDataSession | null = await openAppData(dataRoot);
  if (!session) {
    return;
  }
  if (!session.logsWritable) {
    root.errors.reportLogsNotWritable(session.paths.logs);
  }
  logSettingsNotice();
  root.errors.install((): AppPaths => root.manager.paths());
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  root.controllers().forEach((controller: IpcController): void => controller.register());
  handleAppProtocol();
  handleLibraryProtocol((): AppDataSession => root.manager.session());
  root.window.create(root.settings.get().theme).on('closed', (): void => root.llm.abortTests());
  root.llm.startDetection();
  void root.backend.start(root.manager.paths());
}

function startApp(): void {
  registerAppScheme();
  void app.whenReady().then(onReady);
  app.on('second-instance', (): void => root.window.focus());
  app.on('will-quit', (): void => root.manager.close());
  app.on('before-quit', (): void => root.dispose());
  app.on('window-all-closed', (): void => app.quit());
}

if (app.requestSingleInstanceLock()) {
  startApp();
} else {
  app.quit();
}
