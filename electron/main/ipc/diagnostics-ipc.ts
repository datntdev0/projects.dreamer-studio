import { DiagnosticsChannel } from '@dreamer/shared/ipc/channels';
import { DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { SelfCheckEngine } from '../features/diagnostics/self-check-engine';
import { handle } from './handle';

export function registerDiagnosticsIpc(engine: SelfCheckEngine): void {
  handle(DiagnosticsChannel.Run, (): Promise<DiagnosticsRun> => engine.run());
}
