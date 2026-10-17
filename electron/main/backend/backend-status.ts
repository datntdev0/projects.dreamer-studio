import { app, BrowserWindow, WebContents } from 'electron';
import { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';

let currentState: BackendState = 'starting';

function sendStatus(contents: WebContents): void {
  const status: BackendStatus = { state: currentState };
  contents.send(BackendChannel.Status, status);
}

export function setBackendState(state: BackendState): void {
  if (state === currentState) {
    return;
  }
  currentState = state;
  BrowserWindow.getAllWindows().forEach((window: BrowserWindow) => sendStatus(window.webContents));
}

export function watchWindowLoads(): void {
  app.on('web-contents-created', (_event: Electron.Event, contents: WebContents) => {
    contents.on('did-finish-load', () => sendStatus(contents));
  });
  BrowserWindow.getAllWindows().forEach((window: BrowserWindow) => {
    window.webContents.on('did-finish-load', () => sendStatus(window.webContents));
  });
}
