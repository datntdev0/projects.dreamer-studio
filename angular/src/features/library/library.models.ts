import type { SearchHit } from '@dreamer/shared/models/novel';

export type LibraryScenario = 'filled' | 'empty' | 'error';

export type LibraryView = 'grid' | 'list';

export type LibrarySortKey = 'updatedAt' | 'importedAt' | 'title' | 'author' | 'chapterCount';

export type SortDirection = 'asc' | 'desc';

export type ImportState = 'importing' | 'paused' | 'queued' | 'more' | 'incomplete' | 'done';

export type TaskStatus = 'running' | 'paused' | 'completed' | 'completedEarly' | 'none';

export type NovelLockKind = 'export' | 'import';

export interface NovelLock {
  kind: NovelLockKind;
  runId: string;
  runLabel: string;
}

export interface LibraryNovel {
  id: string;
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  descriptionVi: string;
  language: string;
  tags: string[];
  cover: string | null;
  chapterCount: number;
  importedAt: string;
  updatedAt: string;
  lock: NovelLock | null;
  publication: 'ongoing' | 'completed';
  characterCount: string;
  analysedCount: number;
  translatedCount: number;
  taskStatus: TaskStatus;
  appTags: string[];
  source: string;
  folder: string;
  coverPalette: string;
}

export interface LibraryChapter {
  id: string;
  position: number;
  title: string;
  file: string;
  chars: number;
  paragraphCount: number;
}

export interface DeleteNovelsResult {
  deleted: string[];
  skipped: LibraryNovel[];
}

export type ChapterChangeError = 'locked' | 'notConsecutive' | 'tooFewParagraphs' | 'titleRequired' | 'contentRequired';

export type MoveMode = 'position' | 'before';

export type ChapterDialogKind = 'merge' | 'split' | 'delete' | 'move';

export interface ChapterDialogState {
  kind: ChapterDialogKind;
  chapters: LibraryChapter[];
}

export interface DragState {
  ids: string[];
  target: number;
  pointer: boolean;
}

export interface RenameState {
  id: string;
  value: string;
  error: boolean;
}

export interface MenuState {
  id: string;
  top: number | null;
  bottom: number | null;
  right: number;
}

export interface TextParts {
  pre: string;
  hit: string;
  post: string;
}

export interface ReaderHighlight {
  chapterId: string;
  query: string;
  paragraph: number | null;
  occurrence: number;
}

export interface SearchChapterResult {
  chapter: LibraryChapter;
  hits: SearchHit[];
}

export type NovelTab = 'reading' | 'search';

export type NovelSearchState = 'idle' | 'running' | 'results' | 'none';

export type PageState = 'loading' | 'error' | 'notFound' | 'ready';

export interface LibraryStoreData {
  novels: LibraryNovel[];
  sampleParagraphs: string[];
  paragraphsByChapter: Record<string, string[]>;
  makeChapters: (novel: LibraryNovel) => LibraryChapter[];
}
