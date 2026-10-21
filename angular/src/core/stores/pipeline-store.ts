import { computed, inject, Injectable, type Signal, signal, type WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '@components/toast/toast.service';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type {
  PipelineListQuery,
  PipelineRun,
  PipelineStartRequest,
  PipelineTypeInfo,
} from '@dreamer/shared/models/pipeline';
import { isActiveRun, runError, runName, runSeconds } from '../../features/pipelines/run-status';
import { DesktopApi } from '../desktop-api';
import { formatDuration } from '../format';
import { I18nService } from '../i18n/i18n.service';
import type { PipelineSlot } from '../slots';

interface SlotStatus {
  state: PipelineSlot['state'];
  error?: string;
}

const ACTIVE_QUERY: PipelineListQuery = { finished: false, statuses: [], types: [], limit: 50, after: null };
const RECENT_LIMIT = 5;
const RECENT_QUERY: PipelineListQuery = { finished: null, statuses: [], types: [], limit: RECENT_LIMIT, after: null };

function newestFirst(a: PipelineRun, b: PipelineRun): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

@Injectable({ providedIn: 'root' })
export class PipelineStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly toast: ToastService = inject(ToastService);
  private readonly router: Router = inject(Router);
  private readonly i18n: I18nService = inject(I18nService);

  private recentHasMore = false;
  private readonly known = signal<Map<string, PipelineRun>>(new Map());
  private readonly activeState = signal<SlotStatus>({ state: 'loading' });
  private readonly recentState = signal<SlotStatus>({ state: 'loading' });
  private readonly recentRuns = signal<PipelineRun[]>([]);
  private readonly typeList = signal<PipelineTypeInfo[]>([]);

  readonly types: Signal<PipelineTypeInfo[]> = this.typeList.asReadonly();
  readonly active: Signal<PipelineSlot> = computed(() => ({
    ...this.activeState(),
    runs: [...this.known().values()]
      .filter(isActiveRun)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
  }));

  readonly recent: Signal<PipelineSlot> = computed(() => ({ ...this.recentState(), runs: this.recentRuns() }));

  init(): void {
    this.desktopApi.onPipelineUpdate((run) => this.merge(run, true));
    this.desktopApi.onPipelineDeleted((ids) => this.removeLocal(ids));
    this.desktopApi.onAppDataChanged(() => this.forgetRuns());
    void this.reload();
    void this.loadRecent();
    void this.desktopApi.pipelineTypes().then((types) => this.typeList.set(types));
  }

  run(id: string): Signal<PipelineRun | undefined> {
    return computed(() => this.known().get(id));
  }

  async load(id: string): Promise<void> {
    const run: PipelineRun | null = await this.desktopApi.getPipeline(id);
    if (run) this.merge(run, false);
  }

  async start(request: PipelineStartRequest): Promise<PipelineRun | null> {
    const run: PipelineRun | null = await this.desktopApi.startPipeline(request);
    if (run) this.merge(run, false);
    return run;
  }

  async cancel(id: string): Promise<void> {
    await this.desktopApi.cancelPipeline(id);
  }

  async delete(ids: string[]): Promise<string[]> {
    const deleted: string[] = await this.desktopApi.deletePipelines(ids);
    this.removeLocal(deleted);
    return deleted;
  }

  async reload(): Promise<void> {
    await this.track(this.activeState, async () => {
      const page = await this.desktopApi.listPipelines(ACTIVE_QUERY);
      page.runs.filter((run) => !this.known().has(run.id)).forEach((run) => this.merge(run, false));
    });
  }

  private forgetRuns(): void {
    this.known.set(new Map());
    this.recentRuns.set([]);
    void this.reload();
    void this.loadRecent();
  }

  private async loadRecent(): Promise<void> {
    await this.track(this.recentState, async () => {
      const page = await this.desktopApi.listPipelines(RECENT_QUERY);
      this.recentRuns.set(page.runs);
      this.recentHasMore = page.total > RECENT_LIMIT || page.next != null;
    });
  }

  private async track(status: WritableSignal<SlotStatus>, work: () => Promise<void>): Promise<void> {
    status.set({ state: 'loading' });
    try {
      await work();
      status.set({ state: 'ready' });
    } catch (error) {
      status.set({ state: 'error', error: errorMessage(error) });
    }
  }

  private removeLocal(ids: string[]): void {
    const gone = new Set<string>(ids);
    this.known.update((known) => new Map([...known].filter(([id]) => !gone.has(id))));
    this.recentRuns.update((runs) => runs.filter((run) => !gone.has(run.id)));
    if (this.recentRuns().length < RECENT_LIMIT && this.recentHasMore) void this.loadRecent();
  }

  private merge(run: PipelineRun, notify: boolean): void {
    const previous: PipelineRun | undefined = this.known().get(run.id);
    this.known.update((known) => new Map(known).set(run.id, run));
    this.recentRuns.update((runs) =>
      [run, ...runs.filter((item) => item.id !== run.id)].sort(newestFirst).slice(0, RECENT_LIMIT),
    );
    if (notify && previous?.status === 'running') this.notifyFinished(run);
  }

  private notifyFinished(run: PipelineRun): void {
    if (run.status === 'succeeded') {
      this.toast.show({
        kind: 'success',
        title: this.i18n.t('toast.pipeline.succeeded'),
        message: this.i18n.t('toast.pipeline.succeededMsg', {
          name: runName(run, this.i18n),
          duration: formatDuration(runSeconds(run)),
        }),
        action: { label: this.i18n.t('toast.pipeline.view'), run: () => this.open(run.id) },
      });
    } else if (run.status === 'failed') {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('toast.pipeline.failed'),
        message: this.i18n.t('toast.pipeline.failedMsg', {
          name: runName(run, this.i18n),
          step: run.stepIndex,
          error: runError(run, this.i18n),
        }),
        action: { label: this.i18n.t('toast.pipeline.viewLog'), run: () => this.open(run.id) },
      });
    }
  }

  private open(id: string): void {
    void this.router.navigate(['/pipelines', id]);
  }
}
