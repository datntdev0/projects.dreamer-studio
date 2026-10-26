import { isAppError, type ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { shortId } from '@core/format';
import type { I18nService } from '@core/i18n/i18n.service';

export interface RunStatusView {
  label: string;
  icon: string | null;
}

export const RUN_STATUS_VIEWS: Record<PipelineRunStatus, RunStatusView> = {
  queued: { label: 'run.queued', icon: 'clock' },
  running: { label: 'run.running', icon: null },
  succeeded: { label: 'run.succeeded', icon: 'check' },
  failed: { label: 'run.failed', icon: 'alert-circle' },
  cancelled: { label: 'run.cancelled', icon: 'stop' },
};

export function isActiveRun(run: PipelineRun): boolean {
  return run.status === 'running' || run.status === 'queued';
}

export function runName(run: PipelineRun, i18n: I18nService): string {
  return i18n.t('run.name', { type: i18n.t(`run.type.${run.type}`), short: shortId(run.id) });
}

export function runStepName(run: PipelineRun, i18n: I18nService): string {
  if (!run.stepName) return '';
  const detail: string = runStepDetail(run, i18n);
  return detail ? `${i18n.t(run.stepName)} · ${detail}` : i18n.t(run.stepName);
}

export function runStepDetail(run: PipelineRun, i18n: I18nService): string {
  return run.stepDetail ? i18n.t(run.stepDetail.key, run.stepDetail.params) : '';
}

function errorTitle(code: ErrorCode | null | undefined, fallback: string, i18n: I18nService): string {
  const key = `errors.${code}.title`;
  return code && i18n.has(key) ? i18n.t(key) : fallback;
}

export function runError(run: PipelineRun, i18n: I18nService): string {
  return errorTitle(run.errorCode, run.error ?? '', i18n);
}

export function errorText(error: unknown, i18n: I18nService): string {
  return errorTitle(isAppError(error) ? error.code : undefined, errorMessage(error), i18n);
}

export function runCancelReason(run: PipelineRun, i18n: I18nService): string {
  return i18n.t(run.cancelReason === 'appClosed' ? 'run.cancel.appClosed' : 'run.cancel.user');
}

export function runResult(run: PipelineRun, i18n: I18nService): string {
  if (run.status === 'succeeded') {
    return i18n.t('pipelines.result.steps', { done: run.stepCount, steps: run.stepCount });
  }
  const detail: string | null =
    run.status === 'failed' ? runError(run, i18n) : run.status === 'cancelled' ? runCancelReason(run, i18n) : null;
  if (detail === null) return '';
  if (run.stepIndex === 0) return detail;
  return `${i18n.t('pipelines.reason.step', { step: run.stepIndex })} · ${detail}`;
}

export function runSeconds(run: PipelineRun, now: number = Date.now()): number {
  if (!run.startedAt) return 0;
  const end: number = run.finishedAt ? Date.parse(run.finishedAt) : now;
  return Math.max(0, Math.round((end - Date.parse(run.startedAt)) / 1000));
}

export type StepState = 'done' | 'running' | 'failed' | 'cancelled' | 'pending';

export const STEP_STATE_VIEWS: Record<StepState, { icon: string; label: string }> = {
  done: { icon: 'check', label: 'run.stepState.done' },
  running: { icon: 'play', label: 'run.running' },
  failed: { icon: 'alert-circle', label: 'run.failed' },
  cancelled: { icon: 'stop', label: 'run.cancelled' },
  pending: { icon: 'minus', label: 'run.stepState.pending' },
};

export function stepState(run: PipelineRun, index: number): StepState {
  if (run.status === 'succeeded' || index < run.stepIndex) return 'done';
  if (index > run.stepIndex || run.status === 'queued') return 'pending';
  if (run.status === 'running') return 'running';
  return run.status === 'failed' ? 'failed' : 'cancelled';
}
