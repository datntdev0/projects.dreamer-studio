import { AnalysisIndexEntry, AnalysisIndexFile, AnalysisRunOptions } from '../models/analysis';
import { ChapterAnalysisCounts, ChapterAnalysisStatus, ChapterAnalysisSummary } from '../models/analysis';
import { NovelChapterEntry } from '../models/novel-store';

export interface AnalysisRunQueue {
  queue: number[];
  batches: number[][];
  count: number;
  from: number | null;
  to: number | null;
}

function emptyCounts(): ChapterAnalysisCounts {
  return { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 };
}

export function chapterStatuses(
  chapters: NovelChapterEntry[],
  index: AnalysisIndexFile | null,
): ChapterAnalysisSummary[] {
  return chapters.map((chapter: NovelChapterEntry, position: number): ChapterAnalysisSummary => {
    const number: number = position + 1;
    const current: AnalysisIndexEntry | undefined = index?.chapters.find(
      (entry: AnalysisIndexEntry): boolean => entry.file === chapter.file,
    );
    const previous: AnalysisIndexEntry | undefined =
      current ?? index?.chapters.find((entry: AnalysisIndexEntry): boolean => entry.index === number);
    const status: ChapterAnalysisStatus = current
      ? current.error
        ? 'failed'
        : current.status
      : previous
        ? 'stale'
        : 'not-analysed';
    return {
      index: number,
      title: chapter.title,
      file: chapter.file,
      status,
      counts: previous?.counts ?? emptyCounts(),
      ...(current?.error ? { error: current.error } : {}),
      ...(previous && status !== 'failed' ? { resultFile: previous.file } : {}),
      pending: isPending(status, current, index?.mergedAt ?? null),
    };
  });
}

function isPending(
  status: ChapterAnalysisStatus,
  entry: AnalysisIndexEntry | undefined,
  mergedAt: string | null,
): boolean {
  if (!entry || !isUpToDate(status)) return false;
  return mergedAt === null || (entry.updatedAt ?? entry.analysedAt) > mergedAt;
}

export function isUpToDate(status: ChapterAnalysisStatus): boolean {
  return status === 'clean' || status === 'has-issues' || status === 'reviewed';
}

export function planRun(options: AnalysisRunOptions, chapters: ChapterAnalysisSummary[]): AnalysisRunQueue {
  const first: number = Math.max(1, Math.min(chapters.length, options.from ?? 1));
  const last: number = Math.max(1, Math.min(chapters.length, options.to ?? chapters.length));
  const queue: number[] = chapters
    .filter((chapter: ChapterAnalysisSummary): boolean => {
      if (options.mode === 'missing')
        return chapter.status === 'not-analysed' || chapter.status === 'stale' || chapter.status === 'failed';
      if (options.mode === 'range' && (chapter.index < first || chapter.index > last)) return false;
      return options.overwrite || !isUpToDate(chapter.status);
    })
    .map((chapter: ChapterAnalysisSummary): number => chapter.index);
  const batches: number[][] = [];
  const batchSize: number = Math.max(1, Math.floor(options.batchSize));
  for (let offset: number = 0; offset < queue.length; offset += batchSize)
    batches.push(queue.slice(offset, offset + batchSize));
  return {
    queue,
    batches,
    count: queue.length,
    from: queue.length ? Math.min(...queue) : null,
    to: queue.length ? Math.max(...queue) : null,
  };
}

export function upsertIndexEntry(index: AnalysisIndexFile, entry: AnalysisIndexEntry): AnalysisIndexFile {
  const chapters: AnalysisIndexEntry[] = index.chapters
    .filter((existing: AnalysisIndexEntry): boolean => existing.index !== entry.index && existing.file !== entry.file)
    .concat(entry)
    .sort((a: AnalysisIndexEntry, b: AnalysisIndexEntry): number => a.index - b.index);
  return { ...index, chapters };
}

export function emptyIndex(): AnalysisIndexFile {
  return { version: 1, chapters: [], lastRun: null, mergedAt: null };
}
