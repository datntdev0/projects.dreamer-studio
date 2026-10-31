import { IpcController } from './ipc-controller';
import { DiagnosticsChannel } from '@dreamer/shared/ipc/channels';
import { DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { SelfCheckEngine } from '../features/diagnostics/self-check-engine';
import { handle } from './handle';

export class DiagnosticsController implements IpcController {
  constructor(private readonly engine: SelfCheckEngine) {}

  register(): void {
    handle(DiagnosticsChannel.Run, (): Promise<DiagnosticsRun> => this.engine.run());
  }
}
