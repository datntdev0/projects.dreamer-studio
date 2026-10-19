import { app, BrowserWindow } from 'electron';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { installErrorHandlers, reportLogsNotWritable, reportStartupFailure } from './app/error-handlers';
import { registerAppIpc } from './ipc/app-ipc';
import { registerBackendIpc } from './ipc/backend-ipc';
import { registerDevIpc } from './ipc/dev-ipc';
import { registerLogIpc } from './ipc/log-ipc';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { createWindow, focusWindow } from './app/window';
import { showFatalError } from './app/fatal-dialog';
import { startBackend, stopBackend } from './backend/backend-process';
import { createLogger, initLogging, Logger } from './logging/logger';
import { Database } from './storage/database';
import { devFailMigration, loadMigrations, Migration, runMigrations } from './storage/migrator';
import { AppPaths, defaultAppDataRoot, ensureFolders, migrationsDir, resolveAppPaths } from './storage/paths';

const logger: Logger = createLogger('startup');
const paths: AppPaths = resolveAppPaths(defaultAppDataRoot());
let db: Database | null = null;
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

function prepareAppData(): void {
  try {
    ensureFolders(paths);
    if (!initLogging(paths.logs)) {
      reportLogsNotWritable(paths.logs);
    }
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
  if (unwritableFolder) {
    await showFatalError(ErrorCode.AppDataUnwritable, unwritableFolder, paths);
    return;
  }
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  try {
    db = Database.open(paths.database);
    migrateDatabase(db);
  } catch (error) {
    logger.error('database startup failed', error);
    db?.close();
    db = null;
    const { code, note } = startupFailure(error);
    await showFatalError(code, paths.database, paths, note);
    return;
  }
  registerAppIpc(paths);
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
  prepareAppData();
  void app.whenReady().then(onReady);
  app.on('second-instance', onSecondInstance);
  app.on('will-quit', () => db?.close());
  app.on('before-quit', stopBackend);
  app.on('window-all-closed', () => app.quit());
}

if (app.requestSingleInstanceLock()) {
  startApp();
} else {
  app.quit();
}
