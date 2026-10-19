import { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { broadcast } from '../ipc/broadcast';

let currentState: BackendState = 'starting';

export function setBackendState(state: BackendState): void {
  if (state === currentState) {
    return;
  }
  currentState = state;
  broadcast(BackendChannel.Status, getBackendStatus());
}

export function getBackendStatus(): BackendStatus {
  return { state: currentState };
}
