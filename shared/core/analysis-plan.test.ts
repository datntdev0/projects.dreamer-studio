import { describe, expect, it } from 'vitest';
import type { AnalysisIndexEntry, AnalysisIndexFile, AnalysisRunOptions } from '../models/analysis';
import type { ChapterAnalysisCounts, ChapterAnalysisStatus, ChapterAnalysisSummary } from '../models/analysis';
import type { NovelChapterEntry } from '../models/novel-store';
import { alignIndex, chapterStatuses, emptyIndex, matchChapters, planRun, upsertIndexEntry } from './analysis-plan';

const COUNTS: ChapterAnalysisCounts = { entities: 2, facts: 1 };
const ZERO: ChapterAnalysisCounts = { entities: 0, facts: 0 };

function chapters(...files: string[]): NovelChapterEntry[] {
  return files.map((file: string) => ({ file, title: `T ${file}` }) as NovelChapterEntry);
}

function entry(index: number, file: string, over: Partial<AnalysisIndexEntry> = {}): AnalysisIndexEntry {
  return { index, file, counts: COUNTS, analysedAt: '2026-01-01', ...over };
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
  }));
}

function options(over: Partial<AnalysisRunOptions>): AnalysisRunOptions {
  return { mode: 'full', from: null, to: null, overwrite: false, stage: 'all', batchSize: 5, ...over };
}

describe('chapterStatuses', () => {
  it('marks every chapter not-analysed without an index', () => {
    const result = chapterStatuses(chapters('a', 'b'), null);
    expect(result.map((item) => item.status)).toEqual(['not-analysed', 'not-analysed']);
    expect(result[0]).toMatchObject({ index: 1, title: 'T a', file: 'a', counts: ZERO });
    expect(result[0].resultFile).toBeUndefined();
  });

  it('uses the entry found by file', () => {
    const [result] = chapterStatuses(chapters('a'), indexOf(entry(1, 'a')));
    expect(result).toMatchObject({ status: 'analysed', counts: COUNTS, resultFile: 'a' });
  });

  it('reports failed with the error', () => {
    const [result] = chapterStatuses(chapters('a'), indexOf(entry(1, 'a', { error: 'boom' })));
    expect(result).toMatchObject({ status: 'failed', error: 'boom' });
    expect(result.resultFile).toBeUndefined();
  });

  it('keeps a reordered chapter not stale', () => {
    const result = chapterStatuses(chapters('b', 'a'), indexOf(entry(1, 'a'), entry(2, 'b')));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'analysed']);
  });

  it('marks stale when the entry at the same index has another file', () => {
    const [result] = chapterStatuses(chapters('new'), indexOf(entry(1, 'old')));
    expect(result).toMatchObject({ status: 'stale', counts: COUNTS, resultFile: 'old' });
  });
});

describe('planRun', () => {
  const all = summaries('not-analysed', 'analysed', 'stale', 'failed', 'analysed', 'analysed');

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
    const result = planRun(options({ mode: 'missing' }), summaries('analysed', 'analysed'));
    expect(result).toEqual({ queue: [], batches: [], count: 0, from: null, to: null });
  });
});

describe('upsertIndexEntry and emptyIndex', () => {
  it('creates an empty index', () => {
    expect(emptyIndex()).toEqual({ version: 1, chapters: [], lastRun: null });
  });

  it('replaces entries with the same index or the same file, sorted by index', () => {
    const index = indexOf(entry(1, 'a'), entry(2, 'b'), entry(3, 'c'));
    const result = upsertIndexEntry(index, entry(3, 'a', { error: 'x' }));
    expect(result.chapters.map((item) => [item.index, item.file])).toEqual([
      [2, 'b'],
      [3, 'a'],
    ]);
    expect(result.chapters[1].error).toBe('x');
  });

  it('adds a new entry in order and keeps other fields', () => {
    const index = { ...indexOf(entry(2, 'b')), lastRun: null };
    const result = upsertIndexEntry(index, entry(1, 'a'));
    expect(result.chapters.map((item) => item.index)).toEqual([1, 2]);
  });
});

function statusesOf(current: NovelChapterEntry[], ...entries: AnalysisIndexEntry[]): string[] {
  return chapterStatuses(current, indexOf(...entries)).map((item) => item.status);
}

describe('matchChapters', () => {
  it('matches an entry by its file at the current position, not stale', () => {
    const result = matchChapters([entry(1, 'a'), entry(2, 'b')], chapters('x', 'a', 'b'));
    expect(result.map((match) => [match.entry.file, match.index, match.stale])).toEqual([
      ['a', 2, false],
      ['b', 3, false],
    ]);
  });

  it('matches an entry by its index as stale when the file changed', () => {
    const result = matchChapters([entry(1, 'a'), entry(2, 'b')], chapters('a', 'b2'));
    expect(result.map((match) => [match.entry.file, match.index, match.stale])).toEqual([
      ['a', 1, false],
      ['b', 2, true],
    ]);
  });

  it('drops an entry whose file is gone and whose index is beyond the chapters', () => {
    const result = matchChapters([entry(1, 'a'), entry(3, 'c')], chapters('a', 'b'));
    expect(result.map((match) => match.entry.file)).toEqual(['a']);
  });

  it('drops an entry when its index belongs to a chapter that matches another file', () => {
    const result = matchChapters([entry(1, 'a'), entry(2, 'b')], chapters('b', 'c'));
    expect(result.map((match) => [match.entry.file, match.index, match.stale])).toEqual([['b', 1, false]]);
  });

  it('gives the file match priority over the index', () => {
    const result = matchChapters([entry(1, 'a'), entry(2, 'b')], chapters('b', 'a'));
    expect(result.map((match) => [match.entry.file, match.index, match.stale])).toEqual([
      ['b', 1, false],
      ['a', 2, false],
    ]);
  });

  it('gives an empty list without entries', () => {
    expect(matchChapters([], chapters('a'))).toEqual([]);
  });
});

describe('alignIndex', () => {
  it('moves entries to their current index and drops deleted ones', () => {
    const aligned = alignIndex(indexOf(entry(1, 'a'), entry(2, 'b'), entry(3, 'c')), chapters('b', 'c'));
    expect(aligned.chapters.map((item) => [item.file, item.index])).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('gives a stale entry the index of its chapter', () => {
    const aligned = alignIndex(indexOf(entry(2, 'b')), chapters('a', 'b2'));
    expect(aligned.chapters.map((item) => [item.file, item.index])).toEqual([['b', 2]]);
  });

  it('keeps the entry of a moved chapter when upserting another chapter after the alignment', () => {
    const aligned = alignIndex(indexOf(entry(1, 'a'), entry(2, 'b')), chapters('x', 'a', 'b'));
    const next = upsertIndexEntry(aligned, entry(1, 'x'));
    expect(next.chapters.map((item) => [item.file, item.index])).toEqual([
      ['x', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });
});

describe('chapterStatuses after chapter changes', () => {
  const analysed = [entry(1, 'a'), entry(2, 'b'), entry(3, 'c')];

  it('marks an edited chapter stale and keeps its previous result', () => {
    const result = chapterStatuses(chapters('a', 'b2', 'c'), indexOf(...analysed));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'stale', 'analysed']);
    expect(result[1]).toMatchObject({ resultFile: 'b', counts: COUNTS });
  });

  it('marks an inserted chapter not-analysed and keeps the status of moved chapters', () => {
    const result = chapterStatuses(chapters('a', 'x', 'b', 'c'), indexOf(...analysed));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'not-analysed', 'analysed', 'analysed']);
    expect(result[2]).toMatchObject({ file: 'b', index: 3 });
  });

  it('keeps the status of moved chapters after a delete', () => {
    expect(statusesOf(chapters('a', 'c'), ...analysed)).toEqual(['analysed', 'analysed']);
  });

  it('marks the merged chapter stale and drops the other entry', () => {
    const result = chapterStatuses(chapters('a', 'bc'), indexOf(...analysed));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'stale']);
    expect(result[1].resultFile).toBe('b');
  });

  it('marks the first part of a split stale and the second part not-analysed', () => {
    expect(statusesOf(chapters('a', 'b1', 'b2', 'c'), ...analysed)).toEqual([
      'analysed',
      'stale',
      'not-analysed',
      'analysed',
    ]);
  });

  it('keeps a failed entry failed when the file matches', () => {
    const result = chapterStatuses(chapters('a', 'b'), indexOf(entry(1, 'a'), entry(2, 'b', { error: 'boom' })));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'failed']);
    expect(result[1].error).toBe('boom');
  });

  it('marks a failed entry stale when the chapter was edited', () => {
    const result = chapterStatuses(chapters('a2'), indexOf(entry(1, 'a', { error: 'boom' })));
    expect(result[0].status).toBe('stale');
    expect(result[0].error).toBeUndefined();
  });

  it('finds a moved chapter by its file before the index (AC-5)', () => {
    const result = chapterStatuses(chapters('b', 'a'), indexOf(entry(1, 'a', { error: 'x' }), entry(2, 'b')));
    expect(result.map((item) => item.status)).toEqual(['analysed', 'failed']);
  });
});
