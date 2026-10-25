import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PipelineListQuery, PipelinePage, PipelineRun } from '@dreamer/shared/models/pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@components/toast/toast.service';
import { DesktopApi } from '../desktop-api';
import { PipelineStore } from './pipeline-store';

function run(id: string, status: PipelineRun['status'], seed: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id,
    type: 'demo',
    status,
    cancelReason: null,
    progress: 0,
    stepIndex: 1,
    stepCount: 5,
    stepName: null,
    errorCode: null,
    error: null,
    createdAt: `2026-10-20T10:00:0${id.length % 10}.000Z`,
    startedAt: null,
    finishedAt: null,
    label: null,
    novelId: null,
    ...seed,
  };
}

function page(runs: PipelineRun[], total: number = runs.length): PipelinePage {
  return { runs, total, next: null };
}

class DesktopApiStub {
  update: (run: PipelineRun) => void = () => undefined;
  deleted: (ids: string[]) => void = () => undefined;
  activePage: PipelinePage = page([]);
  recentPage: PipelinePage = page([]);
  readonly listPipelines = vi.fn(async (query: PipelineListQuery) =>
    query.finished === false ? this.activePage : this.recentPage,
  );
  readonly deletePipelines = vi.fn(async (ids: string[]) => ids);
  readonly pipelineTypes = vi.fn(async () => []);
  readonly showExport = vi.fn(async () => undefined);
  readonly writeLog = vi.fn();
  onPipelineUpdate(listener: (run: PipelineRun) => void): () => void {
    this.update = listener;
    return () => undefined;
  }
  onPipelineDeleted(listener: (ids: string[]) => void): () => void {
    this.deleted = listener;
    return () => undefined;
  }
  onAppDataChanged(): () => void {
    return () => undefined;
  }
}

describe('PipelineStore', () => {
  let api: DesktopApiStub;
  let store: PipelineStore;
  let toast: ToastService;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function init(): Promise<void> {
    store.init();
    await vi.waitFor(() => expect(store.recent().state).toBe('ready'));
  }

  beforeEach(() => {
    api = new DesktopApiStub();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DesktopApi, useValue: api }] });
    store = TestBed.inject(PipelineStore);
    toast = TestBed.inject(ToastService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('loads active runs oldest first and recent runs', async () => {
    api.activePage = page([run('bb', 'queued'), run('a', 'running')]);
    api.recentPage = page([run('c', 'succeeded')]);

    await init();

    expect(store.active()).toMatchObject({ state: 'ready' });
    expect(store.active().runs.map((item) => item.id)).toEqual(['a', 'bb']);
    expect(store.recent().runs.map((item) => item.id)).toEqual(['c']);
  });

  it('shows an error slot when loading fails', async () => {
    api.listPipelines.mockRejectedValue(new Error('offline'));

    store.init();
    await vi.waitFor(() => expect(store.active().state).toBe('error'));

    expect(store.active().error).toBe('offline');
  });

  it('removes a finished run from active and opens it from the success toast', async () => {
    api.activePage = page([run('a', 'running')]);
    await init();

    api.update(
      run('a', 'succeeded', { startedAt: '2026-10-20T10:00:00.000Z', finishedAt: '2026-10-20T10:01:00.000Z' }),
    );

    expect(store.active().runs).toEqual([]);
    expect(store.recent().runs.map((item) => item.id)).toEqual(['a']);
    const [shown] = toast.toasts();
    expect(shown).toMatchObject({ kind: 'success', title: 'Pipeline succeeded' });
    shown.action?.run();
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 'a']);
  });

  it('opens the imported novel from the import toast', async () => {
    api.activePage = page([run('a', 'running', { type: 'novel-import', label: 'Book' })]);
    await init();

    api.update(run('a', 'succeeded', { type: 'novel-import', label: 'Book', novelId: 'n1' }));

    const [shown] = toast.toasts();
    expect(shown.kind).toBe('success');
    expect(shown.message).toContain('Book');
    shown.action?.run();
    expect(navigate).toHaveBeenCalledWith(['/library', 'n1']);
  });

  it('shows a danger toast when an export fails', async () => {
    api.activePage = page([run('a', 'running', { type: 'novel-export', label: 'Book' })]);
    await init();

    api.update(run('a', 'failed', { type: 'novel-export', label: 'Book' }));

    expect(toast.toasts()).toMatchObject([{ kind: 'danger' }]);
  });

  it('does not notify for runs that were not running', async () => {
    await init();

    api.update(run('a', 'succeeded'));

    expect(toast.toasts()).toEqual([]);
  });

  it('reloads recent runs after a delete when more exist', async () => {
    const recent: PipelineRun[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => run(id, 'succeeded'));
    api.recentPage = page(recent.slice(0, 5), 6);
    await init();
    api.recentPage = page(recent.slice(1), 5);

    expect(await store.delete(['a'])).toEqual(['a']);

    await vi.waitFor(() => expect(store.recent().runs.map((item) => item.id)).toEqual(['b', 'c', 'd', 'e', 'f']));
  });
});
