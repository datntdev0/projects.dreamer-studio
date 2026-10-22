import { DestroyRef, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type {
  PipelineCursor,
  PipelineListQuery,
  PipelineLogChunk,
  PipelinePage,
  PipelineRun,
  PipelineStartRequest,
  PipelineTypeInfo,
} from '@dreamer/shared/models/pipeline';
import type { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from '../../src/core/desktop-api';
import { isActiveRun } from '../../src/features/pipelines/run-status';
import { APP_INFO, fakeBackendStatus, fakeSettingsApi } from './desktop-api';
import type { FakeSettingsApi } from './desktop-api';
import { DEMO_BACKEND_STEP, DEMO_STEPS, QUEUED_RUN, runLog, stepKey } from './pipelines';

export interface FakePipelinesOptions {
  runs: PipelineRun[];
  packaged?: boolean;
  list?: 'ready' | 'loading' | 'error';
}

const TICK_MS = 600;
const PROGRESS_PER_TICK = 5;
const STEP_PERCENT = 100 / DEMO_STEPS.length;
const DB_ERROR = 'SQLITE_CANTOPEN: unable to open database file';

function newestFirst(a: PipelineCursor, b: PipelineCursor): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function toCursor(run: PipelineRun): PipelineCursor {
  return { createdAt: run.createdAt, id: run.id };
}

function matches(run: PipelineRun, query: PipelineListQuery): boolean {
  return (
    (query.finished === null || query.finished === !isActiveRun(run)) &&
    (query.statuses.length === 0 || query.statuses.includes(run.status)) &&
    (query.types.length === 0 || query.types.includes(run.type))
  );
}

class FakePipelinesApi extends DesktopApi {
  private runs: PipelineRun[];
  private readonly failAt = new Map<string, number>([[QUEUED_RUN.id, DEMO_BACKEND_STEP]]);
  private readonly logged = new Map<string, number>();
  private readonly updateListeners = new Set<(run: PipelineRun) => void>();
  private readonly logListeners = new Set<(chunk: PipelineLogChunk) => void>();
  private readonly deletedListeners = new Set<(ids: string[]) => void>();
  private readonly fakeSettings: FakeSettingsApi = fakeSettingsApi();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly options: FakePipelinesOptions,
    destroyRef: DestroyRef,
  ) {
    super();
    this.runs = [...options.runs];
    this.runs.forEach((run) => this.logged.set(run.id, runLog(run).length));
    destroyRef.onDestroy(() => this.stopTimer());
    if (this.runs.some((run) => run.status === 'running')) this.startTimer();
  }

  override async info(): Promise<AppInfo | null> {
    return APP_INFO;
  }

  override async openLogs(): Promise<void> {}

  override async openDataDir(): Promise<void> {}

  override async openLink(): Promise<void> {}

  override onError(): () => void {
    return () => undefined;
  }

  override onBackendStatus(listener: (status: BackendStatus) => void): () => void {
    listener(fakeBackendStatus());
    return () => undefined;
  }

  override async backendStatus(): Promise<BackendStatus | null> {
    return fakeBackendStatus();
  }

  override writeLog(): void {}

  override settings(): Promise<SettingsState | null> {
    return this.fakeSettings.settings();
  }

  override updateSettings(patch: SettingsPatch): Promise<AppSettings | null> {
    return this.fakeSettings.updateSettings(patch);
  }

  override resetSettings(section: SettingsSection): Promise<AppSettings | null> {
    return this.fakeSettings.resetSettings(section);
  }

  override onSettingsChanged(listener: (settings: AppSettings) => void): () => void {
    return this.fakeSettings.onSettingsChanged(listener);
  }

  override async pipelineTypes(): Promise<PipelineTypeInfo[]> {
    if (this.options.packaged) return [];
    const steps = DEMO_STEPS.map((_, index) => ({ key: stepKey(index + 1), backend: index + 1 === DEMO_BACKEND_STEP }));
    return [{ type: 'demo', steps }];
  }

  override async startPipeline(request: PipelineStartRequest): Promise<PipelineRun | null> {
    const run: PipelineRun = {
      id: crypto.randomUUID(),
      type: request.type,
      status: 'queued',
      cancelReason: null,
      progress: 0,
      stepIndex: 0,
      stepCount: DEMO_STEPS.length,
      stepName: null,
      errorCode: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      label: null,
      novelId: null,
    };
    if (request.failAtStep) this.failAt.set(run.id, request.failAtStep);
    this.runs.push(run);
    this.publish(run);
    this.startNext();
    this.startTimer();
    return this.find(run.id) ?? run;
  }

  override async cancelPipeline(id: string): Promise<void> {
    const run: PipelineRun | undefined = this.find(id);
    if (run && isActiveRun(run)) this.finish(run, { status: 'cancelled', cancelReason: 'user' });
  }

  override async listPipelines(query: PipelineListQuery): Promise<PipelinePage> {
    if (this.options.list === 'loading') return new Promise<PipelinePage>(() => undefined);
    if (this.options.list === 'error') throw new Error(DB_ERROR);
    const matching: PipelineRun[] = this.runs.filter((run) => matches(run, query)).sort(newestFirst);
    const rest: PipelineRun[] = query.after ? matching.filter((run) => newestFirst(query.after!, run) < 0) : matching;
    const runs: PipelineRun[] = rest.slice(0, query.limit);
    return { runs, total: matching.length, next: rest.length > runs.length ? toCursor(runs[runs.length - 1]) : null };
  }

  override async getPipeline(id: string): Promise<PipelineRun | null> {
    const run: PipelineRun | undefined = this.find(id);
    if (!run) throw new CodedError(ErrorCode.PipelineNotFound, `Pipeline run ${id} was not found`);
    return run;
  }

  override async pipelineLog(id: string): Promise<string[]> {
    const run: PipelineRun | undefined = this.find(id);
    return run ? runLog(run) : [];
  }

  override async deletePipelines(ids: string[]): Promise<string[]> {
    const deleted: string[] = this.runs.filter((run) => ids.includes(run.id) && !isActiveRun(run)).map((run) => run.id);
    this.runs = this.runs.filter((run) => !deleted.includes(run.id));
    this.deletedListeners.forEach((listener) => listener(deleted));
    return deleted;
  }

  override onPipelineDeleted(listener: (ids: string[]) => void): () => void {
    return this.subscribe(this.deletedListeners, listener);
  }

  override onPipelineUpdate(listener: (run: PipelineRun) => void): () => void {
    return this.subscribe(this.updateListeners, listener);
  }

  override onPipelineLog(listener: (chunk: PipelineLogChunk) => void): () => void {
    return this.subscribe(this.logListeners, listener);
  }

  private subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  private find(id: string): PipelineRun | undefined {
    return this.runs.find((run) => run.id === id);
  }

  private publish(run: PipelineRun): void {
    this.runs = this.runs.map((item) => (item.id === run.id ? run : item));
    this.updateListeners.forEach((listener) => listener(run));
    const lines: string[] = runLog(run).slice(this.logged.get(run.id) ?? 0);
    this.logged.set(run.id, (this.logged.get(run.id) ?? 0) + lines.length);
    if (lines.length > 0) this.logListeners.forEach((listener) => listener({ runId: run.id, lines }));
  }

  private finish(run: PipelineRun, patch: Partial<PipelineRun>): void {
    this.publish({ ...run, ...patch, finishedAt: new Date().toISOString() });
    this.startNext();
  }

  private startNext(): void {
    if (this.runs.some((run) => run.status === 'running')) return;
    const next: PipelineRun | undefined = this.runs
      .filter((run) => run.status === 'queued')
      .sort((a, b) => newestFirst(b, a))[0];
    if (!next) return;
    const startedAt: string = new Date().toISOString();
    this.publish({ ...next, status: 'running', stepIndex: 1, stepName: stepKey(1), startedAt });
  }

  private startTimer(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const run: PipelineRun | undefined = this.runs.find((item) => item.status === 'running');
    if (!run) return this.stopTimer();
    const progress: number = run.progress + PROGRESS_PER_TICK;
    const stepIndex: number = Math.min(DEMO_STEPS.length, Math.floor(progress / STEP_PERCENT) + 1);
    if (progress >= 100) {
      this.finish(run, { status: 'succeeded', progress: 100, stepIndex: DEMO_STEPS.length, stepName: stepKey(5) });
    } else if (this.failAt.get(run.id) === stepIndex && progress % STEP_PERCENT >= STEP_PERCENT / 2) {
      this.finish(run, { status: 'failed', progress, stepIndex, error: `Simulated failure at step ${stepIndex}.` });
    } else {
      this.publish({ ...run, progress, stepIndex, stepName: stepKey(stepIndex) });
    }
  }
}

export function provideFakePipelinesApi(options: FakePipelinesOptions): Provider {
  return { provide: DesktopApi, useFactory: () => new FakePipelinesApi(options, inject(DestroyRef)) };
}
