import { Publication } from './novel-package';
import { PipelineRunStatus, PipelineType } from './pipeline';
import type { TranslationLanguageSummary } from './translation';

export interface NovelLock {
  runId: string;
  type: PipelineType;
  label: string | null;
  status: PipelineRunStatus;
}

export interface NovelSummary {
  id: string;
  originalTitle: string;
  title: string;
  author: string;
  language: string;
  publication: Publication;
  tags: string[];
  chapterCount: number;
  charCount: number;
  importedAt: string;
  updatedAt: string;
  hasCover: boolean;
  translations: TranslationLanguageSummary[];
  analysis: NovelAnalysisSummary;
  lock: NovelLock | null;
}

export interface NovelAnalysisSummary {
  analysed: number;
  total: number;
}

export interface NovelChapter {
  position: number;
  title: string;
  file: string;
  paragraphs: number;
  chars: number;
}

export const CHAPTER_TITLE_MAX: number = 200;

export interface ChapterRef {
  position: number;
  file: string;
}

export type ChapterChange =
  | { kind: 'rename'; chapter: ChapterRef; title: string }
  | { kind: 'edit'; chapter: ChapterRef; title: string; paragraphs: string[] }
  | { kind: 'move'; chapters: ChapterRef[]; toIndex: number }
  | { kind: 'merge'; chapters: ChapterRef[] }
  | { kind: 'split'; chapter: ChapterRef; atParagraph: number; title: string }
  | { kind: 'delete'; chapters: ChapterRef[] }
  | { kind: 'replace'; chapters: ChapterRef[]; query: string; replacement: string };

export interface ChapterChangeRequest {
  novelId: string;
  change: ChapterChange;
}

export interface NovelDetail extends NovelSummary {
  description: string;
  chapters: NovelChapter[];
}

export type NovelCoverPatch = 'keep' | 'remove' | { path: string };

export interface NovelPatch {
  originalTitle?: string;
  title?: string;
  author?: string;
  language?: string;
  publication?: Publication;
  tags?: string[];
  description?: string;
  cover?: NovelCoverPatch;
}

export interface NovelUpdateRequest {
  id: string;
  patch: NovelPatch;
}

export interface ChapterRequest {
  novelId: string;
  file: string;
}

export interface ChapterText {
  paragraphs: string[];
}

export interface SearchRequest {
  novelId: string;
  query: string;
  searchId: string;
}

export interface SearchHit {
  position: number;
  file: string;
  paragraph: number | null;
  pre: string;
  hit: string;
  post: string;
}

export interface SearchProgress {
  searchId: string;
  done: number;
  total: number;
  hits: SearchHit[];
  totalHits: number;
  totalChapters: number;
  finished: boolean;
}

export interface DeleteNovelsResult {
  deleted: string[];
  skipped: string[];
}

export interface LibraryChangedEvent {
  novelIds: string[];
}
