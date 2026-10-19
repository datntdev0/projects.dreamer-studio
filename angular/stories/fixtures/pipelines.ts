import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '../../src/core/slots';
import type { PipelineRunView, PipelineSlot } from '../../src/core/slots';

const now: number = Date.now();

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

export const RUNNING_RUN: PipelineRunView = {
  id: 'run-5',
  name: 'Demo pipeline #5',
  status: 'running',
  progress: 42,
  step: 2,
  steps: 5,
  startedAt: minutesAgo(1),
  seconds: 72,
};

export const QUEUED_RUN: PipelineRunView = {
  ...RUNNING_RUN,
  id: 'run-6',
  name: 'Demo pipeline #6',
  status: 'queued',
  progress: 0,
  step: 0,
  seconds: 0,
};

export const RECENT_RUNS: PipelineRunView[] = [
  RUNNING_RUN,
  {
    ...RUNNING_RUN,
    id: 'run-4',
    name: 'Demo pipeline #4',
    status: 'succeeded',
    progress: 100,
    step: 5,
    startedAt: minutesAgo(30),
    seconds: 72,
  },
  {
    ...RUNNING_RUN,
    id: 'run-3',
    name: 'Demo pipeline #3',
    status: 'failed',
    progress: 60,
    step: 3,
    startedAt: minutesAgo(180),
    seconds: 41,
  },
  {
    ...RUNNING_RUN,
    id: 'run-2',
    name: 'Demo pipeline #2',
    status: 'cancelled',
    progress: 20,
    step: 1,
    startedAt: minutesAgo(1500),
    seconds: 15,
  },
  {
    ...RUNNING_RUN,
    id: 'run-1',
    name: 'Demo pipeline #1',
    status: 'succeeded',
    progress: 100,
    step: 5,
    startedAt: minutesAgo(4400),
    seconds: 80,
  },
];

export const READY_EMPTY: PipelineSlot = { state: 'ready', runs: [] };
export const LOADING: PipelineSlot = { state: 'loading', runs: [] };
export const ERROR: PipelineSlot = { state: 'error', runs: [], error: 'SQLITE_CANTOPEN: unable to open database file' };

export function providePipelines(active: PipelineSlot = READY_EMPTY, recent: PipelineSlot = READY_EMPTY): Provider[] {
  return [
    { provide: ACTIVE_PIPELINES, useValue: signal(active).asReadonly() },
    { provide: RECENT_PIPELINES, useValue: signal(recent).asReadonly() },
  ];
}
