import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppInfoStore } from '../app-info';
import { RecentNovelStore } from './recent-novel-store';

const FIRST = 'dreamer.recentNovels.test-first';
const SECOND = 'dreamer.recentNovels.test-second';

afterEach(() => {
  localStorage.removeItem(FIRST);
  localStorage.removeItem(SECOND);
  TestBed.resetTestingModule();
});

describe('RecentNovelStore', () => {
  it('keeps five opened novels in order and scopes them to app data', () => {
    const info = signal({ appDataDir: 'test-first' });
    TestBed.configureTestingModule({
      providers: [RecentNovelStore, { provide: AppInfoStore, useValue: { info } }],
    });
    const store = TestBed.inject(RecentNovelStore);
    TestBed.tick();

    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'c']) store.record(id);
    expect(store.entries().map((entry) => entry.id)).toEqual(['c', 'f', 'e', 'd', 'b']);
    expect(JSON.parse(localStorage.getItem(FIRST) ?? '[]').map((entry: { id: string }) => entry.id)).toEqual([
      'c',
      'f',
      'e',
      'd',
      'b',
    ]);

    info.set({ appDataDir: 'test-second' });
    TestBed.tick();
    expect(store.entries()).toEqual([]);
    store.record('other');
    info.set({ appDataDir: 'test-first' });
    TestBed.tick();
    expect(store.entries().map((entry) => entry.id)).toEqual(['c', 'f', 'e', 'd', 'b']);
  });
});
