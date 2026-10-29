import { mkdir } from 'node:fs/promises';
import { alignIndex, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { glossaryKeyId } from '@dreamer/shared/core/glossary';
import { contentHash } from '@dreamer/shared/core/novel-text';
import { checkTranslation } from '@dreamer/shared/core/translation-check';
import { chapterTranslationStatuses, translatedCount } from '@dreamer/shared/core/translation-status';
import { LibraryChannel, TranslationChannel } from '@dreamer/shared/ipc/channels';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { ChapterTranslation } from '@dreamer/shared/models/translation';
import { ChapterTranslationFile, ChapterTranslationSummary } from '@dreamer/shared/models/translation';
import { TranslationIssue } from '@dreamer/shared/models/translation';
import { GlossaryRow, GlossaryUsed } from '@dreamer/shared/models/translation';
import { TranslationIndexEntry, TranslationIndexFile } from '@dreamer/shared/models/translation';
import { TranslationLanguageSummary } from '@dreamer/shared/models/translation';
import { isPlainObject } from '@dreamer/shared/models/validation';
import { TargetLanguage } from '@dreamer/shared/models/translation';
import { broadcast } from '../../ipc/broadcast';
import { createLogger, Logger } from '../../logging/logger';
import { readReviewParagraphs } from '../analysis/analysis-files';
import { AnalysisSnapshots } from '../analysis/analysis-snapshot';
import { asWriteError, readJsonFile } from '../library/library-io';
import { NovelFolder } from '../library/library-files';
import { readMetadata, withNovelLock, writeFileAtomic } from '../library/novel/novel-files';
import { loadGlossaryRows, readGlossary } from './translation-glossary';
import { translationChapterFile, translationChaptersDir } from './translation-files';
import { translationIndexFile, translationLanguageDir } from './translation-files';
import { loadInstruction } from './translation-instruction';

const logger: Logger = createLogger('translation');

export function readTranslationIndex(folder: NovelFolder, language: TargetLanguage): TranslationIndexFile | null {
  const file: string = translationIndexFile(folder, language);
  const parsed: unknown = readJsonFile(file, logger);
  if (parsed === undefined) return null;
  if (!isPlainObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.chapters)) {
    logger.warn(`translation index invalid: ${file}`);
    return null;
  }
  return parsed as unknown as TranslationIndexFile;
}

export function readChapterTranslation(
  folder: NovelFolder,
  language: TargetLanguage,
  file: string,
): ChapterTranslationFile | null {
  const path: string = translationChapterFile(folder, language, file);
  const parsed: unknown = readJsonFile(path, logger);
  if (parsed === undefined) return null;
  if (!isPlainObject(parsed) || parsed.version !== 1 || parsed.file !== file || !Array.isArray(parsed.paragraphs)) {
    logger.warn(`translation chapter invalid: ${path}`);
    return null;
  }
  return parsed as unknown as ChapterTranslationFile;
}

export async function saveTranslationEntry(
  folder: NovelFolder,
  language: TargetLanguage,
  chapters: { file: string }[],
  entry: TranslationIndexEntry,
  result?: ChapterTranslationFile,
): Promise<void> {
  try {
    if (result !== undefined) {
      await mkdir(translationChaptersDir(folder, language), { recursive: true });
      await writeFileAtomic(
        translationChapterFile(folder, language, result.file),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
    await mkdir(translationLanguageDir(folder, language), { recursive: true });
    const empty: TranslationIndexFile = { version: 1, chapters: [] };
    const index: TranslationIndexFile = alignIndex(readTranslationIndex(folder, language) ?? empty, chapters);
    const updated: TranslationIndexFile = upsertIndexEntry(index, entry);
    await writeFileAtomic(translationIndexFile(folder, language), `${JSON.stringify(updated, null, 2)}\n`);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

export function instructionHash(text: string): Promise<string> {
  return contentHash(text);
}

export async function chapterStatusesFor(
  folder: NovelFolder,
  novel: NovelMetadata,
  language: TargetLanguage,
): Promise<ChapterTranslationSummary[]> {
  const instruction = await loadInstruction(folder, novel.id, language);
  return chapterTranslationStatuses(
    novel.chapters,
    readTranslationIndex(folder, language),
    readGlossary(folder, language),
    await instructionHash(instruction.text),
  );
}

export async function chapterTranslation(
  folder: NovelFolder,
  novel: NovelMetadata,
  language: TargetLanguage,
  file: string,
): Promise<ChapterTranslation | null> {
  const summary: ChapterTranslationSummary | undefined = (await chapterStatusesFor(folder, novel, language)).find(
    (chapter: ChapterTranslationSummary): boolean => chapter.file === file,
  );
  if (summary === undefined) return null;
  const stored: ChapterTranslationFile | null =
    summary.status === 'not-translated' || summary.status === 'failed'
      ? null
      : readChapterTranslation(folder, language, file);
  return {
    ...summary,
    language,
    title: stored?.title ?? '',
    paragraphs: stored?.paragraphs ?? [],
    issueList: stored?.issues ?? [],
    translatedAt: stored?.translatedAt ?? null,
  };
}

export interface ChapterTranslationInput {
  source: { title: string; paragraphs: string[] };
  translation: { title: string; paragraphs: string[] };
  names: GlossaryUsed[];
  index: number;
  file: string;
  edited: boolean;
  instructionHash: string;
  translatedAt: string;
}

export interface ChapterTranslationBuild {
  entry: TranslationIndexEntry;
  result: ChapterTranslationFile;
  issues: TranslationIssue[];
}

export function buildChapterTranslation(input: ChapterTranslationInput): ChapterTranslationBuild {
  const { names, index, file, edited, instructionHash, translatedAt } = input;
  const issues: TranslationIssue[] = checkTranslation({ source: input.source, translation: input.translation, names });
  return {
    entry: {
      index,
      file,
      edited,
      instructionHash,
      title: input.translation.title,
      issues: issues.length,
      glossaryUsed: names,
      translatedAt,
    },
    result: { version: 1, file, ...input.translation, issues, translatedAt },
    issues,
  };
}

export function languageSummary(
  folder: NovelFolder,
  novel: NovelMetadata,
  language: TargetLanguage,
): TranslationLanguageSummary {
  const statuses: ChapterTranslationSummary[] = chapterTranslationStatuses(
    novel.chapters,
    readTranslationIndex(folder, language),
    readGlossary(folder, language),
    '',
  );
  return { language, translated: translatedCount(statuses), total: novel.chapters.length };
}

export async function recheckChapters(
  folder: NovelFolder,
  novel: NovelMetadata,
  language: TargetLanguage,
  rows: GlossaryRow[],
  changed: Set<string>,
): Promise<number> {
  const index: TranslationIndexFile | null = readTranslationIndex(folder, language);
  if (index === null) return 0;
  const chapters: Map<string, { title: string }> = new Map(
    novel.chapters.map((chapter): [string, { title: string }] => [chapter.file, { title: chapter.title }]),
  );
  const namesById: Map<string, GlossaryUsed> = new Map(
    rows.map((row: GlossaryRow): [string, GlossaryUsed] => [
      glossaryKeyId(row),
      {
        key: { entityType: row.entityType, entityName: row.entityName, term: row.term, kind: row.kind },
        translation: row.translation,
      },
    ]),
  );
  let rechecked: number = 0;
  for (const entry of index.chapters) {
    const chapter: { title: string } | undefined = chapters.get(entry.file);
    if (
      entry.error !== undefined ||
      chapter === undefined ||
      !entry.glossaryUsed.some((name: GlossaryUsed): boolean => changed.has(glossaryKeyId(name.key)))
    ) {
      continue;
    }
    const translation: ChapterTranslationFile | null = readChapterTranslation(folder, language, entry.file);
    if (translation === null) continue;
    const paragraphs: string[] = await readReviewParagraphs(folder, entry.file);
    if (paragraphs.length === 0) continue;
    const names: GlossaryUsed[] = entry.glossaryUsed.flatMap((name: GlossaryUsed): GlossaryUsed[] => {
      const current: GlossaryUsed | undefined = namesById.get(glossaryKeyId(name.key));
      return current === undefined ? [] : [current];
    });
    const issues = checkTranslation({
      source: { title: chapter.title, paragraphs },
      translation: { title: translation.title, paragraphs: translation.paragraphs },
      names,
    });
    await saveTranslationEntry(
      folder,
      language,
      novel.chapters,
      { ...entry, issues: issues.length },
      { ...translation, issues },
    );
    rechecked++;
  }
  return rechecked;
}

export async function recheckGlossaryChange(
  snapshots: AnalysisSnapshots,
  folder: NovelFolder,
  novelId: string,
  language: TargetLanguage,
  changed: Set<string>,
): Promise<void> {
  if (changed.size === 0) return;
  try {
    await withNovelLock(novelId, async (): Promise<void> => {
      const novel: NovelMetadata | null = readMetadata(folder);
      if (novel === null) return;
      const rows: GlossaryRow[] = await loadGlossaryRows(snapshots, folder, novel, language);
      await recheckChapters(folder, novel, language, rows, changed);
      broadcast(TranslationChannel.Changed, { novelId, language });
      broadcast(LibraryChannel.Changed, { novelIds: [novelId] });
    });
  } catch (error: unknown) {
    logger.error(`Translation re-check failed for ${novelId}`, error);
  }
}
