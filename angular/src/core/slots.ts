import { InjectionToken, type Signal, signal } from '@angular/core';

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PipelineRunView {
  id: string;
  name: string;
  status: PipelineRunStatus;
  progress: number;
  step: number;
  steps: number;
  startedAt: string;
  seconds: number;
}

export interface PipelineSlot {
  state: 'loading' | 'ready' | 'error';
  runs: PipelineRunView[];
  error?: string;
}

function emptySlot(): Signal<PipelineSlot> {
  return signal<PipelineSlot>({ state: 'ready', runs: [] }).asReadonly();
}

export const ACTIVE_PIPELINES = new InjectionToken<Signal<PipelineSlot>>('ACTIVE_PIPELINES', { factory: emptySlot });
export const RECENT_PIPELINES = new InjectionToken<Signal<PipelineSlot>>('RECENT_PIPELINES', { factory: emptySlot });

export function formatRunStep(run: PipelineRunView): string {
  return `${run.progress}% · Step ${run.step} of ${run.steps}`;
}
