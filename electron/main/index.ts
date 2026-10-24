import { app, BrowserWindow } from 'electron';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppSettings } from '@dreamer/shared/models/settings';
import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { AppDataManager } from './app/app-data-manager';
import { AppDataSession } from './app/app-data-session';
import { resolveAppDataRoot } from './app/dialogs/app-data-dialog';
import { installErrorHandlers, reportLogsNotWritable, reportStartupFailure } from './app/error-handlers';
import { showFatalError } from './app/dialogs/fatal-dialog';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { createWindow, focusWindow } from './app/window';
import { pingBackend, startBackend, stopBackend } from './backend/backend-process';
import { getBackendStatus } from './backend/backend-status';
import { setLanguage } from './app/app-i18n';
import { registerAppIpc } from './ipc/app-ipc';
import { registerBackendIpc } from './ipc/backend-ipc';
import { registerDevIpc } from './ipc/dev-ipc';
import { registerDiagnosticsIpc } from './ipc/diagnostics-ipc';
import { registerLibraryIpc } from './ipc/library-ipc';
import { registerLogIpc } from './ipc/log-ipc';
import { registerPipelineIpc } from './ipc/pipeline-ipc';
import { registerSettingsIpc } from './ipc/settings-ipc';
import { createLogger, Logger } from './logging/logger';
import { registerBuiltInChecks } from './features/diagnostics/built-in-checks';
import { CheckContext } from './features/diagnostics/self-check';
import { SelfCheckEngine } from './features/diagnostics/self-check-engine';
import { registerLibraryChecks } from './features/library/library-checks';
import { handleLibraryProtocol } from './features/library/library-protocol';
import { novelExportPipeline } from './features/library/novel/novel-export-pipeline';
import { novelImportPipeline } from './features/library/novel/novel-import-pipeline';
import { demoPipeline } from './features/pipelines/demo-pipeline';
import { PipelineRegistry } from './features/pipelines/pipeline-registry';
import { SettingsLoadResult, SettingsStore } from './features/settings/settings-store';
import { checkDatabase } from '@storage/database';
import { devFailMigration, loadMigrations, Migration } from '@storage/migrator';
import { AppPaths, defaultAppDataRoot, migrationsDir, settingsFilePath } from '@storage/paths';

const logger: Logger = createLogger('startup');
const settings: SettingsStore = new SettingsStore(settingsFilePath(), defaultAppDataRoot());
const settingsLoad: SettingsLoadResult = settings.load();
setLanguage(settings.get().language);
settings.onChange((value: AppSettings): void => setLanguage(value.language));
let mainWindow: BrowserWindow | null = null;

const backendPingTimeoutMs: number = 3000;
const migrationCodes: ErrorCode[] = [ErrorCode.DbMigrationFailed, ErrorCode.DbNewerVersion];

function startupFailure(error: unknown): { code: ErrorCode; note?: string } {
  if (error instanceof CodedError) {
    return { code: error.code, note: migrationCodes.includes(error.code) ? error.details : undefined };
  }
  return { code: ErrorCode.DbMigrationFailed };
}

function appMigrations(): Migration[] {
  const migrations: Migration[] = loadMigrations(migrationsDir());
  if (!app.isPackaged && process.env.DREAMER_DEV_FAIL_MIGRATION === '1') {
    migrations.push(devFailMigration);
  }
  return migrations;
}

async function showDataFailure(error: unknown, paths: AppPaths): Promise<void> {
  logger.error('database startup failed', error);
  const { code, note } = startupFailure(error);
  await showFatalError(code, paths.database, paths, note);
}

const manager: AppDataManager = new AppDataManager(settings, {
  migrations: appMigrations,
  registry: new PipelineRegistry(
    app.isPackaged
      ? [novelImportPipeline, novelExportPipeline]
      : [demoPipeline, novelImportPipeline, novelExportPipeline],
  ),
  limit: (): number => settings.get().pipelines.maxConcurrent,
  startBackend,
  stopBackend,
  onReopenFailed: showDataFailure,
});
settings.onChange((): void => manager.current()?.executor.limitChanged());

const diagnostics: SelfCheckEngine = new SelfCheckEngine((): CheckContext => {
  const session: AppDataSession = manager.session();
  return {
    paths: session.paths,
    checkDatabase: (): CheckOutcome => checkDatabase(session.db),
    settings: settingsLoad,
    backend: getBackendStatus().state,
    pingBackend: (): Promise<boolean> => pingBackend(backendPingTimeoutMs),
  };
});

function onBeforeQuit(): void {
  manager.current()?.executor.cancelAll('appClosed');
  stopBackend();
}

function onWillQuit(): void {
  manager.close();
}

function logSettingsNotice(): void {
  if (settingsLoad.notice === 'none') return;
  const detail: string =
    settingsLoad.notice === 'unreadable'
      ? `settings.json unreadable, defaults used; invalid content is kept as ${manager.paths().settingsFile}.bak`
      : `settings.json invalid fields reset to defaults: ${settingsLoad.invalid.join(', ')}`;
  logger.warn(`settings ${settingsLoad.notice}: ${detail}`);
}

async function openAppData(root: string): Promise<AppDataSession | null> {
  try {
    return manager.open(root);
  } catch (error) {
    if (!(error instanceof CodedError)) {
      reportStartupFailure(error);
    } else if (error.code === ErrorCode.AppDataUnwritable) {
      console.error(error);
      await showFatalError(error.code, error.details ?? root, manager.paths());
    } else {
      await showDataFailure(error, manager.paths());
    }
    return null;
  }
}

async function onReady(): Promise<void> {
  const root: string | null = await resolveAppDataRoot(settings, defaultAppDataRoot());
  if (root === null) {
    app.exit(0);
    return;
  }
  const session: AppDataSession | null = await openAppData(root);
  if (!session) {
    return;
  }
  if (!session.logsWritable) {
    reportLogsNotWritable(session.paths.logs);
  }
  logSettingsNotice();
  installErrorHandlers(() => manager.paths());
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  registerAppIpc(manager);
  registerPipelineIpc(() => manager.session().executor);
  registerLibraryIpc(() => manager.session());
  registerSettingsIpc(settings);
  registerBackendIpc();
  registerBuiltInChecks(diagnostics);
  registerLibraryChecks(diagnostics);
  registerDiagnosticsIpc(diagnostics);
  registerLogIpc();
  registerDevIpc();
  handleAppProtocol();
  handleLibraryProtocol(() => manager.session());
  mainWindow = createWindow(settings.get().theme);
  void startBackend(manager.paths());
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
  app.on('will-quit', onWillQuit);
  app.on('before-quit', onBeforeQuit);
  app.on('window-all-closed', () => app.quit());
}

if (app.requestSingleInstanceLock()) {
  startApp();
} else {
  app.quit();
}
