import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '../../storage/paths';
import { cleanLibrary, LibraryCleanup } from './library-cleanup';
import { chapterPath, importStagingRoot, novelFolder, NovelFolder, trashDir } from './library-files';

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({ createLogger: (): object => logger }));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const invalidMetadataId: string = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const referencedHash: string = 'a'.repeat(64);
const unreferencedHash: string = 'b'.repeat(64);
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
    chapters: [{ title: 'Kept', file: referencedHash, paragraphs: 1, chars: 4 }],
    ...overrides,
  };
}

function writeNovel(currentPaths: AppPaths, metadata: NovelMetadata, chapters: Record<string, string>): NovelFolder {
  const folder: NovelFolder = novelFolder(currentPaths, metadata.id);
  fs.mkdirSync(folder.chapters, { recursive: true });
  fs.writeFileSync(folder.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  Object.entries(chapters).forEach(([hash, text]: [string, string]): void => {
    fs.writeFileSync(chapterPath(folder, hash), text);
  });
  return folder;
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'dreamer-library-cleanup-'));
  paths = resolveAppPaths(tempRoot);
  logger.info.mockClear();
  logger.error.mockClear();
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('library cleanup', () => {
  it('removes staging, trash, temporary files, and unreferenced chapters while preserving valid data', () => {
    const importRoot: string = importStagingRoot(paths);
    fs.mkdirSync(join(importRoot, 'interrupted-folder'), { recursive: true });
    fs.writeFileSync(join(importRoot, 'interrupted-file'), 'staged');
    const trashRoot: string = trashDir(paths);
    fs.mkdirSync(join(trashRoot, 'deleted-novel'), { recursive: true });
    const valid: NovelFolder = writeNovel(paths, sampleMetadata(), {
      [referencedHash]: 'Kept',
      [unreferencedHash]: 'Removed',
    });
    fs.writeFileSync(`${valid.metadata}.tmp`, 'temporary');
    fs.writeFileSync(join(valid.chapters, `${unreferencedHash}.tmp`), 'temporary');
    const invalid: NovelFolder = novelFolder(paths, invalidMetadataId);
    fs.mkdirSync(invalid.chapters, { recursive: true });
    fs.writeFileSync(invalid.metadata, '{broken');
    fs.writeFileSync(`${invalid.metadata}.tmp`, 'keep');
    fs.writeFileSync(chapterPath(invalid, unreferencedHash), 'keep');

    const result: LibraryCleanup = cleanLibrary(paths);

    expect(result).toEqual({ staging: 3, temp: 2, chapters: 1 });
    expect(fs.readdirSync(importRoot)).toEqual([]);
    expect(fs.readdirSync(trashRoot)).toEqual([]);
    expect(fs.existsSync(chapterPath(valid, referencedHash))).toBe(true);
    expect(fs.existsSync(chapterPath(valid, unreferencedHash))).toBe(false);
    expect(fs.existsSync(`${valid.metadata}.tmp`)).toBe(false);
    expect(fs.existsSync(join(valid.chapters, `${unreferencedHash}.tmp`))).toBe(false);
    expect(fs.existsSync(invalid.dir)).toBe(true);
    expect(fs.existsSync(`${invalid.metadata}.tmp`)).toBe(true);
    expect(fs.existsSync(chapterPath(invalid, unreferencedHash))).toBe(true);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('library cleanup: 3 staging, 2 temp, 1 chapter files removed');
  });

  it('returns zero counts when cleanup roots are missing', () => {
    expect(cleanLibrary(paths)).toEqual({ staging: 0, temp: 0, chapters: 0 });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
