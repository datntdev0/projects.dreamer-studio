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
  return { entities: 0, facts: 0 };
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
    entries.flatMap((entry: T): number[] => (positions.has(entry.file) ? [positions.get(entry.file)!] : [])),
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

export function alignIndex<T extends { index: number; file: string }, I extends { chapters: T[] }>(
  index: I,
  chapters: { file: string }[],
): I {
  return {
    ...index,
    chapters: matchChapters(index.chapters, chapters).map((match: ChapterMatch<T>): T => ({
      ...match.entry,
      index: match.index,
    })),
  } as I;
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
        : 'analysed'
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
    };
  });
}

export function isUpToDate(status: ChapterAnalysisStatus): boolean {
  return status === 'analysed';
}

export function chapterQueue<T extends { index: number }>(
  options: { mode: 'missing' | 'range' | 'full'; from: number | null; to: number | null; overwrite: boolean },
  chapters: T[],
  isMissing: (chapter: T) => boolean,
): number[] {
  const first: number = Math.max(1, Math.min(chapters.length, options.from ?? 1));
  const last: number = Math.max(1, Math.min(chapters.length, options.to ?? chapters.length));
  return chapters
    .filter((chapter: T): boolean => {
      if (options.mode === 'missing') return isMissing(chapter);
      if (options.mode === 'range' && (chapter.index < first || chapter.index > last)) return false;
      return options.overwrite || isMissing(chapter);
    })
    .map((chapter: T): number => chapter.index);
}

export function planRun(options: AnalysisRunOptions, chapters: ChapterAnalysisSummary[]): AnalysisRunQueue {
  const queue: number[] = chapterQueue(
    options,
    chapters,
    (chapter: ChapterAnalysisSummary): boolean => !isUpToDate(chapter.status),
  );
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

export function upsertIndexEntry<T extends { index: number; file: string }, I extends { chapters: T[] }>(
  index: I,
  entry: T,
): I {
  const chapters: T[] = index.chapters
    .filter((existing: T): boolean => existing.index !== entry.index && existing.file !== entry.file)
    .concat(entry)
    .sort((a: T, b: T): number => a.index - b.index);
  return { ...index, chapters } as I;
}

export function emptyIndex(): AnalysisIndexFile {
  return { version: 1, chapters: [], lastRun: null };
}
