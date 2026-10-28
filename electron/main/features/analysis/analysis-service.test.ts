import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chapterCounts } from '@dreamer/shared/core/analysis-checks';
import { emptyIndex, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AnalysisEntity, AnalysisFact, ChapterResult, OverlayFile } from '@dreamer/shared/models/analysis';
import type { WorldDraftEdit, WorldQuery } from '@dreamer/shared/models/analysis';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import { resolveAppPaths } from '@storage/paths';
import { AppDataSession } from '../../app/app-data-session';
import { chapterPath, novelFolder, NovelFolder } from '../library/library-files';
import { readMetadata, writeChapter, writeMetadata } from '../library/novel/novel-files';
import { legacyWorldFile, readAnalysisIndex, worldOverlayFile } from './analysis-files';
import { writeAnalysisIndex, writeChapterResult } from './analysis-files';
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
const worldQuery: WorldQuery = { novelId, chapter: null, only: false };
const goodQuote: string = 'Lan lived in Hanoi.';

let tempRoot: string;
let folder: NovelFolder;
let files: string[];
let service: AnalysisService;

function newService(): AnalysisService {
  const session = {
    paths: resolveAppPaths(tempRoot),
    db: {},
    executor: { onRunFinished: vi.fn() },
  } as unknown as AppDataSession;
  return new AnalysisService(() => session, { runs: new AnalysisRuns() } as never);
}

function entity(id: string, name: string, over: Partial<AnalysisEntity> = {}): AnalysisEntity {
  return { id, type: 'Persona', name, aliases: [], ...over };
}

function fact(id: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id,
    kind: 'relationship',
    predicate: 'located_in',
    subjectId: 'l1',
    objectId: 'e2',
    quote: goodQuote,
    ...over,
  };
}

async function seedChapter(index: number, entities: AnalysisEntity[], facts: AnalysisFact[]): Promise<void> {
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
  const entry = { index, file, counts: chapterCounts(entities, facts), analysedAt: '2026-01-01T00:00:00.000Z' };
  await writeAnalysisIndex(folder, upsertIndexEntry(readAnalysisIndex(folder) ?? emptyIndex(), entry));
}

async function seedAll(): Promise<void> {
  await seedChapter(1, [entity('e1', 'Mai Linh'), entity('e2', 'Hanoi', { type: 'Location' })], []);
  await seedChapter(
    2,
    [entity('l1', 'Lan'), entity('e2', 'Hanoi', { type: 'Location' })],
    [fact('f1'), fact('f2', { quote: 'Never said.' })],
  );
}

function rename(entityId: string, name: string): WorldDraftEdit {
  return { kind: 'entity-edit', entityId, patch: { name } };
}

function overlayFile(): OverlayFile {
  return JSON.parse(readFileSync(worldOverlayFile(folder), 'utf8')) as OverlayFile;
}

async function idOf(name: string): Promise<string> {
  return (await service.world(worldQuery)).entities.find((item) => item.name === name)!.id;
}

async function names(): Promise<string[]> {
  return (await service.world(worldQuery)).entities.map((item): string => item.name).sort();
}

beforeEach(async () => {
  activeRuns.list = [];
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-analysis-service-'));
  folder = novelFolder(resolveAppPaths(tempRoot), novelId);
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
  service = newService();
  await seedAll();
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('status', () => {
  it('lists the chapter statuses and counts the issues of the world', async () => {
    const status = await service.status(novelId);
    expect(status.chapters.map((chapter) => chapter.status)).toEqual(['analysed', 'analysed', 'not-analysed']);
    expect(status.issues.errors).toBeGreaterThan(0);
  });

  it('marks a chapter stale when its text changed and keeps its result in the world', async () => {
    const metadata = readMetadata(folder)!;
    const changed = await writeChapter(folder, 'Mai Linh left Hanoi.');
    metadata.chapters[0] = { ...metadata.chapters[0], file: changed.file };
    await writeMetadata(folder, metadata);
    expect((await service.status(novelId)).chapters[0].status).toBe('stale');
    expect((await service.world(worldQuery)).entities.some((item) => item.stale)).toBe(true);
  });
});

describe('review', () => {
  it('lists the issues with their fact and counts', async () => {
    const page = await service.review({ novelId, chapterIndex: null, itemKind: 'all' });
    const item = page.items.find((candidate) => candidate.issue.reason === 'quote-not-found');
    expect(item?.fact?.id).toBe('f2');
    expect(item?.chapterIndex).toBe(2);
    expect(page.counts.errors).toBeGreaterThan(0);
  });

  it('filters by chapter and kind', async () => {
    expect((await service.review({ novelId, chapterIndex: 1, itemKind: 'fact' })).items).toEqual([]);
    expect((await service.review({ novelId, chapterIndex: 2, itemKind: 'fact' })).items.length).toBeGreaterThan(0);
  });
});

describe('scope and preview', () => {
  async function factIssueKey(): Promise<string> {
    const page = await service.review({ novelId, chapterIndex: 2, itemKind: 'fact' });
    return page.items.find((item) => item.issue.reason === 'quote-not-found')!.issue.key;
  }

  it('gives the facts around an issue', async () => {
    const issueKey: string = await factIssueKey();
    const scope = await service.scope({ novelId, issueKey, entityIds: [] });
    expect(scope.issue?.key).toBe(issueKey);
    expect(scope.facts.map((item) => item.id)).toContain('f2');
  });

  it('previews that deleting the fact resolves its issue', async () => {
    const preview = await service.preview({
      novelId,
      issueKey: await factIssueKey(),
      edits: [{ kind: 'fact-delete', factId: 'f2', chapterIndex: 2 }],
    });
    expect(preview).toEqual({ resolved: true, added: [] });
  });
});

describe('occurrences', () => {
  it('gives an empty list for an unknown entity', async () => {
    expect(await service.occurrences({ novelId, entityId: 'missing' })).toEqual([]);
  });

  it('finds the context of an entity in its chapters', async () => {
    const result = await service.occurrences({ novelId, entityId: await idOf('Hanoi') });
    expect(result.map((item) => item.chapterIndex)).toEqual([1, 2]);
    expect(result[0].context?.match).toBe('Hanoi');
  });

  it('gives a null context when the chapter text file is missing', async () => {
    const id: string = await idOf('Mai Linh');
    rmSync(chapterPath(folder, files[0]));
    const result = await newService().occurrences({ novelId, entityId: id });
    expect(result).toEqual([{ chapterIndex: 1, chapterTitle: 'Chapter 1', context: null }]);
  });

  it('refuses an unknown novel with NOVEL_NOT_FOUND', async () => {
    await expect(
      service.occurrences({ novelId: '99999999-1234-4abc-8def-1234567890ab', entityId: 'e1' }),
    ).rejects.toMatchObject({ code: ErrorCode.NovelNotFound });
  });
});

describe('edit', () => {
  it('appends the edits to world-overlay.json and shows them in the world', async () => {
    const id: string = await idOf('Mai Linh');
    await service.edit({ novelId, edits: [rename(id, 'Mai')] });
    await service.edit({ novelId, edits: [rename(id, 'Maya')] });
    expect(overlayFile().version).toBe(2);
    expect(overlayFile().edits).toHaveLength(2);
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Maya']);
  });

  it('refuses an empty list, a missing target and an empty name with ANALYSIS_EDIT_INVALID', async () => {
    const id: string = await idOf('Lan');
    for (const edits of [[], [rename('missing', 'X')], [rename(id, '  ')]])
      await expect(service.edit({ novelId, edits })).rejects.toMatchObject({ code: ErrorCode.AnalysisEditInvalid });
    expect(existsSync(worldOverlayFile(folder))).toBe(false);
  });

  it('deletes the legacy world.json', async () => {
    writeFileSync(legacyWorldFile(folder), '{}');
    await service.edit({ novelId, edits: [rename(await idOf('Lan'), 'Other')] });
    expect(existsSync(legacyWorldFile(folder))).toBe(false);
  });

  it('refuses edits with NOVEL_LOCKED while the novel is locked', async () => {
    activeRuns.list = [{ id: 'r1', novelId, type: 'analysis', label: 'x', status: 'running' }];
    await expect(service.edit({ novelId, edits: [rename('e1', 'Mai')] })).rejects.toMatchObject({
      code: ErrorCode.NovelLocked,
    });
  });

  it('treats an overlay file of another version as empty', async () => {
    writeFileSync(worldOverlayFile(folder), JSON.stringify({ version: 1, edits: [{ kind: 'entity-rename' }] }));
    expect(await names()).toEqual(['Hanoi', 'Lan', 'Mai Linh']);
  });

  it('lists an edit as an orphan when its entity left the world', async () => {
    await service.edit({ novelId, edits: [rename(await idOf('Mai Linh'), 'Mai')] });
    await seedChapter(1, [entity('x1', 'Someone')], []);
    const result = await service.world(worldQuery);
    expect(result.orphans).toHaveLength(1);
    expect(result.entities.map((item) => item.name).sort()).toEqual(['Hanoi', 'Lan', 'Someone']);
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
