import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { PipelineChannel } from '@dreamer/shared/ipc/channels';
import { PipelineCancelReason, PipelineListQuery, PipelinePage, PipelineRun } from '@dreamer/shared/models/pipeline';
import { PipelineRunStatus, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { broadcast } from '../ipc/broadcast';
import { createLogger, Logger } from '../logging/logger';
import { PipelineRunRepository } from '../storage/repositories/pipeline-run-repository';
import { AppPaths } from '../storage/paths';
import { abortError, PipelineDefinition, PipelineStep, StepContext } from './pipeline-definition';
import { PipelineRegistry } from './pipeline-registry';
import { appendRunLogSync, deleteRunLog, readRunLog, RunLog, runLogFile } from './run-log';

interface RunState {
  run: PipelineRun;
  definition: PipelineDefinition;
  params: Record<string, unknown>;
  controller: AbortController;
  progressTimer: NodeJS.Timeout | null;
  lastWriteAt: number;
}

const writeIntervalMs: number = 250;
const closedMessage: string = 'Cancelled: app closed';

function nowIso(): string {
  return new Date().toISOString();
}

function overallProgress(run: PipelineRun, percent: number): number {
  return Math.round(((run.stepIndex - 1 + percent / 100) / run.stepCount) * 100);
}

export class PipelineExecutor {
  private readonly logger: Logger = createLogger('pipeline');
  private readonly queue: RunState[] = [];
  private readonly active: Map<string, RunState> = new Map<string, RunState>();
  private closed: boolean = false;

  constructor(
    private readonly repo: PipelineRunRepository,
    private readonly paths: AppPaths,
    private readonly registry: PipelineRegistry,
    private readonly limit: () => number,
  ) {}

  types(): PipelineTypeInfo[] {
    return this.registry.types();
  }

  start(request: PipelineStartRequest): PipelineRun {
    if (this.closed) {
      throw new Error('Pipeline executor is closed');
    }
    const definition: PipelineDefinition | undefined = this.registry.get(request.type);
    if (!definition) {
      throw new CodedError(ErrorCode.PipelineUnknownType, `Unknown pipeline type: ${request.type}`);
    }
    const state: RunState = this.createState(definition, request);
    this.repo.insert(state.run, state.params);
    this.publish(state.run);
    const created: PipelineRun = { ...state.run };
    this.queue.push(state);
    this.pump();
    return created;
  }

  cancel(id: string): void {
    const queuedIndex: number = this.queue.findIndex((state: RunState): boolean => state.run.id === id);
    if (queuedIndex >= 0) {
      const [queued]: RunState[] = this.queue.splice(queuedIndex, 1);
      this.finish(queued, 'cancelled', 'user');
      return;
    }
    const running: RunState | undefined = this.active.get(id);
    if (running) {
      running.controller.abort();
    } else {
      this.get(id);
    }
  }

  list(query: PipelineListQuery): PipelinePage {
    return this.repo.list(query);
  }

  get(id: string): PipelineRun {
    const run: PipelineRun | null = this.repo.get(id);
    if (!run) {
      throw new CodedError(ErrorCode.PipelineNotFound, `Pipeline run not found: ${id}`);
    }
    return run;
  }

  readLog(id: string): string[] {
    return readRunLog(runLogFile(this.paths, id));
  }

  delete(ids: string[]): string[] {
    const deleted: string[] = this.repo.deleteFinished(ids);
    deleted.forEach((id: string): void => this.deleteLogFile(id));
    if (deleted.length > 0) {
      broadcast(PipelineChannel.Deleted, deleted);
    }
    return deleted;
  }

  recover(): string[] {
    const ids: string[] = this.repo.markActiveCancelled('appClosed', nowIso());
    ids
      .filter((id: string): boolean => existsSync(runLogFile(this.paths, id)))
      .forEach((id: string): void => this.appendClosedLine(id));
    if (ids.length > 0) {
      this.logger.info(`recovered ${ids.length} runs left active: cancelled`);
    }
    return ids;
  }

  cancelAll(reason: PipelineCancelReason): void {
    this.closed = true;
    const running: RunState[] = Array.from(this.active.values());
    this.active.clear();
    running.forEach((state: RunState): void => state.controller.abort());
    this.queue.length = 0;
    this.repo.markActiveCancelled(reason, nowIso());
    running.forEach((state: RunState): void => this.appendClosedLine(state.run.id));
  }

  hasActive(): boolean {
    return this.queue.length > 0 || this.active.size > 0;
  }

  limitChanged(): void {
    if (!this.closed) {
      this.pump();
    }
  }

  private createState(definition: PipelineDefinition, request: PipelineStartRequest): RunState {
    const run: PipelineRun = {
      id: randomUUID(),
      type: request.type,
      status: 'queued',
      cancelReason: null,
      progress: 0,
      stepIndex: 0,
      stepCount: definition.steps.length,
      stepName: null,
      errorCode: null,
      error: null,
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
    };
    const params: Record<string, unknown> = { failAtStep: request.failAtStep };
    return { run, definition, params, controller: new AbortController(), progressTimer: null, lastWriteAt: 0 };
  }

  private pump(): void {
    while (this.queue.length > 0 && this.active.size < this.limit()) {
      const state: RunState = this.queue.shift() as RunState;
      this.active.set(state.run.id, state);
      void this.execute(state).catch((error: unknown): void => this.logger.error('pipeline run crashed', error));
    }
  }

  private async execute(state: RunState): Promise<void> {
    const { run } = state;
    const runLog: RunLog = new RunLog(runLogFile(this.paths, run.id), run.id, run.type);
    const ctx: StepContext = this.createContext(state, runLog);
    try {
      run.status = 'running';
      run.startedAt = nowIso();
      this.save(state);
      runLog.logger.info(`Run started ${JSON.stringify(state.params)}`);
      await this.runSteps(state, ctx);
      this.succeed(state, runLog);
    } catch (error) {
      await this.settleError(state, ctx, runLog, error);
    } finally {
      this.clearProgressTimer(state);
      runLog.close();
      this.active.delete(run.id);
      if (!this.closed) {
        this.pump();
      }
    }
  }

  private createContext(state: RunState, runLog: RunLog): StepContext {
    return {
      params: state.params,
      signal: state.controller.signal,
      progress: (percent: number): void => this.reportProgress(state, percent),
      log: runLog.logger,
      checkpoint: (): void => {
        if (state.controller.signal.aborted) {
          throw abortError();
        }
      },
    };
  }

  private async runSteps(state: RunState, ctx: StepContext): Promise<void> {
    const { run, definition } = state;
    for (const [index, step] of definition.steps.entries()) {
      ctx.checkpoint();
      this.beginStep(state, index, step);
      ctx.log.info(`Step ${run.stepIndex}/${run.stepCount} started: ${step.key}`);
      await step.run(ctx);
    }
  }

  private beginStep(state: RunState, index: number, step: PipelineStep): void {
    state.run.stepIndex = index + 1;
    state.run.stepName = step.key;
    state.run.progress = overallProgress(state.run, 0);
    this.save(state);
  }

  private succeed(state: RunState, runLog: RunLog): void {
    if (this.closed) {
      return;
    }
    state.run.progress = 100;
    this.finish(state, 'succeeded', null);
    const seconds: string = ((Date.now() - Date.parse(state.run.startedAt as string)) / 1000).toFixed(1);
    runLog.logger.info(`Run succeeded in ${seconds} s`);
  }

  private async settleError(state: RunState, ctx: StepContext, runLog: RunLog, error: unknown): Promise<void> {
    if (this.closed) {
      return;
    }
    if (state.controller.signal.aborted) {
      await this.settleCancelled(state, ctx, runLog);
      return;
    }
    state.run.errorCode = error instanceof CodedError ? error.code : null;
    state.run.error = errorMessage(error);
    this.finish(state, 'failed', null);
    runLog.logger.error('Run failed', error);
    this.logger.error(`pipeline run ${state.run.id} failed`, error);
  }

  private async settleCancelled(state: RunState, ctx: StepContext, runLog: RunLog): Promise<void> {
    try {
      await state.definition.cleanup?.(ctx);
    } catch (error) {
      runLog.logger.error('Cleanup failed', error);
    }
    if (this.closed) {
      return;
    }
    this.finish(state, 'cancelled', 'user');
    runLog.logger.info(`Cancelled by user at step ${state.run.stepIndex}`);
  }

  private finish(state: RunState, status: PipelineRunStatus, reason: PipelineCancelReason | null): void {
    state.run.status = status;
    state.run.cancelReason = reason;
    state.run.finishedAt = nowIso();
    this.save(state);
  }

  private reportProgress(state: RunState, percent: number): void {
    if (state.run.status !== 'running' || this.closed) {
      return;
    }
    state.run.progress = overallProgress(state.run, Math.min(100, Math.max(0, percent)));
    if (state.progressTimer) {
      return;
    }
    const wait: number = state.lastWriteAt + writeIntervalMs - Date.now();
    if (wait <= 0) {
      this.save(state);
    } else {
      state.progressTimer = setTimeout((): void => this.save(state), wait);
    }
  }

  private clearProgressTimer(state: RunState): void {
    if (state.progressTimer) {
      clearTimeout(state.progressTimer);
      state.progressTimer = null;
    }
  }

  private save(state: RunState): void {
    this.clearProgressTimer(state);
    if (this.closed) {
      return;
    }
    state.lastWriteAt = Date.now();
    this.repo.update(state.run);
    this.publish(state.run);
  }

  private publish(run: PipelineRun): void {
    broadcast(PipelineChannel.Update, { ...run });
  }

  private appendClosedLine(id: string): void {
    appendRunLogSync(runLogFile(this.paths, id), closedMessage);
  }

  private deleteLogFile(id: string): void {
    try {
      deleteRunLog(runLogFile(this.paths, id));
    } catch (error) {
      this.logger.warn(`could not delete the log of run ${id}: ${errorMessage(error)}`);
    }
  }
}
