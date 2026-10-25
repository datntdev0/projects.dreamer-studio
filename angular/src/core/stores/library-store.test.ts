import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from '../desktop-api';
import { LibraryStore } from './library-store';
import { PipelineStore } from './pipeline-store';

const STORAGE_KEY = 'dreamer.library.browse';

function novel(id: string, lock: NovelSummary['lock'] = null): NovelSummary {
  return { id, title: id, lock } as NovelSummary;
}

class DesktopApiStub {
  update: (run: PipelineRun) => void = () => undefined;
  readonly listNovels = vi.fn(async (): Promise<NovelSummary[]> => [novel('n1')]);
  onLibraryChanged(): () => void {
    return () => undefined;
  }
  onAppDataChanged(): () => void {
    return () => undefined;
  }
  onPipelineUpdate(listener: (run: PipelineRun) => void): () => void {
    this.update = listener;
    return () => undefined;
  }
}

describe('LibraryStore', () => {
  let api: DesktopApiStub;

  function createStore(): LibraryStore {
    api = new DesktopApiStub();
    const active = signal({
      state: 'ready',
      runs: [
        { id: 'r1', type: 'novel-import' },
        { id: 'r2', type: 'demo' },
      ],
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: DesktopApi, useValue: api },
        { provide: PipelineStore, useValue: { active } },
      ],
    });
    return TestBed.inject(LibraryStore);
  }

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('restores valid browse preferences and saves changes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: 'list', sortKey: 'bad', sortDirection: 'asc' }));
    const store: LibraryStore = createStore();

    expect([store.view(), store.sortKey(), store.sortDirection()]).toEqual(['list', 'updatedAt', 'asc']);
    expect(store.pending().map((run) => run.id)).toEqual(['r1']);
    store.sortKey.set('title');
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      view: 'list',
      sortKey: 'title',
      sortDirection: 'asc',
    });
  });

  it('loads once and reports a failed reload', async () => {
    const store: LibraryStore = createStore();

    await store.load();
    await store.load();
    expect(api.listNovels).toHaveBeenCalledTimes(1);
    expect(store.state()).toBe('ready');

    api.listNovels.mockRejectedValueOnce(new Error('disk'));
    await store.reload();
    expect([store.state(), store.error()]).toEqual(['error', 'disk']);
  });

  it('reloads when a run locks or unlocks a listed novel', async () => {
    const store: LibraryStore = createStore();
    await store.load();
    api.listNovels.mockClear();

    api.update({ id: 'r9', novelId: 'other', status: 'running' } as PipelineRun);
    api.update({ id: 'r9', novelId: 'n1', status: 'succeeded' } as PipelineRun);
    expect(api.listNovels).not.toHaveBeenCalled();

    api.update({ id: 'r9', novelId: 'n1', status: 'running' } as PipelineRun);
    expect(api.listNovels).toHaveBeenCalledTimes(1);
  });
});
