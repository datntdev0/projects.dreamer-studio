import { Injectable, computed, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { DEFAULT_READING_SETTINGS, EXPORT_MS, LOADING_MS, isConsecutive, renumber } from './library-format';
import type { ChapterChangeError, DeleteNovelsResult, ImportState } from './library.models';
import type { LibraryChapter, LibraryNovel, LibraryScenario, LibrarySortKey } from './library.models';
import type { LibraryStoreData } from './library.models';
import type { LibraryView } from './library.models';
import type { NovelDetailInitialState } from './library.models';
import type { NovelLock } from './library.models';
import type { SortDirection } from './library.models';
import type { ReadingSettings } from './library.models';
import type { TaskStatus } from './library.models';

const DEFAULT_DETAIL_INITIAL_STATE: NovelDetailInitialState = {
  chapter: null,
  tab: 'reading',
  searchQuery: '',
  searchState: 'idle',
  focusMode: false,
  editing: false,
};

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
  readonly readingSettings = signal<ReadingSettings>({ ...DEFAULT_READING_SETTINGS });
  readonly detailInitialState = signal<NovelDetailInitialState>({ ...DEFAULT_DETAIL_INITIAL_STATE });

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

  setDetailInitialState(state: NovelDetailInitialState): void {
    this.detailInitialState.set({ ...state });
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

  startExport(id: string, onDone: () => void): void {
    const novel: LibraryNovel | null = this.novel(id);
    if (!novel) {
      return;
    }
    const lock: NovelLock = { kind: 'export', runId: `run-${Date.now().toString(16)}`, runLabel: novel.originalTitle };
    this.setLock(id, lock);
    setTimeout(() => {
      this.setLock(id, null);
      onDone();
    }, EXPORT_MS);
  }

  renameChapter(novelId: string, chapterId: string, title: string): ChapterChangeError | null {
    if (!title.trim()) {
      return 'titleRequired';
    }
    return this.changeChapters(novelId, (chapters) =>
      chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, title: title.trim() } : chapter)),
    );
  }

  editChapter(novelId: string, chapterId: string, title: string, paragraphs: string[]): ChapterChangeError | null {
    if (!title.trim()) {
      return 'titleRequired';
    }
    if (!paragraphs.length) {
      return 'contentRequired';
    }
    const error: ChapterChangeError | null = this.changeChapters(novelId, (chapters) =>
      chapters.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, title: title.trim(), chars: paragraphs.join('').length, paragraphCount: paragraphs.length }
          : chapter,
      ),
    );
    if (!error) this.paragraphsByChapter.update((map) => ({ ...map, [chapterId]: [...paragraphs] }));
    return error;
  }

  moveChapters(novelId: string, chapterIds: string[], toIndex: number): ChapterChangeError | null {
    return this.changeChapters(novelId, (chapters) => {
      const moving: LibraryChapter[] = chapters.filter((chapter) => chapterIds.includes(chapter.id));
      const rest: LibraryChapter[] = chapters.filter((chapter) => !chapterIds.includes(chapter.id));
      const index: number = Math.max(0, Math.min(toIndex, rest.length));
      return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
    });
  }

  mergeChapters(novelId: string, chapterIds: string[]): ChapterChangeError | null {
    const selected: LibraryChapter[] = this.chapters(novelId).filter((chapter) => chapterIds.includes(chapter.id));
    if (selected.length < 2 || !isConsecutive(selected)) {
      return 'notConsecutive';
    }
    const [first, ...others] = selected;
    const merged: LibraryChapter = {
      ...first,
      chars: selected.reduce((sum: number, chapter: LibraryChapter): number => sum + chapter.chars, 0),
      paragraphCount: selected.reduce(
        (sum: number, chapter: LibraryChapter): number => sum + chapter.paragraphCount,
        0,
      ),
    };
    const removed: string[] = others.map((chapter: LibraryChapter): string => chapter.id);
    return this.changeChapters(novelId, (chapters) =>
      chapters
        .filter((chapter) => !removed.includes(chapter.id))
        .map((chapter) => (chapter.id === first.id ? merged : chapter)),
    );
  }

  splitChapter(novelId: string, chapterId: string, atParagraph: number, newTitle: string): ChapterChangeError | null {
    const chapter: LibraryChapter | undefined = this.chapters(novelId).find((item) => item.id === chapterId);
    if (!chapter || chapter.paragraphCount < 2 || atParagraph < 1 || atParagraph >= chapter.paragraphCount) {
      return 'tooFewParagraphs';
    }
    if (!newTitle.trim()) {
      return 'titleRequired';
    }
    const ratio: number = atParagraph / chapter.paragraphCount;
    const head: LibraryChapter = { ...chapter, chars: Math.round(chapter.chars * ratio), paragraphCount: atParagraph };
    const tail: LibraryChapter = {
      id: `${chapter.id}-s${Date.now().toString(16)}`,
      position: chapter.position + 1,
      title: newTitle.trim(),
      chars: chapter.chars - head.chars,
      paragraphCount: chapter.paragraphCount - atParagraph,
    };
    return this.changeChapters(novelId, (chapters) =>
      chapters.flatMap((item: LibraryChapter): LibraryChapter[] => (item.id === chapterId ? [head, tail] : [item])),
    );
  }

  deleteChapters(novelId: string, chapterIds: string[]): ChapterChangeError | null {
    return this.changeChapters(novelId, (chapters) => chapters.filter((chapter) => !chapterIds.includes(chapter.id)));
  }

  private changeChapters(
    novelId: string,
    change: (chapters: LibraryChapter[]) => LibraryChapter[],
  ): ChapterChangeError | null {
    if (this.novel(novelId)?.lock) {
      return 'locked';
    }
    const next: LibraryChapter[] = renumber(change(this.chapters(novelId)));
    this.chapterMap.update((map: Record<string, LibraryChapter[]>) => ({ ...map, [novelId]: next }));
    this.updateNovel(novelId, { chapterCount: next.length });
    return null;
  }

  setLock(id: string, lock: NovelLock | null): void {
    this.novels.update((novels: LibraryNovel[]) =>
      novels.map((novel: LibraryNovel): LibraryNovel => (novel.id === id ? { ...novel, lock } : novel)),
    );
  }
}
