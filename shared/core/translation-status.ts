import { chapterQueue, ChapterMatch, matchChapters } from './analysis-plan';
import { glossaryKeyId } from './glossary';
import { ContentRunOptions } from '../models/translation';
import { ChapterTranslationStatus, ChapterTranslationSummary } from '../models/translation';
import { GlossaryEntry, TranslationIndexEntry, TranslationIndexFile } from '../models/translation';
import { NovelChapterEntry } from '../models/novel-store';

function glossaryChanged(entry: TranslationIndexEntry, translations: Map<string, string>): boolean {
  return entry.glossaryUsed.some(
    ({ key, translation }): boolean => (translations.get(glossaryKeyId(key)) ?? null) !== translation,
  );
}

function chapterStatus(
  match: ChapterMatch<TranslationIndexEntry> | undefined,
  translations: Map<string, string>,
): ChapterTranslationStatus {
  if (!match) return 'not-translated';
  if (match.stale) return 'stale';
  if (match.entry.error !== undefined) return 'failed';
  if (glossaryChanged(match.entry, translations)) return 'stale';
  return match.entry.issues > 0 ? 'has-issues' : 'translated';
}

export function chapterTranslationStatuses(
  chapters: NovelChapterEntry[],
  index: TranslationIndexFile | null,
  glossary: GlossaryEntry[],
  instructionHash: string,
): ChapterTranslationSummary[] {
  const matches: Map<number, ChapterMatch<TranslationIndexEntry>> = new Map(
    matchChapters(index?.chapters ?? [], chapters).map(
      (match: ChapterMatch<TranslationIndexEntry>): [number, ChapterMatch<TranslationIndexEntry>] => [
        match.index,
        match,
      ],
    ),
  );
  const translations: Map<string, string> = new Map(
    glossary.map((entry: GlossaryEntry): [string, string] => [glossaryKeyId(entry), entry.translation]),
  );
  return chapters.map((chapter: NovelChapterEntry, position: number): ChapterTranslationSummary => {
    const number: number = position + 1;
    const match: ChapterMatch<TranslationIndexEntry> | undefined = matches.get(number);
    const entry: TranslationIndexEntry | undefined = match?.entry;
    const status: ChapterTranslationStatus = chapterStatus(match, translations);
    const translated: TranslationIndexEntry | undefined = entry?.error === undefined ? entry : undefined;
    return {
      index: number,
      file: chapter.file,
      title: translated?.title ?? null,
      status,
      issues: translated?.issues ?? 0,
      edited: translated?.edited ?? false,
      staleReason: status === 'stale' ? (match?.stale ? 'source' : 'glossary') : null,
      instructionChanged: translated !== undefined && translated.instructionHash !== instructionHash,
      error: status === 'failed' ? (entry?.error ?? null) : null,
    };
  });
}

export function translatedCount(statuses: ChapterTranslationSummary[]): number {
  return statuses.filter(
    (status: ChapterTranslationSummary): boolean => status.status === 'translated' || status.status === 'has-issues',
  ).length;
}

export function contentRunQueue(options: ContentRunOptions, statuses: ChapterTranslationSummary[]): number[] {
  return chapterQueue(
    options,
    statuses,
    (status: ChapterTranslationSummary): boolean =>
      status.status === 'not-translated' || status.status === 'stale' || status.status === 'failed',
  );
}
