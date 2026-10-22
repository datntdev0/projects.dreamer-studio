import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckOutcome, CheckResult, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '../../storage/paths';
import { SelfCheckEngine } from '../diagnostics/self-check-engine';
import { checkLibraryFiles, registerLibraryChecks } from './library-checks';
import { chapterPath, novelFolder, NovelFolder } from './library-files';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const secondNovelId: string = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const contentHash: string = 'a'.repeat(64);
let tempRoot: string;
let paths: AppPaths;

function sampleMetadata(overrides: Partial<NovelMetadata> = {}): NovelMetadata {
  return {
    formatVersion: NOVEL_STORE_VERSION,
    id: novelId,
    originalTitle: 'Original title',
    title: 'Display title',
    author: 'Author',
    description: 'Description',
    language: 'en',
    publication: 'ongoing',
    tags: [],
    cover: null,
    importedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    chapters: [],
    ...overrides,
  };
}

function writeNovel(
  currentPaths: AppPaths,
  metadata: NovelMetadata,
  chapters: Record<string, string> = {},
): NovelFolder {
  const folder: NovelFolder = novelFolder(currentPaths, metadata.id);
  fs.mkdirSync(folder.chapters, { recursive: true });
  fs.writeFileSync(folder.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  Object.entries(chapters).forEach(([hash, text]: [string, string]): void => {
    fs.writeFileSync(chapterPath(folder, hash), text);
  });
  return folder;
}

function errorOutcome(): CheckOutcome {
  return {
    status: 'error',
    messageKey: 'diagnostics.check.library.files.error',
    fixKey: 'diagnostics.check.library.files.fix',
  };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'dreamer-library-checks-'));
  paths = resolveAppPaths(tempRoot);
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('library file check', () => {
  it('reports ok with the number of valid novels', () => {
    const first: NovelMetadata = sampleMetadata({
      chapters: [{ title: 'Chapter', file: contentHash, paragraphs: 1, chars: 7 }],
      cover: 'cover.png',
    });
    const firstFolder: NovelFolder = writeNovel(paths, first, { [contentHash]: 'Chapter' });
    fs.writeFileSync(join(firstFolder.dir, 'cover.png'), new Uint8Array([1, 2]));
    writeNovel(paths, sampleMetadata({ id: secondNovelId, title: 'Second' }));

    expect(checkLibraryFiles(paths)).toEqual({
      status: 'ok',
      messageKey: 'diagnostics.check.library.files.ok',
      fixKey: null,
      params: { count: 2 },
    });
  });

  it('reports a non-UUID library folder as invalid', () => {
    fs.mkdirSync(join(paths.library, 'package-title'), { recursive: true });

    expect(checkLibraryFiles(paths)).toEqual({
      ...errorOutcome(),
      params: { invalid: 1, missing: 0, folders: 'package-title' },
    });
  });

  it('reports folders with missing and broken metadata as invalid', () => {
    const missing: NovelFolder = novelFolder(paths, novelId);
    const broken: NovelFolder = novelFolder(paths, secondNovelId);
    fs.mkdirSync(missing.dir, { recursive: true });
    fs.mkdirSync(broken.dir, { recursive: true });
    fs.writeFileSync(broken.metadata, '{broken');

    expect(checkLibraryFiles(paths)).toEqual({
      ...errorOutcome(),
      params: { invalid: 2, missing: 0, folders: `${novelId}, ${secondNovelId}` },
    });
  });

  it('reports a chapter referenced by metadata when its file is missing', () => {
    writeNovel(paths, sampleMetadata({ chapters: [{ title: 'Missing', file: contentHash, paragraphs: 1, chars: 7 }] }));

    expect(checkLibraryFiles(paths)).toEqual({
      ...errorOutcome(),
      params: { invalid: 0, missing: 1, folders: novelId },
    });
  });

  it('reports a cover referenced by metadata when its file is missing', () => {
    writeNovel(paths, sampleMetadata({ cover: 'cover.jpg' }));

    expect(checkLibraryFiles(paths)).toEqual({
      ...errorOutcome(),
      params: { invalid: 0, missing: 1, folders: novelId },
    });
  });

  it('truncates the folder summary after five names', () => {
    ['bad-f', 'bad-a', 'bad-e', 'bad-b', 'bad-d', 'bad-c'].forEach((name: string): void => {
      fs.mkdirSync(join(paths.library, name), { recursive: true });
    });

    expect(checkLibraryFiles(paths)).toEqual({
      ...errorOutcome(),
      params: { invalid: 6, missing: 0, folders: 'bad-a, bad-b, bad-c, bad-d, bad-e +1' },
    });
  });

  it('registers the library.files storage check', async () => {
    const engine: SelfCheckEngine = new SelfCheckEngine(() => ({
      paths,
      checkDatabase: (): CheckOutcome => ({ status: 'ok', messageKey: 'unused', fixKey: null }),
      settings: { notice: 'none', invalid: [] },
      backend: 'running',
      pingBackend: (): Promise<boolean> => Promise.resolve(true),
    }));
    registerLibraryChecks(engine);

    const run: DiagnosticsRun = await engine.run();
    const result: CheckResult = run.results[0];

    expect(result).toMatchObject({
      id: 'library.files',
      category: 'storage',
      nameKey: 'diagnostics.check.library.files.name',
      status: 'ok',
      messageKey: 'diagnostics.check.library.files.ok',
      fixKey: null,
      params: { count: 0 },
    });
  });
});
