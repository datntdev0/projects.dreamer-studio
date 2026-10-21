import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import type { PipelineSlot } from '../../src/core/slots';

type RunSeed = Partial<PipelineRun> & Pick<PipelineRun, 'id' | 'status'>;

export const DEMO_STEPS: string[] = ['Prepare', 'Load source', 'Process chapters', 'Write output', 'Finish'];

export const DEMO_BACKEND_STEP = 3;

const GENERATED_HISTORY = 60;

const now: number = Date.now();

export function stepKey(step: number): string {
  return `run.demo.step.${step}`;
}

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function finishedAfter(startedAt: string, seconds: number): string {
  return new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
}

function makeRun(seed: RunSeed): PipelineRun {
  return {
    type: 'demo',
    cancelReason: null,
    progress: 0,
    stepIndex: 0,
    stepCount: DEMO_STEPS.length,
    stepName: null,
    errorCode: null,
    error: null,
    createdAt: minutesAgo(0),
    startedAt: null,
    finishedAt: null,
    ...seed,
  };
}

function finishedRun(seed: RunSeed, startedMinutesAgo: number, seconds: number): PipelineRun {
  const startedAt: string = minutesAgo(startedMinutesAgo);
  return makeRun({ ...seed, createdAt: startedAt, startedAt, finishedAt: finishedAfter(startedAt, seconds) });
}

export const RUNNING_RUN: PipelineRun = makeRun({
  id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  status: 'running',
  progress: 30,
  stepIndex: 2,
  stepName: stepKey(2),
  createdAt: minutesAgo(1),
  startedAt: minutesAgo(1),
});

export const QUEUED_RUN: PipelineRun = makeRun({
  id: 'b7e41f02-9c3d-4e5a-a6b7-c8d9e0f1a2b3',
  status: 'queued',
  createdAt: minutesAgo(0.5),
});

const SUCCEEDED_RUN: PipelineRun = finishedRun(
  {
    id: 'c3d9e8f1-2a4b-4c6d-8e0f-1a2b3c4d5e6f',
    status: 'succeeded',
    progress: 100,
    stepIndex: 5,
    stepName: stepKey(5),
  },
  30,
  72,
);

const BACKEND_FAILED_RUN: PipelineRun = finishedRun(
  {
    id: 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a',
    status: 'failed',
    progress: 50,
    stepIndex: DEMO_BACKEND_STEP,
    stepName: stepKey(DEMO_BACKEND_STEP),
    error: 'connect ECONNREFUSED 127.0.0.1:8765',
    errorCode: ErrorCode.BackendUnavailable,
  },
  95,
  31,
);

const FAILED_RUN: PipelineRun = finishedRun(
  {
    id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
    status: 'failed',
    progress: 30,
    stepIndex: 2,
    stepName: stepKey(2),
    error: 'Simulated failure at step 2 (Fail at step = 2).',
  },
  180,
  24,
);

const CANCELLED_RUN: PipelineRun = finishedRun(
  {
    id: 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c',
    status: 'cancelled',
    progress: 20,
    stepIndex: 1,
    stepName: stepKey(1),
    cancelReason: 'user',
  },
  1500,
  15,
);

const RESTART_CANCELLED_RUN: PipelineRun = finishedRun(
  {
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    status: 'cancelled',
    progress: 40,
    stepIndex: 2,
    stepName: stepKey(2),
    cancelReason: 'appClosed',
  },
  4400,
  33,
);

function generatedId(index: number): string {
  const head: string = ((index + 1) * 2654435761).toString(16).slice(-8).padStart(8, '0');
  return `${head}-7d1e-4c2f-9a3b-${index.toString(16).padStart(12, '0')}`;
}

function generatedRun(index: number): PipelineRun {
  const failed: boolean = index % 9 === 4;
  const step: number = failed ? DEMO_BACKEND_STEP : DEMO_STEPS.length;
  return finishedRun(
    {
      id: generatedId(index),
      status: failed ? 'failed' : 'succeeded',
      progress: failed ? 50 : 100,
      stepIndex: step,
      stepName: stepKey(step),
      error: failed ? BACKEND_FAILED_RUN.error : null,
      errorCode: failed ? BACKEND_FAILED_RUN.errorCode : null,
    },
    6000 + index * 240,
    60 + (index % 7) * 5,
  );
}

export const ACTIVE_RUNS: PipelineRun[] = [RUNNING_RUN, QUEUED_RUN];

const HISTORY_RUNS: PipelineRun[] = [
  SUCCEEDED_RUN,
  BACKEND_FAILED_RUN,
  FAILED_RUN,
  CANCELLED_RUN,
  RESTART_CANCELLED_RUN,
];

export const LONG_HISTORY_RUNS: PipelineRun[] = [
  ...HISTORY_RUNS,
  ...Array.from({ length: GENERATED_HISTORY }, (_, index) => generatedRun(index)),
];

export const ALL_RUNS: PipelineRun[] = [...ACTIVE_RUNS, ...LONG_HISTORY_RUNS];

export const RECENT_RUNS: PipelineRun[] = [RUNNING_RUN, ...HISTORY_RUNS];

export function logLine(startedAt: string, offsetSeconds: number, level: string, message: string): string {
  return `${finishedAfter(startedAt, offsetSeconds)} ${level} main pipeline.demo ${message}`;
}

function stepModule(index: number): string {
  return index === DEMO_BACKEND_STEP ? ' (AI backend job)' : '';
}

function runSeconds(run: PipelineRun, startedAt: string): number {
  return run.finishedAt ? Math.round((Date.parse(run.finishedAt) - Date.parse(startedAt)) / 1000) : 0;
}

export function runLog(run: PipelineRun): string[] {
  const startedAt: string | null = run.startedAt;
  if (!startedAt) return [];
  const seconds: number = runSeconds(run, startedAt);
  const lines: string[] = [logLine(startedAt, 0, 'INFO', `Run started: ${run.id} (${run.stepCount} steps)`)];
  const lastStep: number = run.status === 'succeeded' ? run.stepCount : run.stepIndex;
  for (let index = 1; index <= lastStep; index++) {
    const offset: number = (index - 1) * 14;
    const name: string = DEMO_STEPS[index - 1];
    lines.push(
      logLine(startedAt, offset + 1, 'INFO', `Step ${index}/${run.stepCount} started: ${name}${stepModule(index)}`),
    );
    const isCurrent: boolean = index === run.stepIndex && run.status !== 'succeeded';
    const ticks: number[] = isCurrent ? [25, 50] : [25, 50, 75, 100];
    ticks.forEach((tick, tickIndex) =>
      lines.push(logLine(startedAt, offset + 3 + tickIndex * 3, 'DEBUG', `${name}: ${tick}%`)),
    );
    if (!isCurrent) lines.push(logLine(startedAt, offset + 13, 'INFO', `Step ${index}/${run.stepCount} done: ${name}`));
  }
  if (run.status === 'succeeded') lines.push(logLine(startedAt, seconds, 'INFO', 'Run succeeded'));
  if (run.status === 'failed') {
    const code: string = run.errorCode ? `${run.errorCode}: ` : '';
    lines.push(
      logLine(startedAt, seconds, 'ERROR', `Step ${run.stepIndex}/${run.stepCount} failed: ${code}${run.error}`),
    );
    lines.push('    at DemoPipeline.runStep (electron/main/features/pipelines/demo-pipeline.ts:42:11)');
  }
  if (run.status === 'cancelled' && run.cancelReason === 'appClosed') {
    lines.push(logLine(startedAt, seconds - 1, 'WARN', 'App closed while the run was active'));
    lines.push(logLine(startedAt, seconds, 'INFO', `Run cancelled at step ${run.stepIndex}/${run.stepCount}`));
  } else if (run.status === 'cancelled') {
    lines.push(logLine(startedAt, seconds, 'INFO', `Cancelled by user at step ${run.stepIndex}`));
  }
  return lines;
}

export const READY_EMPTY: PipelineSlot = { state: 'ready', runs: [] };
export const LOADING: PipelineSlot = { state: 'loading', runs: [] };
export const ERROR: PipelineSlot = {
  state: 'error',
  runs: [],
  error: 'SQLITE_CANTOPEN: unable to open database file',
};

export function providePipelines(active: PipelineSlot = READY_EMPTY, recent: PipelineSlot = READY_EMPTY): Provider[] {
  return [
    { provide: ACTIVE_PIPELINES, useValue: signal(active).asReadonly() },
    { provide: RECENT_PIPELINES, useValue: signal(recent).asReadonly() },
  ];
}
