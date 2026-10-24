import { computed } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { inject } from '@angular/core';
import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import type { Signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { DesktopApi } from '@core/desktop-api';
import type { SearchHit } from '@dreamer/shared/models/novel';
import type { SearchProgress } from '@dreamer/shared/models/novel';
import type { LibraryChapter } from './library.models';
import type { SearchChapterResult } from './library.models';

@Injectable()
export class NovelSearchStore {
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly hits = signal<SearchHit[]>([]);
  private readonly chapters = signal<LibraryChapter[]>([]);
  private searchId: string | null = null;
  private novelId: string = '';
  private chapterKey: string = '';

  readonly query = signal<string>('');
  readonly value: WritableSignal<string> = signal<string>('');
  readonly done = signal<number>(0);
  readonly total = signal<number>(0);
  readonly totalHits = signal<number>(0);
  readonly totalChapters = signal<number>(0);
  readonly running = signal<boolean>(false);
  readonly complete = signal<boolean>(false);
  readonly results: Signal<SearchChapterResult[]> = computed(() => {
    const byChapter: Map<string, SearchHit[]> = new Map();
    const chapters: LibraryChapter[] = this.chapters();
    const current: Map<string, LibraryChapter> = new Map(
      chapters.map((chapter: LibraryChapter): [string, LibraryChapter] => [
        `${chapter.position}:${chapter.file}`,
        chapter,
      ]),
    );
    for (const hit of this.hits()) {
      const chapter: LibraryChapter | undefined = current.get(`${hit.position}:${hit.file}`);
      if (!chapter) continue;
      const hits: SearchHit[] = byChapter.get(chapter.id) ?? [];
      hits.push(hit);
      byChapter.set(chapter.id, hits);
    }
    return chapters.flatMap((chapter: LibraryChapter): SearchChapterResult[] => {
      const hits: SearchHit[] | undefined = byChapter.get(chapter.id);
      return hits ? [{ chapter, hits }] : [];
    });
  });

  constructor() {
    const offProgress: () => void = this.api.onSearchProgress((progress: SearchProgress): void => {
      if (progress.searchId !== this.searchId) return;
      this.hits.update((hits: SearchHit[]): SearchHit[] => [...hits, ...progress.hits]);
      this.done.set(progress.done);
      this.total.set(progress.total);
      this.totalHits.set(progress.totalHits);
      this.totalChapters.set(progress.totalChapters);
      if (progress.finished) {
        this.searchId = null;
        this.running.set(false);
        this.complete.set(true);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      offProgress();
      this.cancel();
    });
  }

  setContext(novelId: string, chapters: LibraryChapter[]): void {
    const key: string = JSON.stringify(
      chapters.map((chapter: LibraryChapter): unknown[] => [chapter.position, chapter.file, chapter.title]),
    );
    const novelChanged: boolean = this.novelId !== novelId;
    const chaptersChanged: boolean = this.chapterKey !== key;
    this.novelId = novelId;
    this.chapterKey = key;
    this.chapters.set(chapters);
    if (novelChanged) this.clear();
    else if (chaptersChanged && this.query()) this.start(novelId, this.query());
  }

  start(novelId: string, value: string): void {
    const query: string = value.trim();
    if (!query) {
      this.clear();
      return;
    }
    this.cancel();
    const searchId: string = crypto.randomUUID();
    this.searchId = searchId;
    this.query.set(query);
    this.hits.set([]);
    this.done.set(0);
    this.total.set(this.chapters().length);
    this.totalHits.set(0);
    this.totalChapters.set(0);
    this.complete.set(false);
    this.running.set(true);
    void this.api.search({ novelId, query, searchId }).catch((): void => {
      if (this.searchId !== searchId) return;
      this.searchId = null;
      this.running.set(false);
      this.complete.set(true);
    });
  }

  cancel(): void {
    const searchId: string | null = this.searchId;
    this.searchId = null;
    this.running.set(false);
    if (searchId) void this.api.cancelSearch(searchId).catch((): void => undefined);
  }

  clear(): void {
    this.cancel();
    this.query.set('');
    this.value.set('');
    this.done.set(0);
    this.total.set(0);
    this.totalHits.set(0);
    this.totalChapters.set(0);
    this.hits.set([]);
    this.complete.set(false);
  }
}
