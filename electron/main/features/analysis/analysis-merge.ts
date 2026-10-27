import { ChapterMatch, isUpToDate, matchChapters } from '@dreamer/shared/core/analysis-plan';
import { isMergeable, isOpenError } from '@dreamer/shared/core/analysis-review';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisIndexFile, ChapterAnalysisSummary, ChapterResult } from '@dreamer/shared/models/analysis';
import { WorldFile, WorldFileChapter } from '@dreamer/shared/models/analysis';
import { NovelFolder } from '../library/library-files';
import { readWorldFile, writeAnalysisIndex, writeWorldFile } from './analysis-files';
import { AnalysedChapter, readAnalysedChapters } from './analysis-recheck';

function worldChapter(chapter: ChapterAnalysisSummary, result: ChapterResult): WorldFileChapter {
  return {
    index: chapter.index,
    file: chapter.file,
    title: chapter.title,
    entities: result.entities.filter(isMergeable),
    facts: result.facts.filter(isMergeable),
  };
}

export function buildWorldFile(
  chapters: ChapterAnalysisSummary[],
  results: Map<string, ChapterResult>,
  mergedAt: string,
  previous: WorldFile | null = null,
): WorldFile {
  const merged: WorldFileChapter[] = [];
  const previousChapters: Map<number, WorldFileChapter> = new Map(
    matchChapters(previous?.chapters ?? [], chapters).map(
      (match: ChapterMatch<WorldFileChapter>): [number, WorldFileChapter] => [match.index, match.entry],
    ),
  );
  for (const chapter of chapters) {
    const result: ChapterResult | undefined = results.get(chapter.file);
    if (isUpToDate(chapter.status) && result) merged.push(worldChapter(chapter, result));
    else {
      const prior: WorldFileChapter | undefined = previousChapters.get(chapter.index);
      if (prior) merged.push({ ...prior, index: chapter.index, title: chapter.title });
    }
  }
  return { version: 1, mergedAt, chapters: merged };
}

export async function mergeWorld(
  folder: NovelFolder,
  chapters: ChapterAnalysisSummary[],
  index: AnalysisIndexFile,
): Promise<void> {
  const analysed: AnalysedChapter[] = readAnalysedChapters(folder, chapters);
  if (analysed.some(({ result }: AnalysedChapter): boolean => [...result.entities, ...result.facts].some(isOpenError)))
    throw new CodedError(ErrorCode.AnalysisOpenIssues, 'Chapters still have open errors');
  const results: Map<string, ChapterResult> = new Map<string, ChapterResult>(
    analysed.map(({ chapter, result }: AnalysedChapter): [string, ChapterResult] => [chapter.file, result]),
  );
  const mergedAt: string = new Date().toISOString();
  await writeWorldFile(folder, buildWorldFile(chapters, results, mergedAt, readWorldFile(folder)));
  await writeAnalysisIndex(folder, { ...index, mergedAt });
}
