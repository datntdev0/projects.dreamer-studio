import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import type { PipelineSlot } from '../../src/core/slots';
import type { PipelineCancelReason, PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import type { ErrorCode } from '@dreamer/shared/errors/app-error';

export type CancelReason = PipelineCancelReason;

export interface PipelineRunFixture {
  id: string;
  name: string;
  status: PipelineRunStatus;
  progress: number;
  step: number;
  steps: number;
  startedAt: string;
  seconds: number;
  type: string;
  stepName: string;
  error: string | null;
  errorCode: string | null;
  cancelReason: CancelReason | null;
  failAt?: number | null;
  finishedAt: string | null;
}

export interface PipelineSlotFixture {
  state: PipelineSlot['state'];
  runs: PipelineRunFixture[];
  error?: string;
}

export function toPipelineRun(run: PipelineRunFixture): PipelineRun {
  return {
    id: run.id,
    type: 'demo',
    status: run.status,
    cancelReason: run.cancelReason,
    progress: run.progress,
    stepIndex: run.step,
    stepCount: run.steps,
    stepName: run.stepName || null,
    errorCode: run.errorCode as ErrorCode | null,
    error: run.error,
    createdAt: run.startedAt,
    startedAt: run.status === 'queued' ? null : run.startedAt,
    finishedAt: run.finishedAt,
  };
}

export function toPipelineSlot(slot: PipelineSlotFixture): PipelineSlot {
  return { ...slot, runs: slot.runs.map(toPipelineRun) };
}

export const DEMO_STEPS: string[] = ['Prepare', 'Load source', 'Process chapters', 'Write output', 'Finish'];

export const DEMO_BACKEND_STEP = 3;

export const HISTORY_PAGE_SIZE = 50;

const GENERATED_HISTORY = 60;

const now: number = Date.now();

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function finishedAfter(startedAt: string, seconds: number): string {
  return new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

function demoName(id: string): string {
  return `Demo pipeline #${shortId(id)}`;
}

function finished(run: PipelineRunFixture, startedMinutesAgo: number): PipelineRunFixture {
  const startedAt: string = minutesAgo(startedMinutesAgo);
  return { ...run, name: demoName(run.id), startedAt, finishedAt: finishedAfter(startedAt, run.seconds) };
}

export const RUNNING_RUN: PipelineRunFixture = {
  id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  type: 'demo',
  name: demoName('a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d'),
  status: 'running',
  progress: 42,
  step: 2,
  steps: 5,
  stepName: DEMO_STEPS[1],
  error: null,
  errorCode: null,
  cancelReason: null,
  startedAt: minutesAgo(1),
  finishedAt: null,
  seconds: 72,
};

export const QUEUED_RUN: PipelineRunFixture = {
  ...RUNNING_RUN,
  id: 'b7e41f02-9c3d-4e5a-a6b7-c8d9e0f1a2b3',
  name: demoName('b7e41f02-9c3d-4e5a-a6b7-c8d9e0f1a2b3'),
  status: 'queued',
  progress: 0,
  step: 0,
  stepName: '',
  failAt: DEMO_BACKEND_STEP,
  seconds: 0,
};

const SUCCEEDED_RUN: PipelineRunFixture = finished(
  {
    ...RUNNING_RUN,
    id: 'c3d9e8f1-2a4b-4c6d-8e0f-1a2b3c4d5e6f',
    status: 'succeeded',
    progress: 100,
    step: 5,
    stepName: DEMO_STEPS[4],
    seconds: 72,
  },
  30,
);

const BACKEND_FAILED_RUN: PipelineRunFixture = finished(
  {
    ...RUNNING_RUN,
    id: 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a',
    status: 'failed',
    progress: 50,
    step: DEMO_BACKEND_STEP,
    stepName: DEMO_STEPS[DEMO_BACKEND_STEP - 1],
    error: 'connect ECONNREFUSED 127.0.0.1:8765',
    errorCode: 'BACKEND_UNAVAILABLE',
    seconds: 31,
  },
  95,
);

const FAILED_RUN: PipelineRunFixture = finished(
  {
    ...RUNNING_RUN,
    id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
    status: 'failed',
    progress: 30,
    step: 2,
    stepName: DEMO_STEPS[1],
    error: 'Simulated failure at step 2 (Fail at step = 2).',
    seconds: 24,
  },
  180,
);

const CANCELLED_RUN: PipelineRunFixture = finished(
  {
    ...RUNNING_RUN,
    id: 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c',
    status: 'cancelled',
    progress: 20,
    step: 1,
    stepName: DEMO_STEPS[0],
    cancelReason: 'user',
    seconds: 15,
  },
  1500,
);

const RESTART_CANCELLED_RUN: PipelineRunFixture = finished(
  {
    ...CANCELLED_RUN,
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    progress: 40,
    step: 2,
    stepName: DEMO_STEPS[1],
    cancelReason: 'appClosed',
    seconds: 33,
  },
  4400,
);

function generatedId(index: number): string {
  const head: string = ((index + 1) * 2654435761).toString(16).slice(-8).padStart(8, '0');
  return `${head}-7d1e-4c2f-9a3b-${index.toString(16).padStart(12, '0')}`;
}

function generatedRun(index: number): PipelineRunFixture {
  const failed: boolean = index % 9 === 4;
  const run: PipelineRunFixture = {
    ...SUCCEEDED_RUN,
    id: generatedId(index),
    status: failed ? 'failed' : 'succeeded',
    progress: failed ? 50 : 100,
    step: failed ? DEMO_BACKEND_STEP : 5,
    stepName: DEMO_STEPS[failed ? DEMO_BACKEND_STEP - 1 : 4],
    error: failed ? BACKEND_FAILED_RUN.error : null,
    errorCode: failed ? BACKEND_FAILED_RUN.errorCode : null,
    seconds: 60 + (index % 7) * 5,
  };
  return finished(run, 6000 + index * 240);
}

export const ACTIVE_RUNS: PipelineRunFixture[] = [RUNNING_RUN, QUEUED_RUN];

const HISTORY_RUNS: PipelineRunFixture[] = [
  SUCCEEDED_RUN,
  BACKEND_FAILED_RUN,
  FAILED_RUN,
  CANCELLED_RUN,
  RESTART_CANCELLED_RUN,
];

export const LONG_HISTORY_RUNS: PipelineRunFixture[] = [
  ...HISTORY_RUNS,
  ...Array.from({ length: GENERATED_HISTORY }, (_, index) => generatedRun(index)),
];

export const RECENT_RUNS: PipelineRunFixture[] = [RUNNING_RUN, ...HISTORY_RUNS];

function logLine(startedAt: string, offsetSeconds: number, level: string, message: string): string {
  return `${finishedAfter(startedAt, offsetSeconds)} ${level} main pipeline.demo ${message}`;
}

function stepModule(index: number): string {
  return index === DEMO_BACKEND_STEP ? ' (AI backend job)' : '';
}

export function runLog(run: PipelineRunFixture): string[] {
  if (run.status === 'queued') return [];
  const lines: string[] = [logLine(run.startedAt, 0, 'INFO', `Run started: ${run.id} (${run.steps} steps)`)];
  const lastStep: number = run.status === 'succeeded' ? run.steps : run.step;
  for (let index = 1; index <= lastStep; index++) {
    const offset: number = (index - 1) * 14;
    const name: string = DEMO_STEPS[index - 1];
    lines.push(
      logLine(run.startedAt, offset + 1, 'INFO', `Step ${index}/${run.steps} started: ${name}${stepModule(index)}`),
    );
    const isCurrent: boolean = index === run.step && run.status !== 'succeeded';
    const ticks: number[] = isCurrent ? [25, 50] : [25, 50, 75, 100];
    ticks.forEach((tick, tickIndex) =>
      lines.push(logLine(run.startedAt, offset + 3 + tickIndex * 3, 'DEBUG', `${name}: ${tick}%`)),
    );
    if (!isCurrent) lines.push(logLine(run.startedAt, offset + 13, 'INFO', `Step ${index}/${run.steps} done: ${name}`));
  }
  if (run.status === 'succeeded') lines.push(logLine(run.startedAt, run.seconds, 'INFO', 'Run succeeded'));
  if (run.status === 'failed') {
    const code: string = run.errorCode ? `${run.errorCode}: ` : '';
    lines.push(
      logLine(run.startedAt, run.seconds, 'ERROR', `Step ${run.step}/${run.steps} failed: ${code}${run.error}`),
    );
    lines.push('    at DemoPipeline.runStep (electron/main/pipelines/demo-pipeline.ts:42:11)');
  }
  if (run.status === 'cancelled' && run.cancelReason === 'appClosed') {
    lines.push(logLine(run.startedAt, run.seconds - 1, 'WARN', 'App closed while the run was active'));
    lines.push(logLine(run.startedAt, run.seconds, 'INFO', `Run cancelled at step ${run.step}/${run.steps}`));
  } else if (run.status === 'cancelled') {
    lines.push(logLine(run.startedAt, run.seconds, 'INFO', `Cancelled by user at step ${run.step}`));
  }
  return lines;
}

export const READY_EMPTY: PipelineSlotFixture = { state: 'ready', runs: [] };
export const LOADING: PipelineSlotFixture = { state: 'loading', runs: [] };
export const ERROR: PipelineSlotFixture = {
  state: 'error',
  runs: [],
  error: 'SQLITE_CANTOPEN: unable to open database file',
};

export function providePipelines(
  active: PipelineSlotFixture = READY_EMPTY,
  recent: PipelineSlotFixture = READY_EMPTY,
): Provider[] {
  return [
    { provide: ACTIVE_PIPELINES, useValue: signal(toPipelineSlot(active)).asReadonly() },
    { provide: RECENT_PIPELINES, useValue: signal(toPipelineSlot(recent)).asReadonly() },
  ];
}
