import { Publication } from './novel-package';

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
  lock: null;
}

export interface NovelDetail extends NovelSummary {
  description: string;
}

export interface LibraryChangedEvent {
  novelIds: string[];
}
