import { IpcController } from './ipc-controller';
import { BackendStatus } from '@dreamer/shared/ipc/backend';
import { BackendChannel } from '@dreamer/shared/ipc/channels';
import { BackendProvider } from '../backend/backend-provider';
import { handle } from './handle';

export class BackendController implements IpcController {
  constructor(private readonly backend: BackendProvider) {}

  register(): void {
    handle(BackendChannel.GetStatus, (): BackendStatus => this.backend.status());
  }
}
