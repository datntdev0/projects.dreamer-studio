import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelChapter, NovelDetail, SearchProgress } from '@dreamer/shared/models/novel';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import { chapterPath, novelFolder, NovelFolder } from './library-files';
import type { LibraryIndex } from './library-index';
import { NovelSearch } from './novel-search';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
let tempRoot: string;
let paths: AppPaths;

function chapter(position: number, title: string): NovelChapter {
  return { position, title, file: String(position).padStart(64, '0'), paragraphs: 1, chars: 1 };
}

function createSearch(chapters: NovelChapter[], texts: Record<number, string>): NovelSearch {
  const folder: NovelFolder = novelFolder(paths, novelId);
  mkdirSync(folder.chapters, { recursive: true });
  Object.entries(texts).forEach(([position, text]: [string, string]): void => {
    writeFileSync(chapterPath(folder, chapters[Number(position) - 1].file), text);
  });
  const index = { get: (): Pick<NovelDetail, 'chapters'> => ({ chapters }) } as unknown as LibraryIndex;
  return new NovelSearch(paths, index);
}

async function collect(
  search: NovelSearch,
  query: string,
  signal = new AbortController().signal,
): Promise<SearchProgress[]> {
  const progress: SearchProgress[] = [];
  await search.search({ novelId, query, searchId: 's1' }, (item) => progress.push(item), signal);
  return progress;
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-novel-search-'));
  paths = resolveAppPaths(tempRoot);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('NovelSearch', () => {
  it('finds hits in titles and paragraphs with snippets', async () => {
    const chapters: NovelChapter[] = [chapter(1, 'The Dragon'), chapter(2, 'Quiet')];
    const search: NovelSearch = createSearch(chapters, {
      1: 'No match here\nA dragon flew',
      2: `${'x'.repeat(50)} dragon ${'y'.repeat(50)}`,
    });

    const [progress] = await collect(search, 'DRAGON');

    expect(progress).toMatchObject({
      searchId: 's1',
      done: 2,
      total: 2,
      totalHits: 3,
      totalChapters: 2,
      finished: true,
    });
    expect(progress.hits.map((hit) => [hit.position, hit.paragraph, hit.pre, hit.hit])).toEqual([
      [1, null, 'The ', 'Dragon'],
      [1, 1, 'A ', 'dragon'],
      [2, 0, `…${'x'.repeat(39)} `, 'dragon'],
    ]);
    expect(progress.hits[2].post).toBe(` ${'y'.repeat(39)}…`);
  });

  it('counts unreadable chapters as done', async () => {
    const chapters: NovelChapter[] = [chapter(1, 'One'), chapter(2, 'Two')];
    const search: NovelSearch = createSearch(chapters, { 2: 'word' });

    const [progress] = await collect(search, 'word');

    expect(progress).toMatchObject({ done: 2, totalHits: 1, totalChapters: 1, finished: true });
  });

  it('sends progress per batch of 20 chapters', async () => {
    const chapters: NovelChapter[] = Array.from({ length: 21 }, (_, index) => chapter(index + 1, 'Title'));
    const search: NovelSearch = createSearch(chapters, {});

    const progress: SearchProgress[] = await collect(search, 'word');

    expect(progress.map((item) => [item.done, item.finished])).toEqual([
      [20, false],
      [21, true],
    ]);
  });

  it('sends nothing for a blank query or an aborted signal', async () => {
    const search: NovelSearch = createSearch([chapter(1, 'word')], { 1: 'word' });
    const controller: AbortController = new AbortController();
    controller.abort();

    expect(await collect(search, '  ')).toEqual([]);
    expect(await collect(search, 'word', controller.signal)).toEqual([]);
  });
});
