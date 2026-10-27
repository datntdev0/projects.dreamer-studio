import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { emptyIndex, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type {
  AnalysisEditRequest,
  AnalysisEntity,
  AnalysisFact,
  AnalysisIndexEntry,
} from '@dreamer/shared/models/analysis';
import type {
  ChapterResult,
  ReviewEdit,
  ReviewItem,
  ReviewPage,
  ReviewQuery,
  WorldQuery,
} from '@dreamer/shared/models/analysis';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import { resolveAppPaths } from '@storage/paths';
import { AppDataSession } from '../../app/app-data-session';
import { novelFolder, NovelFolder } from '../library/library-files';
import { readMetadata, writeChapter, writeMetadata } from '../library/novel/novel-files';
import { readAnalysisIndex, readChapterResult, writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { recheckWorld } from './analysis-recheck';
import { AnalysisRuns } from './analysis-runs';
import { AnalysisService } from './analysis-service';

vi.mock('electron', () => ({
  app: {
    getPath: (): string => 'appData',
    isPackaged: false,
    getAppPath: (): string => join(process.cwd(), 'electron'),
  },
  shell: { openPath: vi.fn() },
}));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('@storage/repositories/pipeline-run-repository', () => ({
  PipelineRunRepository: class {
    activeNovelRuns(): object[] {
      return [];
    }
  },
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const texts: string[] = ['Mai Linh walked into Hanoi.', 'Lan lived in Hanoi. Mai Linh hated Lan.', 'Nothing here.'];
const worldQuery: WorldQuery = { novelId, chapter: null, only: null } as unknown as WorldQuery;

let tempRoot: string;
let folder: NovelFolder;
let files: string[];
let service: AnalysisService;

function entity(id: string, name: string, over: Partial<AnalysisEntity> = {}): AnalysisEntity {
  return { id, type: 'Persona', name, aliases: [], wordsFound: [name], status: 'verified', ...over };
}

function fact(id: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id,
    kind: 'relationship',
    predicate: 'located_in',
    subjectId: 'e1',
    objectId: 'e2',
    quote: 'Lan lived in Hanoi.',
    status: 'verified',
    ...over,
  };
}

async function seedChapter(
  index: number,
  status: AnalysisIndexEntry['status'],
  entities: AnalysisEntity[],
  facts: AnalysisFact[],
): Promise<void> {
  const file: string = files[index - 1];
  const result: ChapterResult = {
    version: 1,
    file,
    index,
    title: `Chapter ${index}`,
    analysedAt: '2026-01-01T00:00:00.000Z',
    llm: 'x',
    entities,
    facts,
  };
  await writeChapterResult(folder, result);
  const entry: AnalysisIndexEntry = {
    index,
    file,
    status,
    counts: chapterCounts(entities, facts),
    analysedAt: '2026-01-01T00:00:00.000Z',
  };
  await writeAnalysisIndex(folder, upsertIndexEntry(readAnalysisIndex(folder) ?? emptyIndex(), entry));
}

async function seedAll(): Promise<void> {
  await seedChapter(1, 'clean', [entity('e1', 'Mai Linh'), entity('e2', 'Hanoi', { type: 'Location' })], []);
  const failedType: Partial<AnalysisEntity> = {
    status: 'failed',
    reason: 'type-not-allowed',
    issue: 'type-not-allowed',
  };
  const failedQuote: Partial<AnalysisFact> = { status: 'failed', reason: 'label-missing', issue: 'label-missing' };
  await seedChapter(
    2,
    'has-issues',
    [entity('e1', 'Lan'), entity('e2', 'Hanoi', failedType), entity('e3', 'Mai Linh', { status: 'rejected' })],
    [fact('f1'), fact('f2', { quote: 'Never said.', ...failedQuote })],
  );
  await recheckWorld(folder, readMetadata(folder)!);
}

function reviewQuery(over: Partial<ReviewQuery> = {}): ReviewQuery {
  return { novelId, status: 'open', chapterIndex: null, itemKind: 'all', ...over };
}

function editRequest(edit: ReviewEdit): AnalysisEditRequest {
  return { novelId, edit };
}

function itemIds(page: ReviewPage): string[] {
  return page.items.map((item: ReviewItem): string => (item.entity ?? item.fact)!.id);
}

async function idsOf(over: Partial<ReviewQuery>): Promise<string[]> {
  return itemIds(await service.review(reviewQuery(over)));
}

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-analysis-service-'));
  const paths = resolveAppPaths(tempRoot);
  folder = novelFolder(paths, novelId);
  files = [];
  const chapters = [];
  for (const [position, text] of texts.entries()) {
    const written = await writeChapter(folder, text);
    files.push(written.file);
    chapters.push({
      title: `Chapter ${position + 1}`,
      file: written.file,
      paragraphs: written.paragraphs,
      chars: written.chars,
    });
  }
  await writeMetadata(folder, {
    formatVersion: NOVEL_STORE_VERSION,
    id: novelId,
    originalTitle: 'Novel',
    title: 'Novel',
    author: '',
    description: '',
    language: 'en',
    publication: 'ongoing',
    tags: [],
    cover: null,
    importedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    chapters,
  });
  const session = { paths, db: {}, executor: { onRunFinished: vi.fn() } } as unknown as AppDataSession;
  service = new AnalysisService(() => session, { runs: new AnalysisRuns() } as never);
  await seedAll();
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('review', () => {
  it('lists only open items of has-issues and reviewed chapters, never clean ones', async () => {
    const page = await service.review(reviewQuery());
    expect(itemIds(page)).toEqual(['e2', 'f2']);
    expect(page.items.every((item: ReviewItem): boolean => item.chapterIndex === 2)).toBe(true);
    expect(page.openCount).toBe(2);
  });

  it('filters by status, kind and chapter', async () => {
    expect(await idsOf({ status: 'all' })).toEqual(['e2', 'f2']);
    expect(await idsOf({ itemKind: 'fact' })).toEqual(['f2']);
    expect(await idsOf({ itemKind: 'entity' })).toEqual(['e2']);
    expect(await idsOf({ chapterIndex: 1 })).toEqual([]);
    expect(await idsOf({ chapterIndex: 2 })).toEqual(['e2', 'f2']);
    expect(await idsOf({ status: 'verified' })).toEqual([]);
  });

  it('lists a resolved item with the status all and finds the context with fold', async () => {
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'entity', itemId: 'e2' }));
    expect(await idsOf({})).toEqual(['f2']);
    expect(await idsOf({ status: 'rejected' })).toEqual(['e2']);
    const page = await service.review(reviewQuery({ status: 'all' }));
    const entityItem = page.items.find((item: ReviewItem): boolean => item.itemKind === 'entity')!;
    expect(entityItem.context?.match).toBe('Hanoi');
    const factItem = page.items.find((item: ReviewItem): boolean => item.itemKind === 'fact')!;
    expect(factItem.context).toBeNull();
    expect(factItem.subjectName).toBe('Lan');
    expect(factItem.objectName).toBe('Hanoi');
  });

  it('lists a conflict across chapters as one issue and resolves it when one side is rejected', async () => {
    await seedChapter(3, 'clean', [entity('x', 'Mai Linh', { type: 'Location' })], []);
    await recheckWorld(folder, readMetadata(folder)!);
    const conflict = (await service.review(reviewQuery())).items.filter(
      (item: ReviewItem): boolean => item.entity?.reason === 'name-conflict',
    );
    expect(conflict.map((item: ReviewItem): number => item.chapterIndex)).toEqual([1, 3]);
    expect(new Set(conflict.map((item: ReviewItem): string | undefined => item.issueKey)).size).toBe(1);
    expect((await service.status(novelId)).merge).toMatchObject({ openIssues: 3, openErrors: 1 });
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 3, itemKind: 'entity', itemId: 'x' }));
    const saved = readChapterResult(folder, files[0])!.entities[0];
    expect(saved).toMatchObject({ status: 'verified', issue: 'name-conflict' });
    expect((await service.status(novelId)).chapters[0].status).toBe('reviewed');
  });

  it('lists chapter entities without rejected ones', async () => {
    const page = await service.review(reviewQuery());
    expect(page.entities[2].map((item) => item.id)).toEqual(['e1', 'e2']);
    expect(page.entities[1]).toBeUndefined();
  });
});

describe('edit', () => {
  const base = { chapterIndex: 2, itemKind: 'entity' as const };

  function savedEntity(id: string): AnalysisEntity {
    return readChapterResult(folder, files[1])!.entities.find((item: AnalysisEntity): boolean => item.id === id)!;
  }

  function chapterEntry(): AnalysisIndexEntry {
    return readAnalysisIndex(folder)!.chapters.find((item: AnalysisIndexEntry): boolean => item.index === 2)!;
  }

  it('rejects an item and updates the chapter and index', async () => {
    await service.edit(editRequest({ kind: 'review-reject', ...base, itemId: 'e2' }));
    expect(savedEntity('e2').status).toBe('rejected');
    expect(chapterEntry().updatedAt).toBeDefined();
  });

  it('accepts a warning and moves the chapter to reviewed once all are settled', async () => {
    await service.edit(editRequest({ kind: 'review-reject', ...base, itemId: 'e2' }));
    await service.edit(editRequest({ kind: 'review-accept', chapterIndex: 2, itemKind: 'fact', itemId: 'f2' }));
    const saved = readChapterResult(folder, files[1])!;
    expect(saved.facts.find((item: AnalysisFact): boolean => item.id === 'f2')?.status).toBe('accepted');
    expect(chapterEntry().status).toBe('reviewed');
  });

  it('fixes an entity type and re-checks it', async () => {
    await service.edit(editRequest({ kind: 'review-fix', ...base, itemId: 'e2', entity: { type: 'Location' } }));
    expect(savedEntity('e2')).toMatchObject({ type: 'Location', status: 'verified', issue: 'type-not-allowed' });
  });

  it('refuses overlay edits with NOT_IMPLEMENTED', () => {
    const request: AnalysisEditRequest = { novelId, edit: { kind: 'fact-reset', factId: 'f1', chapterIndex: 2 } };
    expect(() => service.edit(request)).toThrow(expect.objectContaining({ code: ErrorCode.NotImplemented }));
  });

  it('refuses an edit in a clean chapter with ANALYSIS_EDIT_INVALID', async () => {
    await expect(
      service.edit(editRequest({ kind: 'review-reject', chapterIndex: 1, itemKind: 'entity', itemId: 'e1' })),
    ).rejects.toMatchObject({ code: ErrorCode.AnalysisEditInvalid });
  });
});

describe('merge and world', () => {
  async function resolveAll(): Promise<void> {
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'entity', itemId: 'e2' }));
    await service.edit(editRequest({ kind: 'review-accept', chapterIndex: 2, itemKind: 'fact', itemId: 'f2' }));
  }

  it('reports open issues, errors and pending chapters before the merge', async () => {
    const status = await service.status(novelId);
    expect(status.merge).toEqual({ pending: 2, openIssues: 2, openErrors: 1, mergedAt: null });
  });

  it('blocks the merge while an error is open', async () => {
    await expect(service.merge(novelId)).rejects.toMatchObject({ code: ErrorCode.AnalysisOpenIssues });
    expect(await service.world(worldQuery)).toEqual({ entities: [], links: [], mergedAt: null });
  });

  it('merges, builds the world from world.json and clears pending', async () => {
    await resolveAll();
    await service.merge(novelId);
    const status = await service.status(novelId);
    expect(status.merge.pending).toBe(0);
    expect(status.merge.openIssues).toBe(0);
    expect(status.merge.mergedAt).not.toBeNull();
    const world = await service.world(worldQuery);
    expect(world.mergedAt).toBe(status.merge.mergedAt);
    expect(world.entities.map((item) => item.name).sort()).toEqual(['Hanoi', 'Lan', 'Mai Linh']);
  });

  it('merges while only warnings are open', async () => {
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'entity', itemId: 'e2' }));
    await service.merge(novelId);
    const status = await service.status(novelId);
    expect(status.merge).toMatchObject({ pending: 0, openIssues: 1, openErrors: 0 });
    expect(readAnalysisIndex(folder)?.mergedAt).toBe(status.merge.mergedAt);
  });

  it('makes a chapter pending again after an edit', async () => {
    await resolveAll();
    await service.merge(novelId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'fact', itemId: 'f2' }));
    expect((await service.status(novelId)).merge.pending).toBe(1);
  });

  it('makes a chapter pending again after a re-run', async () => {
    await resolveAll();
    await service.merge(novelId);
    const index = readAnalysisIndex(folder)!;
    const rerun: AnalysisIndexEntry = { ...index.chapters[0], analysedAt: '2999-01-01T00:00:00.000Z' };
    await writeAnalysisIndex(folder, upsertIndexEntry(index, rerun));
    expect((await service.status(novelId)).merge.pending).toBe(1);
  });
});
