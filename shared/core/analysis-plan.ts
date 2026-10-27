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

export interface ChapterMatch<T> {
  entry: T;
  index: number;
  stale: boolean;
}

function emptyCounts(): ChapterAnalysisCounts {
  return { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 };
}

export function matchChapters<T extends { index: number; file: string }>(
  entries: T[],
  chapters: { file: string }[],
): ChapterMatch<T>[] {
  const positions: Map<string, number> = new Map<string, number>();
  chapters.forEach((chapter: { file: string }, position: number): void => {
    if (!positions.has(chapter.file)) positions.set(chapter.file, position + 1);
  });
  const claimed: Set<number> = new Set<number>(
    entries.flatMap((entry: T): number[] => positions.get(entry.file) ?? []),
  );
  const matches: ChapterMatch<T>[] = [];
  for (const entry of entries) {
    const position: number | undefined = positions.get(entry.file);
    if (position !== undefined) {
      matches.push({ entry, index: position, stale: false });
    } else if (entry.index <= chapters.length && !claimed.has(entry.index)) {
      claimed.add(entry.index);
      matches.push({ entry, index: entry.index, stale: true });
    }
  }
  return matches.sort((a: ChapterMatch<T>, b: ChapterMatch<T>): number => a.index - b.index);
}

export function alignIndex(index: AnalysisIndexFile, chapters: { file: string }[]): AnalysisIndexFile {
  return {
    ...index,
    chapters: matchChapters(index.chapters, chapters).map(
      (match: ChapterMatch<AnalysisIndexEntry>): AnalysisIndexEntry => ({ ...match.entry, index: match.index }),
    ),
  };
}

export function chapterStatuses(
  chapters: NovelChapterEntry[],
  index: AnalysisIndexFile | null,
): ChapterAnalysisSummary[] {
  const matches: Map<number, ChapterMatch<AnalysisIndexEntry>> = new Map(
    matchChapters(index?.chapters ?? [], chapters).map(
      (match: ChapterMatch<AnalysisIndexEntry>): [number, ChapterMatch<AnalysisIndexEntry>] => [match.index, match],
    ),
  );
  return chapters.map((chapter: NovelChapterEntry, position: number): ChapterAnalysisSummary => {
    const number: number = position + 1;
    const match: ChapterMatch<AnalysisIndexEntry> | undefined = matches.get(number);
    const current: AnalysisIndexEntry | undefined = match && !match.stale ? match.entry : undefined;
    const previous: AnalysisIndexEntry | undefined = match?.entry;
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
