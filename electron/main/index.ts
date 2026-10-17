import { app } from 'electron';
import { registerAppIpc } from './ipc/app-ipc';
import { handleAppProtocol, registerAppScheme } from './app/protocol';
import { logStartupInfo } from './app/sqlite-spike';
import { createWindow } from './app/window';

registerAppScheme();

void app.whenReady().then(() => {
  logStartupInfo();
  registerAppIpc();
  handleAppProtocol();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
