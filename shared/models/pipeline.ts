import { ErrorCode } from '../errors/app-error';

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type PipelineType = 'demo' | 'novel-import' | 'novel-export' | 'glossary-translation' | 'content-translation';

export type PipelineCancelReason = 'user' | 'appClosed';

export const pipelineRunStatuses: PipelineRunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];

export const finishedStatuses: PipelineRunStatus[] = ['succeeded', 'failed', 'cancelled'];

export interface PipelineRun {
  id: string;
  type: PipelineType;
  status: PipelineRunStatus;
  cancelReason: PipelineCancelReason | null;
  progress: number;
  stepIndex: number;
  stepCount: number;
  stepName: string | null;
  errorCode: ErrorCode | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  label: string | null;
  novelId: string | null;
}

export interface PipelineStepInfo {
  key: string;
  backend: boolean;
}

export interface PipelineTypeInfo {
  type: PipelineType;
  steps: PipelineStepInfo[];
}

export interface PipelineStartRequest {
  type: PipelineType;
  failAtStep: number | null;
}

export interface PipelineCursor {
  createdAt: string;
  id: string;
}

export interface PipelineListQuery {
  finished: boolean | null;
  statuses: PipelineRunStatus[];
  types: PipelineType[];
  limit: number;
  after: PipelineCursor | null;
}

export interface PipelinePage {
  runs: PipelineRun[];
  total: number;
  next: PipelineCursor | null;
}

export interface PipelineLogChunk {
  runId: string;
  lines: string[];
}
