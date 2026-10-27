import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  OverlayEdit,
  ReviewEdit,
  ReviewItem,
  ReviewPage,
  ReviewQuery,
  WorldQuery,
} from '@dreamer/shared/models/analysis';
import type { NovelChapterEntry } from '@dreamer/shared/models/novel-store';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import { resolveAppPaths } from '@storage/paths';
import { AppDataSession } from '../../app/app-data-session';
import { chapterPath, novelFolder, NovelFolder } from '../library/library-files';
import { readMetadata, writeChapter, writeMetadata } from '../library/novel/novel-files';
import { readAnalysisIndex, readChapterResult, readWorldFile } from './analysis-files';
import { writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { worldOverlayFile } from './analysis-files';
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
const activeRuns = vi.hoisted(() => ({ list: [] as object[] }));
vi.mock('@storage/repositories/pipeline-run-repository', () => ({
  PipelineRunRepository: class {
    activeNovelRuns(): object[] {
      return activeRuns.list;
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
  activeRuns.list = [];
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
    expect(await service.world(worldQuery)).toEqual({ entities: [], links: [], mergedAt: null, orphans: [] });
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

describe('chapter changes after the merge', () => {
  async function mergeAll(): Promise<void> {
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'entity', itemId: 'e2' }));
    await service.edit(editRequest({ kind: 'review-accept', chapterIndex: 2, itemKind: 'fact', itemId: 'f2' }));
    await service.merge(novelId);
  }

  async function changeChapters(
    change: (chapters: NovelChapterEntry[], added: NovelChapterEntry) => void,
  ): Promise<void> {
    const metadata = readMetadata(folder)!;
    const written = await writeChapter(folder, 'A new chapter text.');
    const added: NovelChapterEntry = {
      title: 'New',
      file: written.file,
      paragraphs: written.paragraphs,
      chars: written.chars,
    };
    change(metadata.chapters, added);
    await writeMetadata(folder, metadata);
  }

  async function worldItems() {
    const world = await service.world(worldQuery);
    const byName = new Map(world.entities.map((item) => [item.name, item]));
    return { world, byName };
  }

  it('marks the entities of an edited chapter stale', async () => {
    await mergeAll();
    await changeChapters((chapters, added) => chapters.splice(1, 1, added));
    const { byName } = await worldItems();
    expect(byName.get('Lan')).toMatchObject({ stale: true, staleChapters: [2], chapters: [2] });
    expect(byName.get('Mai Linh')?.stale).toBeFalsy();
  });

  it('marks the links of an edited chapter stale', async () => {
    const linked = [entity('e1', 'Ann'), entity('e2', 'Bob')];
    await seedChapter(3, 'clean', linked, [fact('f1', { quote: 'Nothing here.' })]);
    await recheckWorld(folder, readMetadata(folder)!);
    await mergeAll();
    expect((await service.world(worldQuery)).links.map((link) => link.stale)).toEqual([undefined]);
    await changeChapters((chapters, added) => chapters.splice(2, 1, added));
    const { world, byName } = await worldItems();
    expect(world.links.map((link) => [link.chapters, link.staleChapters, link.stale])).toEqual([[[3], [3], true]]);
    expect(byName.get('Ann')?.stale).toBe(true);
  });

  it('keeps the world of an inserted chapter and moves the chapters after it', async () => {
    await mergeAll();
    await changeChapters((chapters, added) => chapters.splice(0, 0, added));
    const { world, byName } = await worldItems();
    expect(byName.get('Mai Linh')).toMatchObject({ chapters: [2] });
    expect(byName.get('Lan')).toMatchObject({ chapters: [3] });
    expect(world.entities.some((item) => item.stale)).toBe(false);
    expect(world.links.some((link) => link.stale)).toBe(false);
  });

  it('leaves the results of a deleted chapter out of the world and moves the other chapters', async () => {
    await mergeAll();
    await changeChapters((chapters) => chapters.splice(0, 1));
    const { byName } = await worldItems();
    expect([...byName.keys()]).toEqual(['Lan']);
    expect(byName.get('Lan')).toMatchObject({ chapters: [1] });
    expect(byName.get('Lan')?.stale).toBeFalsy();
  });

  it('keeps the previous world results of a stale chapter on the next merge', async () => {
    await mergeAll();
    await changeChapters((chapters, added) => chapters.splice(1, 1, added));
    await service.merge(novelId);
    expect(readWorldFile(folder)!.chapters.map((chapter) => chapter.index)).toEqual([1, 2]);
    const { byName } = await worldItems();
    expect(byName.get('Lan')).toMatchObject({ stale: true, chapters: [2] });
  });

  it('drops the results of a deleted chapter on the next merge and moves the kept ones', async () => {
    await mergeAll();
    await changeChapters((chapters) => chapters.splice(0, 1));
    await service.merge(novelId);
    const stored = readWorldFile(folder)!.chapters;
    expect(stored.map((chapter) => [chapter.index, chapter.file])).toEqual([[1, files[1]]]);
    expect(readAnalysisIndex(folder)!.chapters.map((item) => [item.index, item.file])).toEqual([[1, files[1]]]);
  });
});

describe('occurrences', () => {
  async function mergedId(name: string): Promise<string> {
    await service.edit(editRequest({ kind: 'review-reject', chapterIndex: 2, itemKind: 'entity', itemId: 'e2' }));
    await service.edit(editRequest({ kind: 'review-accept', chapterIndex: 2, itemKind: 'fact', itemId: 'f2' }));
    await service.merge(novelId);
    return (await service.world(worldQuery)).entities.find((item) => item.name === name)!.id;
  }

  it('gives an empty list before the merge', async () => {
    expect(await service.occurrences({ novelId, entityId: 'e1' })).toEqual([]);
  });

  it('gives an empty list for an unknown entity', async () => {
    await mergedId('Lan');
    expect(await service.occurrences({ novelId, entityId: 'missing' })).toEqual([]);
  });

  it('finds the context of an entity in its chapters', async () => {
    const id: string = await mergedId('Mai Linh');
    const result = await service.occurrences({ novelId, entityId: id });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ chapterIndex: 1, chapterTitle: 'Chapter 1' });
    expect(result[0].context?.match).toBe('Mai Linh');
  });

  it('gives a null context when the chapter text file is missing', async () => {
    const id: string = await mergedId('Mai Linh');
    rmSync(chapterPath(folder, files[0]));
    const result = await service.occurrences({ novelId, entityId: id });
    expect(result).toEqual([{ chapterIndex: 1, chapterTitle: 'Chapter 1', context: null }]);
  });

  it('refuses an unknown novel with NOVEL_NOT_FOUND', async () => {
    await expect(
      service.occurrences({ novelId: '99999999-1234-4abc-8def-1234567890ab', entityId: 'e1' }),
    ).rejects.toMatchObject({ code: ErrorCode.NovelNotFound });
  });
});

describe('overlay', () => {
  const quote: string = 'Lan lived in Hanoi.';

  async function seedMerged(renamedMai: boolean = false): Promise<void> {
    const mai = entity(renamedMai ? 'm2' : 'm', renamedMai ? 'Someone' : 'Mai Linh');
    const hanoi = entity('h', 'Hanoi', { type: 'Location' });
    await seedChapter(1, 'clean', [mai, hanoi], []);
    await seedChapter(2, 'clean', [entity('l', 'Lan'), hanoi], [fact('f1', { subjectId: 'l', objectId: 'h', quote })]);
    await recheckWorld(folder, readMetadata(folder)!);
    await service.merge(novelId);
  }

  async function world() {
    return service.world(worldQuery);
  }

  async function names(): Promise<string[]> {
    return (await world()).entities.map((item) => item.name).sort();
  }

  function overlayFile(): { version: number; edits: OverlayEdit[] } {
    return JSON.parse(readFileSync(worldOverlayFile(folder), 'utf8'));
  }

  beforeEach(async () => {
    await seedMerged();
  });

  it('has no orphans and no overlay file before any edit', async () => {
    expect((await world()).orphans).toEqual([]);
    expect(() => readFileSync(worldOverlayFile(folder))).toThrow();
  });

  it('saves a rename in world-overlay.json and shows it in the world', async () => {
    await service.edit(editRequest({ kind: 'entity-rename', entityId: 'm', name: 'Mai' } as never));
    expect(overlayFile()).toEqual({ version: 1, edits: [{ kind: 'entity-rename', entityId: 'm', name: 'Mai' }] });
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Mai']);
    expect((await world()).entities.find((item) => item.id === 'm')?.overlay).toBe(true);
  });

  it('adds an entity, adds an alias and deletes an entity', async () => {
    await service.edit(
      editRequest({ kind: 'entity-add', entity: { id: 'n1', type: 'Persona', name: 'New' } } as never),
    );
    await service.edit(editRequest({ kind: 'entity-add-alias', entityId: 'l', alias: 'Lanny' } as never));
    await service.edit(editRequest({ kind: 'entity-delete', entityId: 'm' } as never));
    const result = await world();
    expect(result.entities.map((item) => item.name).sort()).toEqual(['Hanoi', 'Lan', 'New']);
    expect(result.entities.find((item) => item.id === 'l')?.aliases).toEqual(['Lanny']);
  });

  it('removes the edits of an entity with entity-reset', async () => {
    await service.edit(editRequest({ kind: 'entity-rename', entityId: 'm', name: 'Mai' } as never));
    await service.edit(editRequest({ kind: 'entity-reset', entityId: 'm' } as never));
    expect(overlayFile().edits).toEqual([]);
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Mai Linh']);
  });

  it('restores a deleted entity with its earlier edits and keeps a compact overlay', async () => {
    const rename: OverlayEdit = { kind: 'entity-rename', entityId: 'm', name: 'Mai' };
    await service.edit(editRequest(rename as never));
    await service.edit(editRequest({ kind: 'entity-delete', entityId: 'm' } as never));
    expect(await names()).toEqual(['Hanoi', 'Lan']);
    await service.edit(editRequest({ kind: 'entity-restore', entityId: 'm' } as never));
    expect(overlayFile().edits).toEqual([rename]);
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Mai']);
  });

  it('refuses an invalid edit with ANALYSIS_EDIT_INVALID and saves nothing', async () => {
    const invalid: unknown[] = [
      { kind: 'entity-rename', entityId: 'zz', name: 'X' },
      { kind: 'entity-rename', entityId: 'm', name: ' ' },
      { kind: 'entity-add', entity: { id: 'n1', type: 'Dragon', name: 'X' } },
      { kind: 'entity-add', entity: { id: 'm', type: 'Persona', name: 'X' } },
    ];
    for (const edit of invalid)
      await expect(service.edit(editRequest(edit as never))).rejects.toMatchObject({
        code: ErrorCode.AnalysisEditInvalid,
      });
    expect(() => readFileSync(worldOverlayFile(folder))).toThrow();
  });

  it('refuses a new fact with a quote that is not in the chapter', async () => {
    const added = (text: string): OverlayEdit => ({
      kind: 'fact-add',
      chapterIndex: 2,
      fact: fact('u1', { predicate: 'friend_of', subjectId: 'l', objectId: 'm', quote: text, addedByUser: true }),
    });
    await expect(service.edit(editRequest(added('Never said.') as never))).rejects.toMatchObject({
      code: ErrorCode.AnalysisQuoteNotFound,
    });
    await service.edit(editRequest(added('mai linh HATED lan.') as never));
    const link = (await world()).links.find((item) => item.predicate === 'friend_of');
    expect(link).toMatchObject({ source: 'l', target: 'm', overlay: true });
  });

  it('stores the base of the merged fact in a fact-edit and applies the patch', async () => {
    const patch = { quote: 'Lan lived in Hanoi' };
    await service.edit(editRequest({ kind: 'fact-edit', factId: 'f1', chapterIndex: 2, patch } as never));
    expect(overlayFile().edits[0]).toMatchObject({
      kind: 'fact-edit',
      base: { predicate: 'located_in', subjectId: 'l', objectId: 'h', quote },
    });
    expect((await world()).links[0].quotes).toEqual([patch.quote]);
  });

  it('saves a second edit of the same merged fact and shows it without an orphan', async () => {
    await service.edit(
      editRequest({
        kind: 'fact-edit',
        factId: 'f1',
        chapterIndex: 2,
        patch: { quote: 'Lan lived in Hanoi' },
      } as never),
    );
    await service.edit(
      editRequest({
        kind: 'fact-edit',
        factId: 'f1',
        chapterIndex: 2,
        patch: { quote: 'mai linh HATED lan.' },
      } as never),
    );
    expect(overlayFile().edits).toHaveLength(2);
    const result = await world();
    expect(result.links[0].quotes).toEqual(['mai linh HATED lan.']);
    expect(result.orphans).toEqual([]);
  });

  it('refuses overlay edits with NOVEL_LOCKED while the novel is locked', async () => {
    activeRuns.list = [{ id: 'r1', novelId, type: 'analysis', label: 'x', status: 'running' }];
    await expect(
      service.edit(editRequest({ kind: 'entity-rename', entityId: 'm', name: 'Mai' } as never)),
    ).rejects.toMatchObject({ code: ErrorCode.NovelLocked });
    expect(() => readFileSync(worldOverlayFile(folder))).toThrow();
  });

  it('keeps an edit after a re-analysis and a merge', async () => {
    await service.edit(editRequest({ kind: 'entity-rename', entityId: 'm', name: 'Mai' } as never));
    await seedMerged();
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Mai']);
    expect((await world()).orphans).toEqual([]);
  });

  it('lists an edit as an orphan, not applied, when its entity left the merged world', async () => {
    const edit: OverlayEdit = { kind: 'entity-rename', entityId: 'm', name: 'Mai' };
    await service.edit(editRequest(edit as never));
    await seedMerged(true);
    const result = await world();
    expect(result.orphans).toEqual([edit]);
    expect(result.entities.map((item) => item.name).sort()).toEqual(['Hanoi', 'Lan', 'Someone']);
  });

  it('lists a fact edit as an orphan when the fact content changed', async () => {
    await service.edit(editRequest({ kind: 'fact-delete', factId: 'f1', chapterIndex: 2 } as never));
    expect((await world()).links).toEqual([]);
    const changed = fact('f1', { subjectId: 'l', objectId: 'h', quote: 'Mai Linh hated Lan.' });
    await seedChapter(2, 'clean', [entity('l', 'Lan'), entity('h', 'Hanoi', { type: 'Location' })], [changed]);
    await service.merge(novelId);
    const result = await world();
    expect(result.orphans).toHaveLength(1);
    expect(result.links).toHaveLength(1);
  });
});

describe('findQuote', () => {
  it('gives one match per chapter containing the quote, with a fold', async () => {
    const result = await service.findQuote({ novelId, quote: '  mai LINH  ' });
    expect(result.map((item) => item.chapterIndex)).toEqual([1, 2]);
    expect(result[0]).toMatchObject({ chapterTitle: 'Chapter 1' });
    expect(result[0].context.match).toBe('Mai Linh');
  });

  it('gives an empty list for an empty or missing quote', async () => {
    expect(await service.findQuote({ novelId, quote: '   ' })).toEqual([]);
    expect(await service.findQuote({ novelId, quote: 'dragon' })).toEqual([]);
  });

  it('refuses an unknown novel with NOVEL_NOT_FOUND', async () => {
    await expect(
      service.findQuote({ novelId: '99999999-1234-4abc-8def-1234567890ab', quote: 'Mai' }),
    ).rejects.toMatchObject({ code: ErrorCode.NovelNotFound });
  });
});
