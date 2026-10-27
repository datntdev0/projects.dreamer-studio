import { chapterCounts, checkWorld } from '@dreamer/shared/core/analysis-checks';
import { chapterStatuses, isUpToDate, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { chapterReviewStatus, issueCounts, ReviewChapter, reviewItems } from '@dreamer/shared/core/analysis-review';
import { AnalysisIndexEntry, AnalysisIndexFile, ChapterAnalysisSummary } from '@dreamer/shared/models/analysis';
import { ChapterResult, ReviewItem } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { NovelFolder } from '../library/library-files';
import { readAlignedIndex, readChapterResult, writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { loadOntology } from './analysis-ontology';

export interface AnalysedChapter {
  chapter: ChapterAnalysisSummary;
  result: ChapterResult;
}

export function readAnalysedChapters(folder: NovelFolder, chapters: ChapterAnalysisSummary[]): AnalysedChapter[] {
  return chapters
    .filter((chapter: ChapterAnalysisSummary): boolean => isUpToDate(chapter.status))
    .map((chapter: ChapterAnalysisSummary): AnalysedChapter | null => {
      const result: ChapterResult | null = readChapterResult(folder, chapter.file);
      return result ? { chapter, result: { ...result, index: chapter.index } } : null;
    })
    .filter((item: AnalysedChapter | null): item is AnalysedChapter => item !== null);
}

function isChanged(before: ChapterResult, after: ChapterResult): boolean {
  return JSON.stringify([before.entities, before.facts]) !== JSON.stringify([after.entities, after.facts]);
}

export async function recheckWorld(folder: NovelFolder, novel: NovelMetadata): Promise<void> {
  const index: AnalysisIndexFile = readAlignedIndex(folder, novel.chapters);
  const analysed: AnalysedChapter[] = readAnalysedChapters(folder, chapterStatuses(novel.chapters, index));
  const checked: ChapterResult[] = checkWorld(
    analysed.map((item: AnalysedChapter): ChapterResult => item.result),
    loadOntology(folder).ontology,
  );
  const updatedAt: string = new Date().toISOString();
  let next: AnalysisIndexFile = index;
  for (const [position, result] of checked.entries()) {
    const entry: AnalysisIndexEntry | undefined = index.chapters.find(
      (candidate: AnalysisIndexEntry): boolean => candidate.file === result.file,
    );
    if (!entry || !isChanged(analysed[position].result, result)) continue;
    await writeChapterResult(folder, result);
    next = upsertIndexEntry(next, {
      ...entry,
      status: chapterReviewStatus(result.entities, result.facts),
      counts: chapterCounts(result.entities, result.facts),
      updatedAt,
    });
  }
  const items: ReviewItem[] = reviewItems(
    checked.map((result: ChapterResult): ReviewChapter => ({ ...result, paragraphs: [] })),
  );
  await writeAnalysisIndex(folder, { ...next, issues: issueCounts(items) });
}
