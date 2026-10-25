import { TestBed } from '@angular/core/testing';
import type { PipelineCursor, PipelineListQuery, PipelinePage, PipelineRun } from '@dreamer/shared/models/pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from '@core/desktop-api';
import { PipelinesViewStore } from './pipelines-view.store';

const CURSOR: PipelineCursor = { createdAt: '2026-10-20T10:00:00.000Z', id: 'b' };

function run(id: string, status: PipelineRun['status'], type: PipelineRun['type'] = 'demo'): PipelineRun {
  return {
    id,
    type,
    status,
    cancelReason: null,
    progress: 100,
    stepIndex: 5,
    stepCount: 5,
    stepName: null,
    errorCode: null,
    error: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    label: null,
    novelId: null,
  };
}

class DesktopApiStub {
  update: (run: PipelineRun) => void = () => undefined;
  deleted: (ids: string[]) => void = () => undefined;
  readonly listPipelines = vi.fn<(query: PipelineListQuery) => Promise<PipelinePage>>();
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

describe('PipelinesViewStore', () => {
  let api: DesktopApiStub;
  let store: PipelinesViewStore;

  function ids(): string[] {
    return store.history().runs.map((item) => item.id);
  }

  beforeEach(async () => {
    api = new DesktopApiStub();
    api.listPipelines.mockResolvedValue({ runs: [run('a', 'succeeded'), run('b', 'failed')], total: 3, next: CURSOR });
    TestBed.configureTestingModule({ providers: [{ provide: DesktopApi, useValue: api }] });
    store = TestBed.inject(PipelinesViewStore);
    await vi.waitFor(() => expect(store.history().state).toBe('ready'));
  });

  it('reloads finished runs with the selected filters', async () => {
    store.setStatus('failed');
    store.setType('novel-import');

    expect(api.listPipelines).toHaveBeenLastCalledWith({
      finished: true,
      statuses: ['failed'],
      types: ['novel-import'],
      limit: 50,
      after: null,
    });
    expect(store.filtered()).toBe(true);
    store.clearFilters();
    expect(store.filtered()).toBe(false);
  });

  it('shows an error when the list fails', async () => {
    api.listPipelines.mockRejectedValueOnce(new Error('offline'));

    await store.reload();

    expect(store.history()).toMatchObject({ state: 'error', error: 'offline', runs: [] });
  });

  it('loads the next page without duplicates', async () => {
    api.listPipelines.mockResolvedValueOnce({
      runs: [run('b', 'failed'), run('c', 'cancelled')],
      total: 3,
      next: null,
    });

    await store.loadMore();

    expect(api.listPipelines).toHaveBeenLastCalledWith(expect.objectContaining({ after: CURSOR }));
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(store.history()).toMatchObject({ next: null, loadingMore: false });
  });

  it('adds finished runs that match the filters and replaces loaded ones', () => {
    api.update(run('x', 'running'));
    api.update(run('y', 'succeeded'));
    api.update({ ...run('a', 'succeeded'), label: 'Renamed' });

    expect(ids()).toEqual(['y', 'a', 'b']);
    expect(store.history().total).toBe(4);
    expect(store.history().runs[1].label).toBe('Renamed');
  });

  it('removes deleted runs and their check marks', () => {
    store.checkLoaded(true);
    expect(store.isChecked('a')).toBe(true);

    api.deleted(['a']);

    expect(ids()).toEqual(['b']);
    expect(store.history().total).toBe(2);
    expect([...store.checked()]).toEqual(['b']);
    store.toggle('b', false);
    expect(store.checked().size).toBe(0);
  });
});
