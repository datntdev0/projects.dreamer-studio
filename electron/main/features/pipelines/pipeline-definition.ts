import { PipelineStepDetail, PipelineType } from '@dreamer/shared/models/pipeline';
import { Logger } from '../../logging/logger';
import { AppPaths } from '@storage/paths';

export interface StepContext {
  runId: string;
  paths: AppPaths;
  params: Record<string, unknown>;
  signal: AbortSignal;
  progress(percent: number): void;
  enterStep(key: string, detail: PipelineStepDetail | null): void;
  log: Logger;
  checkpoint(): void;
  setNovelId(id: string): void;
}

export interface PipelineStep {
  key: string;
  backend: boolean;
  run?(ctx: StepContext): Promise<void>;
}

export interface PipelineDefinition {
  type: PipelineType;
  steps: PipelineStep[];
  overallProgress?: boolean;
  cleanup?(ctx: StepContext): Promise<void>;
  discard?(params: Record<string, unknown>): void;
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function settleAll(tasks: Promise<void>[]): Promise<void> {
  const results: PromiseSettledResult<void>[] = await Promise.allSettled(tasks);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
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
