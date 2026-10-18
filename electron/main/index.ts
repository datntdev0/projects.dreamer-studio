import { app } from 'electron';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { installErrorHandlers, reportLogsNotWritable, reportStartupFailure } from './app/error-handlers';
import { registerAppIpc } from './ipc/app-ipc';
import { registerDevIpc } from './ipc/dev-ipc';
import { registerLogIpc } from './ipc/log-ipc';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { createWindow } from './app/window';
import { showFatalError } from './app/fatal-dialog';
import { startBackend, stopBackend } from './backend/backend-process';
import { createLogger, initLogging, Logger } from './logging/logger';
import { Database } from './storage/database';
import { AppPaths, defaultAppDataRoot, resolveAppPaths } from './storage/paths';

const logger: Logger = createLogger('startup');
const paths: AppPaths = resolveAppPaths(defaultAppDataRoot());
let db: Database | null = null;

registerAppScheme();

try {
  if (!initLogging(paths.logs)) {
    reportLogsNotWritable(paths.logs);
  }
  installErrorHandlers(paths);
} catch (error) {
  reportStartupFailure(error);
}

async function onReady(): Promise<void> {
  logger.info(`app ${APP_VERSION}, electron ${process.versions.electron}`);
  try {
    db = Database.open(paths.database);
  } catch (error) {
    logger.error('database open failed', error);
    await showFatalError(ErrorCode.DbOpenFailed, paths.database, paths);
    return;
  }
  registerAppIpc(paths);
  registerLogIpc();
  registerDevIpc();
  handleAppProtocol();
  createWindow();
  void startBackend(paths);
}

void app.whenReady().then(onReady);

app.on('will-quit', () => db?.close());
app.on('before-quit', stopBackend);
app.on('window-all-closed', () => app.quit());
