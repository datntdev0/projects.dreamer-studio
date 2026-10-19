import { InjectionToken, type Signal, signal } from '@angular/core';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import type { I18nService } from './i18n/i18n.service';

export interface PipelineSlot {
  state: 'loading' | 'ready' | 'error';
  runs: PipelineRun[];
  error?: string;
}

function emptySlot(): Signal<PipelineSlot> {
  return signal<PipelineSlot>({ state: 'ready', runs: [] }).asReadonly();
}

export const ACTIVE_PIPELINES = new InjectionToken<Signal<PipelineSlot>>('ACTIVE_PIPELINES', { factory: emptySlot });
export const RECENT_PIPELINES = new InjectionToken<Signal<PipelineSlot>>('RECENT_PIPELINES', { factory: emptySlot });

export function formatRunStep(run: PipelineRun, i18n: I18nService): string {
  return i18n.t('run.step', { progress: run.progress, step: run.stepIndex, steps: run.stepCount });
}
