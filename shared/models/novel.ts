import { Publication } from './novel-package';
import { PipelineRunStatus, PipelineType } from './pipeline';

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
  lock: NovelLock | null;
}

export interface NovelChapter {
  position: number;
  title: string;
  file: string;
  paragraphs: number;
  chars: number;
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

export interface DeleteNovelsResult {
  deleted: string[];
  skipped: string[];
}

export interface LibraryChangedEvent {
  novelIds: string[];
}
