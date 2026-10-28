import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisIndexEntry } from '@dreamer/shared/models/analysis';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import { novelFolder, NovelFolder } from './library-files';
import { LibraryIndex } from './library-index';

vi.mock('electron', () => ({
  app: { getPath: (): string => 'appData', isPackaged: false },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const files: string[] = [1, 2, 3, 4, 5, 6].map((n: number): string => String(n).repeat(64));
let tempRoot: string;
let paths: AppPaths;
let folder: NovelFolder;
let index: LibraryIndex;

function entry(position: number, file: string): AnalysisIndexEntry {
  const counts = { entities: 0, facts: 0 };
  return { index: position, file, counts, analysedAt: '2026-10-20T10:00:00.000Z' };
}

function writeAnalysisIndex(chapters: AnalysisIndexEntry[]): void {
  const file: string = join(folder.analysis, 'index.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 1, chapters, lastRun: null }));
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-library-index-'));
  paths = resolveAppPaths(tempRoot);
  folder = novelFolder(paths, novelId);
  mkdirSync(folder.chapters, { recursive: true });
  const metadata: NovelMetadata = {
    formatVersion: NOVEL_STORE_VERSION,
    id: novelId,
    originalTitle: 'Original',
    title: 'Title',
    author: 'Author',
    description: '',
    language: 'en',
    publication: 'ongoing',
    tags: [],
    cover: null,
    importedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    chapters: files.map((file: string, position: number) => ({
      title: `Chapter ${position + 1}`,
      file,
      paragraphs: 1,
      chars: 3,
    })),
  };
  writeFileSync(folder.metadata, JSON.stringify(metadata));
  index = new LibraryIndex(paths);
  index.scan();
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('LibraryIndex analysis summary', () => {
  it('REQ-032 AC-6: counts only up-to-date chapters', () => {
    writeAnalysisIndex([
      entry(1, files[0]),
      entry(2, files[1]),
      entry(3, files[2]),
      { ...entry(4, files[3]), error: 'boom' },
      entry(5, 'e'.repeat(64)),
    ]);

    expect(index.list()[0].analysis).toEqual({ analysed: 3, total: 6 });
    expect(index.get(novelId).analysis).toEqual({ analysed: 3, total: 6 });
  });

  it('REQ-032 AC-6: reports none analysed without an analysis index', () => {
    expect(index.list()[0].analysis).toEqual({ analysed: 0, total: 6 });
  });

  it('REQ-032 AC-6: reads the analysis index again on every call', () => {
    expect(index.list()[0].analysis.analysed).toBe(0);

    writeAnalysisIndex([entry(1, files[0])]);

    expect(index.list()[0].analysis.analysed).toBe(1);
  });
});
