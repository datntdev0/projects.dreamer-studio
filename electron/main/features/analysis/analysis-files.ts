import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { AnalysisIndexFile, ChapterResult } from '@dreamer/shared/models/analysis';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { createLogger, Logger } from '../../logging/logger';
import { NovelFolder } from '../library/library-files';
import { asWriteError } from '../library/library-io';
import { writeFileAtomic } from '../library/novel/novel-files';

const logger: Logger = createLogger('analysis');

export function analysisIndexFile(folder: NovelFolder): string {
  return join(folder.analysis, 'index.json');
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
  return parsed as AnalysisIndexFile;
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
  return parsed as ChapterResult;
}

export async function writeChapterResult(folder: NovelFolder, result: ChapterResult): Promise<void> {
  try {
    await writeFileAtomic(chapterResultFile(folder, result.file), `${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    asWriteError(error);
  }
}
