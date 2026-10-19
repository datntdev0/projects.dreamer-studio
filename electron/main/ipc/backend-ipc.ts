import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { getBackendStatus } from '../backend/backend-status';
import { handle } from './handle';

export function registerBackendIpc(): void {
  handle(BackendChannel.GetStatus, (): BackendStatus => getBackendStatus());
}
