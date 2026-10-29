import { CoverMime, Publication } from './novel-package';

export const NOVEL_STORE_VERSION: number = 1;

export const NOVEL_METADATA_FILE: string = 'metadata.json';

export const NOVEL_CHAPTERS_DIR: string = 'chapters';
export const ANALYSIS_DIR: string = 'analysis';
export const TRANSLATION_DIR: string = 'translation';

export type NovelCoverFile = 'cover.jpg' | 'cover.png';

export const COVER_FILES: Record<CoverMime, NovelCoverFile> = { 'image/jpeg': 'cover.jpg', 'image/png': 'cover.png' };

export interface NovelChapterEntry {
  title: string;
  file: string;
  paragraphs: number;
  chars: number;
}

export interface NovelMetadata {
  formatVersion: number;
  id: string;
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  language: string;
  publication: Publication;
  tags: string[];
  cover: NovelCoverFile | null;
  importedAt: string;
  updatedAt: string;
  chapters: NovelChapterEntry[];
}

export function isNovelId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function isContentHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function normalizeTags(tags: string[]): string[] {
  const normalized: string[] = [];
  const seen: Set<string> = new Set();
  tags.forEach((tag: string): void => {
    const trimmed: string = tag.trim();
    const folded: string = trimmed.toLocaleLowerCase('en-US');
    if (trimmed && !seen.has(folded)) {
      seen.add(folded);
      normalized.push(trimmed);
    }
  });
  return normalized;
}

export function parseNovelMetadata(value: unknown): NovelMetadata | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.formatVersion !== NOVEL_STORE_VERSION ||
    typeof value.id !== 'string' ||
    !isNovelId(value.id) ||
    typeof value.originalTitle !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.author !== 'string' ||
    typeof value.description !== 'string' ||
    !isNonEmptyString(value.language) ||
    !isPublication(value.publication) ||
    !isStringArray(value.tags) ||
    !isCover(value.cover) ||
    !isDateString(value.importedAt) ||
    !isDateString(value.updatedAt) ||
    !Array.isArray(value.chapters)
  ) {
    return null;
  }
  const chapters: NovelChapterEntry[] = [];
  const rawChapters: unknown[] = value.chapters;
  for (const chapter of rawChapters) {
    const parsed: NovelChapterEntry | null = parseChapter(chapter);
    if (parsed === null) {
      return null;
    }
    chapters.push(parsed);
  }
  return {
    formatVersion: NOVEL_STORE_VERSION,
    id: value.id,
    originalTitle: value.originalTitle,
    title: value.title,
    author: value.author,
    description: value.description,
    language: value.language,
    publication: value.publication,
    tags: [...value.tags],
    cover: value.cover,
    importedAt: value.importedAt,
    updatedAt: value.updatedAt,
    chapters,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPublication(value: unknown): value is Publication {
  return value === 'ongoing' || value === 'completed';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string');
}

function isCover(value: unknown): value is NovelCoverFile | null {
  return value === null || value === 'cover.jpg' || value === 'cover.png';
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseChapter(value: unknown): NovelChapterEntry | null {
  if (
    !isRecord(value) ||
    typeof value.title !== 'string' ||
    typeof value.file !== 'string' ||
    !isContentHash(value.file) ||
    !isCount(value.paragraphs) ||
    !isCount(value.chars)
  ) {
    return null;
  }
  return { title: value.title, file: value.file, paragraphs: value.paragraphs, chars: value.chars };
}
