import { PipelineType } from '@dreamer/shared/models/pipeline';
import { Logger } from '../../logging/logger';
import { AppPaths } from '@storage/paths';

export interface StepContext {
  runId: string;
  paths: AppPaths;
  params: Record<string, unknown>;
  signal: AbortSignal;
  progress(percent: number): void;
  log: Logger;
  checkpoint(): void;
  setNovelId(id: string): void;
}

export interface PipelineStep {
  key: string;
  backend: boolean;
  run(ctx: StepContext): Promise<void>;
}

export interface PipelineDefinition {
  type: PipelineType;
  steps: PipelineStep[];
  cleanup?(ctx: StepContext): Promise<void>;
  discard?(params: Record<string, unknown>): void;
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer: NodeJS.Timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
