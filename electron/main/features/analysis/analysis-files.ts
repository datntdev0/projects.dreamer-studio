import { readFileSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { alignIndex, emptyIndex } from '@dreamer/shared/core/analysis-plan';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { AnalysisIndexFile, ChapterResult, OverlayFile } from '@dreamer/shared/models/analysis';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { createLogger, Logger } from '../../logging/logger';
import { chapterPath, NovelFolder } from '../library/library-files';
import { asWriteError } from '../library/library-io';
import { writeFileAtomic } from '../library/novel/novel-files';

const logger: Logger = createLogger('analysis');

export function analysisIndexFile(folder: NovelFolder): string {
  return join(folder.analysis, 'index.json');
}

export function legacyWorldFile(folder: NovelFolder): string {
  return join(folder.analysis, 'world.json');
}

export function worldOverlayFile(folder: NovelFolder): string {
  return join(folder.analysis, 'world-overlay.json');
}

export function chapterResultFile(folder: NovelFolder, file: string): string {
  if (!isContentHash(file)) throw new Error('invalid content hash');
  return join(folder.analysis, 'chapters', `${file}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      logger.warn(`analysis file unreadable or invalid: ${file}: ${errorMessage(error)}`);
    return undefined;
  }
}

export function readAnalysisIndex(folder: NovelFolder): AnalysisIndexFile | null {
  const file: string = analysisIndexFile(folder);
  const parsed: unknown = readJson(file);
  if (parsed === undefined) return null;
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.chapters)) {
    logger.warn(`analysis index invalid: ${file}`);
    return null;
  }
  return parsed as unknown as AnalysisIndexFile;
}

export function readAlignedIndex(folder: NovelFolder, chapters: { file: string }[]): AnalysisIndexFile {
  return alignIndex(readAnalysisIndex(folder) ?? emptyIndex(), chapters);
}

export async function writeAnalysisIndex(folder: NovelFolder, index: AnalysisIndexFile): Promise<void> {
  try {
    await writeFileAtomic(analysisIndexFile(folder), `${JSON.stringify(index, null, 2)}\n`);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

export function readChapterResult(folder: NovelFolder, file: string): ChapterResult | null {
  const path: string = chapterResultFile(folder, file);
  const parsed: unknown = readJson(path);
  if (parsed === undefined) return null;
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.file !== file ||
    !Array.isArray(parsed.entities) ||
    !Array.isArray(parsed.facts)
  ) {
    logger.warn(`analysis chapter result invalid: ${path}`);
    return null;
  }
  return parsed as unknown as ChapterResult;
}

export function readWorldOverlay(folder: NovelFolder): OverlayFile | null {
  const file: string = worldOverlayFile(folder);
  const parsed: unknown = readJson(file);
  if (parsed === undefined) return null;
  if (!isRecord(parsed) || parsed.version !== 2 || !Array.isArray(parsed.edits)) {
    logger.warn(`analysis world overlay invalid or outdated: ${file}`);
    return null;
  }
  return parsed as unknown as OverlayFile;
}

export async function writeWorldOverlay(folder: NovelFolder, overlay: OverlayFile): Promise<void> {
  try {
    await writeFileAtomic(
      worldOverlayFile(folder),
      `${JSON.stringify(overlay, null, 2)}
`,
    );
  } catch (error: unknown) {
    asWriteError(error);
  }
}

export async function deleteLegacyWorldFile(folder: NovelFolder): Promise<void> {
  await rm(legacyWorldFile(folder), { force: true }).catch((error: unknown): void =>
    logger.warn(`legacy world file not deleted: ${errorMessage(error)}`),
  );
}

export async function readChapterParagraphs(folder: NovelFolder, file: string): Promise<string[]> {
  const path: string = chapterPath(folder, file);
  const details = await stat(path).catch((): null => null);
  if (!details?.isFile() || details.size === 0)
    throw new CodedError(ErrorCode.ChapterFileMissing, `Chapter file is missing or empty: ${path}`);
  const paragraphs: string[] = splitParagraphs(await readFile(path, 'utf8'));
  if (paragraphs.length === 0) throw new CodedError(ErrorCode.ChapterFileMissing, `Chapter file is empty: ${path}`);
  return paragraphs;
}

export async function writeChapterResult(folder: NovelFolder, result: ChapterResult): Promise<void> {
  try {
    await writeFileAtomic(chapterResultFile(folder, result.file), `${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

export async function readReviewParagraphs(folder: NovelFolder, file: string): Promise<string[]> {
  try {
    return await readChapterParagraphs(folder, file);
  } catch (error) {
    if (error instanceof CodedError && error.code === ErrorCode.ChapterFileMissing) return [];
    throw error;
  }
}
