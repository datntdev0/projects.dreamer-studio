import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NovelCoverFile } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '../../storage/paths';
import * as libraryFiles from './library-files';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const contentHash: string = 'a'.repeat(64);
let tempRoot: string;
let paths: AppPaths;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-library-files-'));
  paths = resolveAppPaths(tempRoot);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('library paths', () => {
  it('builds novel paths from a UUID and chapter paths from a content hash', () => {
    const folder: libraryFiles.NovelFolder = libraryFiles.novelFolder(paths, novelId);

    expect(folder).toEqual({
      dir: join(paths.library, novelId),
      metadata: join(paths.library, novelId, 'metadata.json'),
      chapters: join(paths.library, novelId, 'chapters'),
    });
    expect(libraryFiles.chapterPath(folder, contentHash)).toBe(join(folder.chapters, `${contentHash}.txt`));
    expect(libraryFiles.coverPath(folder, 'cover.jpg')).toBe(join(folder.dir, 'cover.jpg'));
    expect(libraryFiles.coverPath(folder, 'cover.png')).toBe(join(folder.dir, 'cover.png'));
  });

  it('builds fixed roots and a staging path from a UUID', () => {
    expect(libraryFiles.importStagingRoot(paths)).toBe(join(paths.cache, 'import'));
    expect(libraryFiles.importStagingDir(paths, novelId)).toBe(join(paths.cache, 'import', novelId));
    expect(libraryFiles.trashDir(paths)).toBe(join(paths.cache, 'trash'));
  });

  it('builds a folder descriptor for a trusted directory', () => {
    const dir: string = join(tempRoot, 'trusted');

    expect(libraryFiles.novelFolderAt(dir)).toEqual({
      dir,
      metadata: join(dir, 'metadata.json'),
      chapters: join(dir, 'chapters'),
    });
  });

  it.each<string>(['bad-id', novelId.toUpperCase(), '../escape'])('rejects invalid novel id %s', (value: string) => {
    expect((): libraryFiles.NovelFolder => libraryFiles.novelFolder(paths, value)).toThrowError('invalid novel id');
  });

  it.each<string>(['bad-hash', contentHash.toUpperCase(), '../escape'])('rejects invalid content hash %s', (value) => {
    const folder: libraryFiles.NovelFolder = libraryFiles.novelFolder(paths, novelId);

    expect((): string => libraryFiles.chapterPath(folder, value)).toThrowError('invalid content hash');
  });

  it.each<string>(['cover.gif', '../cover.png', 'title.jpg'])('rejects invalid cover %s', (value: string) => {
    const folder: libraryFiles.NovelFolder = libraryFiles.novelFolder(paths, novelId);

    expect((): string => libraryFiles.coverPath(folder, value as NovelCoverFile)).toThrowError('invalid cover file');
  });

  it.each<string>(['bad-run', novelId.toUpperCase(), '../escape'])('rejects invalid run id %s', (value: string) => {
    expect((): string => libraryFiles.importStagingDir(paths, value)).toThrowError('invalid run id');
  });
});

describe('listLibraryFolders', () => {
  it('returns an empty list when the library folder is missing', () => {
    expect(libraryFiles.listLibraryFolders(paths)).toEqual([]);
  });

  it('returns sorted directory names and ignores files', () => {
    mkdirSync(join(paths.library, 'zeta'), { recursive: true });
    mkdirSync(join(paths.library, 'alpha'));
    writeFileSync(join(paths.library, 'metadata.json'), '{}');

    expect(libraryFiles.listLibraryFolders(paths)).toEqual(['alpha', 'zeta']);
    expect(readdirSync(paths.library)).toHaveLength(3);
  });
});
