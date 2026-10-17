import { app } from 'electron';
import { installErrorHandlers, reportLogsNotWritable, reportStartupFailure } from './app/error-handlers';
import { registerAppIpc } from './ipc/app-ipc';
import { registerDevIpc } from './ipc/dev-ipc';
import { registerLogIpc } from './ipc/log-ipc';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { logStartupInfo } from './app/sqlite-spike';
import { createWindow } from './app/window';
import { startBackend, stopBackend } from './backend/backend-process';
import { initLogging } from './logging/logger';
import { logsDir } from './storage/paths';

registerAppScheme();

try {
  if (!initLogging(logsDir())) {
    reportLogsNotWritable(logsDir());
  }
  installErrorHandlers();
} catch (error) {
  reportStartupFailure(error);
}

void app.whenReady().then(() => {
  logStartupInfo();
  registerAppIpc();
  registerLogIpc();
  registerDevIpc();
  handleAppProtocol();
  createWindow();
  void startBackend();
});

app.on('before-quit', stopBackend);
app.on('window-all-closed', () => app.quit());
