import type { TranslateParams } from '@dreamer/shared/i18n/translate';

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
  chars: number;
  paragraphCount: number;
}

export interface DeleteNovelsResult {
  deleted: string[];
  skipped: LibraryNovel[];
}

export type ChapterChangeError = 'locked' | 'notConsecutive' | 'tooFewParagraphs' | 'titleRequired' | 'contentRequired';

export type MoveMode = 'position' | 'before';

export type DeleteMode = 'one' | 'many' | 'blocked';

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
}

export interface ReadingSettings {
  font: 'serif' | 'sans';
  size: number;
  leading: number;
  width: number;
}

export interface SearchHit {
  chapterId: string;
  paragraph: number | null;
  pre: string;
  hit: string;
  post: string;
}

export interface SearchChapterResult {
  chapter: LibraryChapter;
  hits: SearchHit[];
}

export type RequiredField = 'originalTitle' | 'title' | 'language';

export type TextField = RequiredField | 'author' | 'description';

export type NovelTab = 'reading' | 'search';

export type NovelSearchState = 'idle' | 'running' | 'results' | 'none';

export interface NovelDetailInitialState {
  chapter: number | null;
  tab: NovelTab;
  searchQuery: string;
  searchState: NovelSearchState;
  focusMode: boolean;
  editing: boolean;
}

export type PageState = 'loading' | 'error' | 'notFound' | 'ready';

export interface NovelDraft {
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  language: string;
  tags: string[];
  cover: string | null;
  publication: 'ongoing' | 'completed';
}

export interface CoverSample {
  name: string;
  size: number;
  type: string;
  url: string | null;
}

export interface CoverError {
  key: string;
  params: TranslateParams;
}

export interface LanguageOption {
  code: string;
  label: string;
}

export interface LibraryStoreData {
  novels: LibraryNovel[];
  sampleParagraphs: string[];
  paragraphsByChapter: Record<string, string[]>;
  makeChapters: (novel: LibraryNovel) => LibraryChapter[];
}
