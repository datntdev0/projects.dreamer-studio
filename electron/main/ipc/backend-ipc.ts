import { ipcMain } from 'electron';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { getBackendStatus } from '../backend/backend-status';

export function registerBackendIpc(): void {
  ipcMain.handle(BackendChannel.GetStatus, (): BackendStatus => getBackendStatus());
}
