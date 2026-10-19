import { isAppError, type ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import type { I18nService } from '../../core/i18n/i18n.service';

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

const SHORT_ID_LENGTH = 8;

export function isActiveRun(run: PipelineRun): boolean {
  return run.status === 'running' || run.status === 'queued';
}

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

export function runName(run: PipelineRun, i18n: I18nService): string {
  return i18n.t('run.name', { type: i18n.t(`run.type.${run.type}`), short: shortId(run.id) });
}

export function runStepName(run: PipelineRun, i18n: I18nService): string {
  return run.stepName ? i18n.t(run.stepName) : '';
}

function errorTitle(code: ErrorCode, i18n: I18nService): string {
  return i18n.t(`errors.${code}.title`);
}

export function runError(run: PipelineRun, i18n: I18nService): string {
  return run.errorCode ? errorTitle(run.errorCode, i18n) : (run.error ?? '');
}

export function errorText(error: unknown, i18n: I18nService): string {
  return isAppError(error) ? errorTitle(error.code, i18n) : errorMessage(error);
}

export function runCancelReason(run: PipelineRun, i18n: I18nService): string {
  return i18n.t(run.cancelReason === 'appClosed' ? 'run.cancel.appClosed' : 'run.cancel.user');
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
