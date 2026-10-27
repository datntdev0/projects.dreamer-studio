import { describe, expect, it } from 'vitest';
import type { AnalysisIndexEntry, AnalysisIndexFile, AnalysisRunOptions } from '../models/analysis';
import type { ChapterAnalysisCounts, ChapterAnalysisStatus, ChapterAnalysisSummary } from '../models/analysis';
import type { NovelChapterEntry } from '../models/novel-store';
import { chapterStatuses, emptyIndex, planRun, upsertIndexEntry } from './analysis-plan';

const COUNTS: ChapterAnalysisCounts = { entities: 2, facts: 1, verified: 3, failed: 0, accepted: 0, rejected: 0 };
const ZERO: ChapterAnalysisCounts = { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 };

function chapters(...files: string[]): NovelChapterEntry[] {
  return files.map((file: string) => ({ file, title: `T ${file}` }) as NovelChapterEntry);
}

function entry(index: number, file: string, over: Partial<AnalysisIndexEntry> = {}): AnalysisIndexEntry {
  return { index, file, status: 'clean', counts: COUNTS, analysedAt: '2026-01-01', ...over };
}

function indexOf(...entries: AnalysisIndexEntry[]): AnalysisIndexFile {
  return { ...emptyIndex(), chapters: entries };
}

function summaries(...statuses: ChapterAnalysisStatus[]): ChapterAnalysisSummary[] {
  return statuses.map((status: ChapterAnalysisStatus, position: number) => ({
    index: position + 1,
    title: '',
    file: `c${position + 1}.md`,
    status,
    counts: ZERO,
    pending: false,
  }));
}

function options(over: Partial<AnalysisRunOptions>): AnalysisRunOptions {
  return { mode: 'full', from: null, to: null, overwrite: false, stage: 'all', batchSize: 5, ...over };
}

describe('chapterStatuses', () => {
  it('marks every chapter not-analysed without an index', () => {
    const result = chapterStatuses(chapters('a', 'b'), null);
    expect(result.map((item) => item.status)).toEqual(['not-analysed', 'not-analysed']);
    expect(result[0]).toMatchObject({ index: 1, title: 'T a', file: 'a', counts: ZERO, pending: false });
    expect(result[0].resultFile).toBeUndefined();
  });

  it('uses the entry found by file', () => {
    const [result] = chapterStatuses(chapters('a'), indexOf(entry(1, 'a', { status: 'has-issues' })));
    expect(result).toMatchObject({ status: 'has-issues', counts: COUNTS, resultFile: 'a' });
  });

  it('reports failed with the error', () => {
    const [result] = chapterStatuses(chapters('a'), indexOf(entry(1, 'a', { status: 'clean', error: 'boom' })));
    expect(result).toMatchObject({ status: 'failed', error: 'boom' });
    expect(result.resultFile).toBeUndefined();
  });

  it('does not set resultFile for a failed entry status', () => {
    const [result] = chapterStatuses(chapters('a'), indexOf(entry(1, 'a', { status: 'failed' })));
    expect(result.status).toBe('failed');
    expect(result.resultFile).toBeUndefined();
  });

  it('keeps a reordered chapter not stale', () => {
    const result = chapterStatuses(chapters('b', 'a'), indexOf(entry(1, 'a'), entry(2, 'b')));
    expect(result.map((item) => item.status)).toEqual(['clean', 'clean']);
  });

  it('marks stale when the entry at the same index has another file', () => {
    const [result] = chapterStatuses(chapters('new'), indexOf(entry(1, 'old')));
    expect(result).toMatchObject({ status: 'stale', counts: COUNTS, resultFile: 'old' });
  });
});

describe('chapterStatuses pending', () => {
  function pendingOf(over: Partial<AnalysisIndexEntry>, mergedAt: string | null): boolean {
    const index: AnalysisIndexFile = { ...indexOf(entry(1, 'a', over)), mergedAt };
    return chapterStatuses(chapters('a'), index)[0].pending;
  }

  it('is pending for a clean or reviewed chapter that was never merged', () => {
    expect(pendingOf({ status: 'clean' }, null)).toBe(true);
    expect(pendingOf({ status: 'reviewed' }, null)).toBe(true);
  });

  it('is pending for has-issues, because open warnings are merged', () => {
    expect(pendingOf({ status: 'has-issues' }, null)).toBe(true);
  });

  it('is never pending for failed, stale or not-analysed', () => {
    expect(pendingOf({ status: 'failed' }, null)).toBe(false);
    expect(chapterStatuses(chapters('new'), indexOf(entry(1, 'old')))[0].pending).toBe(false);
    expect(chapterStatuses(chapters('a'), null)[0].pending).toBe(false);
  });

  it('compares updatedAt with mergedAt', () => {
    const over: Partial<AnalysisIndexEntry> = { analysedAt: '2026-01-01T00:00:00Z' };
    expect(pendingOf({ ...over, updatedAt: '2026-01-03T00:00:00Z' }, '2026-01-02T00:00:00Z')).toBe(true);
    expect(pendingOf({ ...over, updatedAt: '2026-01-01T12:00:00Z' }, '2026-01-02T00:00:00Z')).toBe(false);
  });

  it('falls back to analysedAt when updatedAt is missing', () => {
    expect(pendingOf({ analysedAt: '2026-01-03T00:00:00Z' }, '2026-01-02T00:00:00Z')).toBe(true);
    expect(pendingOf({ analysedAt: '2026-01-01T00:00:00Z' }, '2026-01-02T00:00:00Z')).toBe(false);
  });
});

describe('planRun', () => {
  const all = summaries('not-analysed', 'clean', 'stale', 'failed', 'has-issues', 'reviewed');

  it('missing mode picks not-analysed, stale and failed and ignores overwrite', () => {
    expect(planRun(options({ mode: 'missing' }), all).queue).toEqual([1, 3, 4]);
    expect(planRun(options({ mode: 'missing', overwrite: true }), all).queue).toEqual([1, 3, 4]);
  });

  it('range with overwrite false skips up-to-date chapters', () => {
    expect(planRun(options({ mode: 'range', from: 1, to: 6 }), all).queue).toEqual([1, 3, 4]);
  });

  it('range with overwrite true includes up-to-date chapters within the range', () => {
    expect(planRun(options({ mode: 'range', from: 2, to: 5, overwrite: true }), all).queue).toEqual([2, 3, 4, 5]);
  });

  it('full mode takes all chapters when overwrite is true', () => {
    expect(planRun(options({ mode: 'full', overwrite: true }), all).queue).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('full mode skips up-to-date chapters when overwrite is false', () => {
    expect(planRun(options({ mode: 'full' }), all).queue).toEqual([1, 3, 4]);
  });

  it('clamps the range', () => {
    const result = planRun(options({ mode: 'range', from: -5, to: 99, overwrite: true }), all);
    expect(result.queue).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    [1, [[1], [2], [3], [4], [5], [6], [7]]],
    [3, [[1, 2, 3], [4, 5, 6], [7]]],
    [
      5,
      [
        [1, 2, 3, 4, 5],
        [6, 7],
      ],
    ],
    [10, [[1, 2, 3, 4, 5, 6, 7]]],
  ])('chunks batches by batchSize %i', (batchSize: number, expected: number[][]) => {
    const seven = summaries(...Array<ChapterAnalysisStatus>(7).fill('not-analysed'));
    expect(planRun(options({ batchSize }), seven).batches).toEqual(expected);
  });

  it('reports count, from and to', () => {
    expect(planRun(options({ mode: 'missing' }), all)).toMatchObject({ count: 3, from: 1, to: 4 });
  });

  it('returns count 0 and null bounds for an empty queue', () => {
    const result = planRun(options({ mode: 'missing' }), summaries('clean', 'reviewed'));
    expect(result).toEqual({ queue: [], batches: [], count: 0, from: null, to: null });
  });
});

describe('upsertIndexEntry and emptyIndex', () => {
  it('creates an empty index', () => {
    expect(emptyIndex()).toEqual({ version: 1, chapters: [], lastRun: null, mergedAt: null });
  });

  it('replaces entries with the same index or the same file, sorted by index', () => {
    const index = indexOf(entry(1, 'a'), entry(2, 'b'), entry(3, 'c'));
    const result = upsertIndexEntry(index, entry(3, 'a', { status: 'reviewed' }));
    expect(result.chapters.map((item) => [item.index, item.file])).toEqual([
      [2, 'b'],
      [3, 'a'],
    ]);
    expect(result.chapters[1].status).toBe('reviewed');
  });

  it('adds a new entry in order and keeps other fields', () => {
    const index = { ...indexOf(entry(2, 'b')), mergedAt: 'x' };
    const result = upsertIndexEntry(index, entry(1, 'a'));
    expect(result.chapters.map((item) => item.index)).toEqual([1, 2]);
    expect(result.mergedAt).toBe('x');
  });
});
