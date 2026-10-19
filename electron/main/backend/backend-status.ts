import { BrowserWindow, WebContents } from 'electron';
import { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';

let currentState: BackendState = 'starting';

function sendStatus(contents: WebContents): void {
  contents.send(BackendChannel.Status, getBackendStatus());
}

export function setBackendState(state: BackendState): void {
  if (state === currentState) {
    return;
  }
  currentState = state;
  BrowserWindow.getAllWindows().forEach((window: BrowserWindow) => sendStatus(window.webContents));
}

export function getBackendStatus(): BackendStatus {
  return { state: currentState };
}
