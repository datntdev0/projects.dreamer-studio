import { PipelineChannel } from '@dreamer/shared/ipc/channels';
import { pipelineRunStatuses, PipelineCursor, PipelineListQuery } from '@dreamer/shared/models/pipeline';
import { PipelinePage, PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { PipelineExecutor } from '../features/pipelines/pipeline-executor';
import { handle } from './handle';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function isStartRequest(value: unknown): value is PipelineStartRequest {
  return (
    isObject(value) &&
    typeof value.type === 'string' &&
    (value.failAtStep === null || (Number.isInteger(value.failAtStep) && (value.failAtStep as number) >= 1))
  );
}

function isCursor(value: unknown): value is PipelineCursor {
  return isObject(value) && typeof value.createdAt === 'string' && typeof value.id === 'string';
}

function isListQuery(value: unknown): value is PipelineListQuery {
  return (
    isObject(value) &&
    (value.finished === null || typeof value.finished === 'boolean') &&
    Array.isArray(value.statuses) &&
    value.statuses.every((status: unknown): boolean => pipelineRunStatuses.includes(status as PipelineRunStatus)) &&
    Array.isArray(value.types) &&
    value.types.every((type: unknown): boolean => typeof type === 'string') &&
    Number.isInteger(value.limit) &&
    (value.limit as number) >= 1 &&
    (value.limit as number) <= 200 &&
    (value.after === null || isCursor(value.after))
  );
}

function handleValidated<T, R>(channel: string, guard: (value: unknown) => value is T, run: (payload: T) => R): void {
  handle(channel, (_event, payload: unknown): R => {
    if (!guard(payload)) {
      throw new Error(`Invalid ${channel} payload`);
    }
    return run(payload);
  });
}

export function registerPipelineIpc(executor: () => PipelineExecutor): void {
  handle(PipelineChannel.Types, (): PipelineTypeInfo[] => executor().types());
  handleValidated(PipelineChannel.Start, isStartRequest, (request: PipelineStartRequest): PipelineRun =>
    executor().start(request),
  );
  handleValidated(PipelineChannel.Cancel, isId, (id: string): void => executor().cancel(id));
  handleValidated(PipelineChannel.List, isListQuery, (query: PipelineListQuery): PipelinePage =>
    executor().list(query),
  );
  handleValidated(PipelineChannel.Get, isId, (id: string): PipelineRun => executor().get(id));
  handleValidated(PipelineChannel.GetLog, isId, (id: string): string[] => executor().readLog(id));
  handleValidated(PipelineChannel.Delete, isIdList, (ids: string[]): string[] => executor().delete(ids));
}
