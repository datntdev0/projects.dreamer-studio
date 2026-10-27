import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyIndex } from '@dreamer/shared/core/analysis-plan';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type {
  AnalysisEntity,
  AnalysisFact,
  AnalysisIndexFile,
  ChapterAnalysisSummary,
} from '@dreamer/shared/models/analysis';
import type { ChapterAnalysisStatus, ChapterResult, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';
import { resolveAppPaths } from '@storage/paths';
import { novelFolder, NovelFolder } from '../library/library-files';
import { readAnalysisIndex, readWorldFile, writeChapterResult } from './analysis-files';
import { buildWorldFile, mergeWorld } from './analysis-merge';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false }, shell: {} }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const hash = (digit: string): string => digit.repeat(64);
const COUNTS = { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 };

let tempRoot: string;
let folder: NovelFolder;

function entity(id: string, status: ItemStatus, reason?: FailReason): AnalysisEntity {
  return { id, type: 'Persona', name: id, aliases: [], wordsFound: [id], status, ...(reason ? { reason } : {}) };
}

function fact(id: string, status: ItemStatus, reason?: FailReason): AnalysisFact {
  return {
    id,
    kind: 'relationship',
    predicate: 'enemy_of',
    subjectId: 'a',
    objectId: 'b',
    quote: 'q',
    status,
    ...(reason ? { reason } : {}),
  };
}

function summary(index: number, status: ChapterAnalysisStatus): ChapterAnalysisSummary {
  return { index, title: `T${index}`, file: hash(String(index)), status, counts: COUNTS, pending: false };
}

function result(chapter: ChapterAnalysisSummary, entities: AnalysisEntity[], facts: AnalysisFact[]): ChapterResult {
  return {
    version: 1,
    file: chapter.file,
    index: chapter.index,
    title: chapter.title,
    analysedAt: '2026-01-01',
    llm: 'x',
    entities,
    facts,
  };
}

function resultMap(...results: ChapterResult[]): Map<string, ChapterResult> {
  return new Map(results.map((item: ChapterResult): [string, ChapterResult] => [item.file, item]));
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-merge-'));
  folder = novelFolder(resolveAppPaths(tempRoot), novelId);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('buildWorldFile', () => {
  it('keeps the analysed chapters with a result', () => {
    const chapters = [summary(1, 'clean'), summary(2, 'reviewed'), summary(3, 'has-issues'), summary(4, 'failed')];
    const withResult = chapters.filter((chapter) => chapter.index !== 2);
    const results = resultMap(...withResult.map((chapter) => result(chapter, [entity('a', 'verified')], [])));
    const world = buildWorldFile(chapters, results, '2026-02-01T00:00:00.000Z');
    expect(world.version).toBe(1);
    expect(world.mergedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(world.chapters.map((chapter) => chapter.index)).toEqual([1, 3]);
    expect(world.chapters[0]).toMatchObject({ file: hash('1'), title: 'T1' });
  });

  it('keeps verified, accepted and open warning items, never open errors or rejected items', () => {
    const chapter = summary(1, 'has-issues');
    const entities = [
      entity('e-verified', 'verified'),
      entity('e-accepted', 'accepted'),
      entity('e-warning', 'failed', 'name-conflict'),
      entity('e-error', 'failed', 'words-not-found'),
      entity('e-rejected', 'rejected'),
    ];
    const facts = [
      fact('f-verified', 'verified'),
      fact('f-warning', 'failed', 'label-missing'),
      fact('f-error', 'failed', 'quote-not-found'),
    ];
    const world = buildWorldFile([chapter], resultMap(result(chapter, entities, facts)), 'now');
    expect(world.chapters[0].entities.map((item: AnalysisEntity): string => item.id)).toEqual([
      'e-verified',
      'e-accepted',
      'e-warning',
    ]);
    expect(world.chapters[0].facts.map((item: AnalysisFact): string => item.id)).toEqual(['f-verified', 'f-warning']);
  });
});

describe('mergeWorld', () => {
  async function seed(reason: FailReason, ...chapters: ChapterAnalysisSummary[]): Promise<AnalysisIndexFile> {
    for (const chapter of chapters) {
      await writeChapterResult(folder, result(chapter, [entity('a', 'verified'), entity('b', 'failed', reason)], []));
    }
    return emptyIndex();
  }

  it('refuses with ANALYSIS_OPEN_ISSUES when an error is open', async () => {
    const chapters = [summary(1, 'clean'), summary(2, 'has-issues')];
    const index = await seed('words-not-found', ...chapters);
    await expect(mergeWorld(folder, chapters, index)).rejects.toMatchObject({ code: ErrorCode.AnalysisOpenIssues });
    expect(readWorldFile(folder)).toBeNull();
    expect(readAnalysisIndex(folder)).toBeNull();
  });

  it('merges open warnings and sets index.mergedAt', async () => {
    const chapters = [summary(1, 'has-issues'), summary(2, 'has-issues')];
    const index = await seed('value-conflict', ...chapters);
    await mergeWorld(folder, chapters, index);
    const world = readWorldFile(folder)!;
    expect(world.chapters.map((chapter) => chapter.index)).toEqual([1, 2]);
    expect(world.chapters[0].entities.map((item: AnalysisEntity): string => item.id)).toEqual(['a', 'b']);
    expect(readAnalysisIndex(folder)?.mergedAt).toBe(world.mergedAt);
  });
});
