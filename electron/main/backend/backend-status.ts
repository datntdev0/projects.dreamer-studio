import { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { broadcast } from '../ipc/broadcast';

let currentState: BackendState = 'starting';
let currentAddress: string | null = null;

export function setBackendState(state: BackendState, address: string | null = null): void {
  if (state === currentState && address === currentAddress) {
    return;
  }
  currentState = state;
  currentAddress = address;
  broadcast(BackendChannel.Status, getBackendStatus());
}

export function getBackendStatus(): BackendStatus {
  return { state: currentState, address: currentAddress };
}
