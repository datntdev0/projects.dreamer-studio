import { app, BrowserWindow } from 'electron';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { resolveAppDataRoot } from './app/app-data-dialog';
import { installErrorHandlers, reportLogsNotWritable, reportStartupFailure } from './app/error-handlers';
import { registerAppIpc } from './ipc/app-ipc';
import { registerBackendIpc } from './ipc/backend-ipc';
import { registerDevIpc } from './ipc/dev-ipc';
import { registerLogIpc } from './ipc/log-ipc';
import { registerPipelineIpc } from './ipc/pipeline-ipc';
import { registerSettingsIpc } from './ipc/settings-ipc';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { createWindow, focusWindow } from './app/window';
import { showFatalError } from './app/fatal-dialog';
import { startBackend, stopBackend } from './backend/backend-process';
import { setLanguage } from './i18n/main-i18n';
import { createLogger, initLogging, Logger } from './logging/logger';
import { demoPipeline } from './pipelines/demo-pipeline';
import { PipelineExecutor } from './pipelines/pipeline-executor';
import { PipelineRegistry } from './pipelines/pipeline-registry';
import { SettingsLoadResult, SettingsStore } from './settings/settings-store';
import { Database } from './storage/database';
import { devFailMigration, loadMigrations, Migration, runMigrations } from './storage/migrator';
import { PipelineRunRepository } from './storage/repositories/pipeline-run-repository';
import { AppPaths, defaultAppDataRoot, ensureFolders, migrationsDir, resolveAppPaths } from './storage/paths';
import { settingsFilePath } from './storage/paths';

const logger: Logger = createLogger('startup');
const settings: SettingsStore = new SettingsStore(settingsFilePath(), defaultAppDataRoot());
const settingsLoad: SettingsLoadResult = settings.load();
setLanguage(settings.get().language);
let paths: AppPaths;
let db: Database | null = null;
let executor: PipelineExecutor | null = null;
let mainWindow: BrowserWindow | null = null;
let unwritableFolder: string | null = null;

const migrationCodes: ErrorCode[] = [ErrorCode.DbMigrationFailed, ErrorCode.DbNewerVersion];

function startupFailure(error: unknown): { code: ErrorCode; note?: string } {
  if (error instanceof CodedError) {
    return { code: error.code, note: migrationCodes.includes(error.code) ? error.details : undefined };
  }
  return { code: ErrorCode.DbMigrationFailed };
}

function migrateDatabase(database: Database): void {
  const migrations: Migration[] = loadMigrations(migrationsDir());
  if (!app.isPackaged && process.env.DREAMER_DEV_FAIL_MIGRATION === '1') {
    migrations.push(devFailMigration);
  }
  runMigrations(database, migrations, paths.databaseBackup);
}

function startPipelines(database: Database): void {
  executor = new PipelineExecutor(
    new PipelineRunRepository(database),
    paths,
    new PipelineRegistry(app.isPackaged ? [] : [demoPipeline]),
    () => 1,
  );
  executor.recover();
  registerPipelineIpc(executor);
}

function onBeforeQuit(): void {
  executor?.cancelAll('appClosed');
  stopBackend();
}

function logSettingsNotice(): void {
  if (settingsLoad.notice === 'none') return;
  const detail: string =
    settingsLoad.notice === 'unreadable'
      ? `settings.json unreadable, defaults used; invalid content is kept as ${paths.settingsFile}.bak`
      : `settings.json invalid fields reset to defaults: ${settingsLoad.invalid.join(', ')}`;
  logger.warn(`settings ${settingsLoad.notice}: ${detail}`);
}

function prepareAppData(): void {
  try {
    ensureFolders(paths);
    if (!initLogging(paths.logs)) {
      reportLogsNotWritable(paths.logs);
    }
    logSettingsNotice();
    installErrorHandlers(paths);
  } catch (error) {
    if (error instanceof CodedError && error.code === ErrorCode.AppDataUnwritable) {
      console.error(error);
      unwritableFolder = error.details ?? paths.root;
      return;
    }
    reportStartupFailure(error);
  }
}

async function onReady(): Promise<void> {
  const root: string | null = await resolveAppDataRoot(settings, defaultAppDataRoot());
  if (root === null) {
    app.exit(0);
    return;
  }
  paths = resolveAppPaths(root);
  prepareAppData();
  if (unwritableFolder) {
    await showFatalError(ErrorCode.AppDataUnwritable, unwritableFolder, paths);
    return;
  }
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  try {
    db = Database.open(paths.database);
    migrateDatabase(db);
    startPipelines(db);
  } catch (error) {
    logger.error('database startup failed', error);
    db?.close();
    db = null;
    const { code, note } = startupFailure(error);
    await showFatalError(code, paths.database, paths, note);
    return;
  }
  registerAppIpc(paths);
  registerSettingsIpc(settings);
  registerBackendIpc();
  registerLogIpc();
  registerDevIpc();
  handleAppProtocol();
  mainWindow = createWindow();
  void startBackend(paths);
}

function onSecondInstance(): void {
  if (mainWindow) {
    focusWindow(mainWindow);
  }
}

function startApp(): void {
  registerAppScheme();
  void app.whenReady().then(onReady);
  app.on('second-instance', onSecondInstance);
  app.on('will-quit', () => db?.close());
  app.on('before-quit', onBeforeQuit);
  app.on('window-all-closed', () => app.quit());
}

if (app.requestSingleInstanceLock()) {
  startApp();
} else {
  app.quit();
}
