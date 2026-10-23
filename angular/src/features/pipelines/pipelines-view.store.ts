import { computed, DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import {
  finishedStatuses,
  type PipelineCursor,
  type PipelineListQuery,
  type PipelinePage,
  type PipelineRun,
  type PipelineRunStatus,
  type PipelineType,
} from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '@core/desktop-api';

export type PipelineView = 'queue' | 'history';

export type HistoryStatusFilter = Extract<PipelineRunStatus, 'succeeded' | 'failed' | 'cancelled'>;

export interface HistorySlot {
  state: 'loading' | 'ready' | 'error';
  runs: PipelineRun[];
  total: number;
  next: PipelineCursor | null;
  loadingMore: boolean;
  error?: string;
}

const PAGE_SIZE = 50;
const EMPTY_HISTORY: HistorySlot = { state: 'loading', runs: [], total: 0, next: null, loadingMore: false };

@Injectable({ providedIn: 'root' })
export class PipelinesViewStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private requestId = 0;

  readonly view = signal<PipelineView>('queue');
  readonly status = signal<HistoryStatusFilter | null>(null);
  readonly type = signal<PipelineType | null>(null);
  readonly history = signal<HistorySlot>(EMPTY_HISTORY);
  readonly checked = signal<ReadonlySet<string>>(new Set());

  readonly filtered: Signal<boolean> = computed(() => this.status() !== null || this.type() !== null);

  constructor() {
    const destroyRef: DestroyRef = inject(DestroyRef);
    const offUpdate: () => void = this.desktopApi.onPipelineUpdate((run) => this.applyUpdate(run));
    const offDeleted: () => void = this.desktopApi.onPipelineDeleted((ids) => this.applyDeleted(ids));
    const offAppData: () => void = this.desktopApi.onAppDataChanged(() => this.forgetRuns());
    destroyRef.onDestroy(() => {
      offUpdate();
      offDeleted();
      offAppData();
    });
    void this.reload();
  }

  setStatus(status: HistoryStatusFilter | null): void {
    this.status.set(status);
    void this.reload();
  }

  setType(type: PipelineType | null): void {
    this.type.set(type);
    void this.reload();
  }

  clearFilters(): void {
    this.status.set(null);
    this.type.set(null);
    void this.reload();
  }

  async reload(): Promise<void> {
    const request: number = ++this.requestId;
    this.history.set(EMPTY_HISTORY);
    try {
      const page: PipelinePage = await this.desktopApi.listPipelines(this.query(null));
      if (request !== this.requestId) return;
      this.history.set({ ...EMPTY_HISTORY, state: 'ready', runs: page.runs, total: page.total, next: page.next });
    } catch (error) {
      if (request !== this.requestId) return;
      this.history.set({ ...EMPTY_HISTORY, state: 'error', error: errorMessage(error) });
    }
  }

  async loadMore(): Promise<void> {
    const { next, loadingMore } = this.history();
    if (!next || loadingMore) return;
    const request: number = this.requestId;
    this.history.update((slot) => ({ ...slot, loadingMore: true }));
    try {
      const page: PipelinePage = await this.desktopApi.listPipelines(this.query(next));
      if (request !== this.requestId) return;
      this.history.update((slot) => ({
        ...slot,
        runs: [...slot.runs, ...page.runs.filter((run) => !slot.runs.some((loaded) => loaded.id === run.id))],
        total: page.total,
        next: page.next,
        loadingMore: false,
      }));
    } catch {
      if (request !== this.requestId) return;
      this.history.update((slot) => ({ ...slot, loadingMore: false }));
    }
  }

  toggle(id: string, checked: boolean): void {
    this.checked.update((current) => {
      const next = new Set<string>(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  checkLoaded(checked: boolean): void {
    this.checked.set(checked ? new Set<string>(this.history().runs.map((run) => run.id)) : new Set<string>());
  }

  isChecked(id: string): boolean {
    return this.checked().has(id);
  }

  private query(after: PipelineCursor | null): PipelineListQuery {
    const status: HistoryStatusFilter | null = this.status();
    const type: PipelineType | null = this.type();
    return { finished: true, statuses: status ? [status] : [], types: type ? [type] : [], limit: PAGE_SIZE, after };
  }

  private forgetRuns(): void {
    this.checked.set(new Set<string>());
    void this.reload();
  }

  private matchesFilters(run: PipelineRun): boolean {
    return (
      finishedStatuses.includes(run.status) &&
      (this.status() === null || run.status === this.status()) &&
      (this.type() === null || run.type === this.type())
    );
  }

  private applyUpdate(run: PipelineRun): void {
    const slot: HistorySlot = this.history();
    if (slot.state !== 'ready') return;
    if (slot.runs.some((loaded) => loaded.id === run.id)) {
      this.history.set({ ...slot, runs: slot.runs.map((loaded) => (loaded.id === run.id ? run : loaded)) });
    } else if (this.matchesFilters(run)) {
      this.history.set({ ...slot, runs: [run, ...slot.runs], total: slot.total + 1 });
    }
  }

  private applyDeleted(ids: string[]): void {
    const gone = new Set<string>(ids);
    const slot: HistorySlot = this.history();
    const runs: PipelineRun[] = slot.runs.filter((run) => !gone.has(run.id));
    this.history.set({ ...slot, runs, total: Math.max(0, slot.total - (slot.runs.length - runs.length)) });
    this.checked.update((current) => new Set<string>([...current].filter((id) => !gone.has(id))));
  }
}
