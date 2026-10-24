import { Injectable } from '@angular/core';
import { computed } from '@angular/core';
import { signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { LOADING_MS } from './library-format';
import type { ChapterEditorError } from './library.models';
import type { DeleteNovelsResult } from './library.models';
import type { ImportState } from './library.models';
import type { LibraryChapter, LibraryNovel, LibraryScenario, LibrarySortKey } from './library.models';
import type { LibraryStoreData } from './library.models';
import type { LibraryView } from './library.models';
import type { NovelLock } from './library.models';
import type { SortDirection } from './library.models';
import type { TaskStatus } from './library.models';

@Injectable({ providedIn: 'root' })
export class LibraryMockStore {
  readonly scenario = signal<LibraryScenario>('filled');
  readonly loading = signal<boolean>(false);
  readonly novels = signal<LibraryNovel[]>([]);
  readonly view = signal<LibraryView>('grid');
  readonly query = signal<string>('');
  readonly importState = signal<ImportState>('paused');
  readonly sortKey = signal<LibrarySortKey>('updatedAt');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly missingChapterIds = signal<ReadonlySet<string>>(new Set());

  readonly visibleNovels: Signal<LibraryNovel[]> = computed(() => (this.scenario() === 'filled' ? this.novels() : []));

  private readonly chapterMap = signal<Record<string, LibraryChapter[]>>({});
  private sampleParagraphs: string[] = [];
  private readonly paragraphsByChapter = signal<Record<string, string[]>>({});

  load(data: LibraryStoreData): void {
    this.loading.set(false);
    this.novels.set(data.novels.map((novel: LibraryNovel): LibraryNovel => ({ ...novel })));
    this.chapterMap.set(
      Object.fromEntries(
        data.novels.map((novel: LibraryNovel): [string, LibraryChapter[]] => [novel.id, data.makeChapters(novel)]),
      ),
    );
    this.sampleParagraphs = [...data.sampleParagraphs];
    this.paragraphsByChapter.set(
      Object.fromEntries(
        Object.entries(data.paragraphsByChapter).map(([id, paragraphs]: [string, string[]]): [string, string[]] => [
          id,
          [...paragraphs],
        ]),
      ),
    );
    this.missingChapterIds.set(new Set());
  }

  taskStatus(novel: LibraryNovel): TaskStatus {
    if (novel.id !== 'n-0006') return novel.taskStatus;
    switch (this.importState()) {
      case 'importing':
      case 'queued':
      case 'more':
        return 'running';
      case 'done':
        return 'completed';
      case 'incomplete':
      case 'paused':
        return 'paused';
    }
  }

  setScenario(scenario: LibraryScenario): void {
    this.scenario.set(scenario);
  }

  simulateLoading(): void {
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), LOADING_MS);
  }

  novel(id: string): LibraryNovel | null {
    return this.novels().find((novel: LibraryNovel): boolean => novel.id === id) ?? null;
  }

  chapters(novelId: string): LibraryChapter[] {
    return this.chapterMap()[novelId] ?? [];
  }

  paragraphs(chapter: LibraryChapter): string[] {
    const paragraphs: string[] | undefined = this.paragraphsByChapter()[chapter.id];
    if (paragraphs) return paragraphs;
    return Array.from(
      { length: chapter.paragraphCount },
      (_, index: number): string => this.sampleParagraphs[(chapter.position + index) % this.sampleParagraphs.length],
    );
  }

  allTags(): string[] {
    return [...new Set(this.visibleNovels().flatMap((novel: LibraryNovel): string[] => novel.tags))].sort();
  }

  updateNovel(id: string, patch: Partial<LibraryNovel>): 'locked' | null {
    if (this.novel(id)?.lock) {
      return 'locked';
    }
    const updatedAt: string = new Date().toISOString();
    this.novels.update((novels: LibraryNovel[]) =>
      novels.map((novel: LibraryNovel): LibraryNovel => (novel.id === id ? { ...novel, ...patch, updatedAt } : novel)),
    );
    return null;
  }

  deleteNovels(ids: string[]): DeleteNovelsResult {
    const targets: LibraryNovel[] = this.novels().filter((novel: LibraryNovel): boolean => ids.includes(novel.id));
    const skipped: LibraryNovel[] = targets.filter((novel: LibraryNovel): boolean => !!novel.lock);
    const deleted: string[] = targets.filter((novel: LibraryNovel): boolean => !novel.lock).map((novel) => novel.id);
    this.novels.update((novels: LibraryNovel[]) => novels.filter((novel: LibraryNovel) => !deleted.includes(novel.id)));
    return { deleted, skipped };
  }

  editChapter(novelId: string, chapterId: string, title: string, paragraphs: string[]): ChapterEditorError | null {
    if (this.novel(novelId)?.lock) {
      return 'locked';
    }
    if (!title.trim()) {
      return 'titleRequired';
    }
    if (!paragraphs.length) {
      return 'contentRequired';
    }
    this.chapterMap.update((map: Record<string, LibraryChapter[]>) => ({
      ...map,
      [novelId]: this.chapters(novelId).map((chapter: LibraryChapter): LibraryChapter =>
        chapter.id === chapterId
          ? { ...chapter, title: title.trim(), chars: paragraphs.join('').length, paragraphCount: paragraphs.length }
          : chapter,
      ),
    }));
    this.paragraphsByChapter.update((map: Record<string, string[]>): Record<string, string[]> => ({
      ...map,
      [chapterId]: [...paragraphs],
    }));
    this.updateNovel(novelId, { chapterCount: this.chapters(novelId).length });
    return null;
  }

  setLock(id: string, lock: NovelLock | null): void {
    this.novels.update((novels: LibraryNovel[]) =>
      novels.map((novel: LibraryNovel): LibraryNovel => (novel.id === id ? { ...novel, lock } : novel)),
    );
  }
}
