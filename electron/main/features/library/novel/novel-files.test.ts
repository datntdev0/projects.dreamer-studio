import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@dreamer/shared/core/novel-text';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import { chapterPath, novelFolder, NovelFolder, trashDir } from '../library-files';
import * as novelFiles from './novel-files';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const otherNovelId: string = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const firstHash: string = 'a'.repeat(64);
const secondHash: string = 'b'.repeat(64);
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
    tags: ['Fantasy'],
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

beforeEach(() => {
  tempRoot = fs.mkdtempSync(join(tmpdir(), 'dreamer-novel-files-'));
  paths = resolveAppPaths(tempRoot);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('[TH03-03] novel content writes', () => {
  it('writes normalized chapter text to a file named by its content hash', async () => {
    const folder: NovelFolder = novelFolder(paths, novelId);
    const normalized: string = 'First paragraph\nSecond paragraph';
    const expectedHash: string = await contentHash(normalized);

    const written: novelFiles.WrittenChapter = await novelFiles.writeChapter(
      folder,
      '  First paragraph \r\n\r\n Second paragraph  \n',
    );

    expect(written).toEqual({ file: expectedHash, paragraphs: 2, chars: 31 });
    expect(fs.readFileSync(chapterPath(folder, expectedHash), 'utf8')).toBe(normalized);
  });

  it('stores the same normalized chapter text only once', async () => {
    const folder: NovelFolder = novelFolder(paths, novelId);

    const first: novelFiles.WrittenChapter = await novelFiles.writeChapter(folder, 'Same\r\n\r\ntext');
    const second: novelFiles.WrittenChapter = await novelFiles.writeChapter(folder, ' Same\ntext ');

    expect(second).toEqual(first);
    expect(fs.readdirSync(folder.chapters)).toEqual([`${first.file}.txt`]);
  });

  it('keeps the other cover format until metadata is saved', async () => {
    const folder: NovelFolder = novelFolder(paths, novelId);

    await expect(novelFiles.writeCover(folder, new Uint8Array([1, 2]), 'image/jpeg')).resolves.toBe('cover.jpg');
    await expect(novelFiles.writeCover(folder, new Uint8Array([3, 4]), 'image/png')).resolves.toBe('cover.png');

    expect(fs.readFileSync(join(folder.dir, 'cover.jpg'))).toEqual(Buffer.from([1, 2]));
    expect(fs.readFileSync(join(folder.dir, 'cover.png'))).toEqual(Buffer.from([3, 4]));
  });
});

describe('[TH03-03] novel metadata writes', () => {
  it('writes valid formatted JSON atomically and leaves no temporary file', async () => {
    const folder: NovelFolder = novelFolder(paths, novelId);
    const metadata: NovelMetadata = sampleMetadata();

    await novelFiles.writeMetadata(folder, metadata);

    expect(fs.readFileSync(folder.metadata, 'utf8')).toBe(`${JSON.stringify(metadata, null, 2)}\n`);
    expect(fs.existsSync(`${folder.metadata}.tmp`)).toBe(false);
  });

  it('refuses invalid metadata and leaves no temporary file', async () => {
    const folder: NovelFolder = novelFolder(paths, novelId);
    const invalid: NovelMetadata = sampleMetadata({ id: '../escape' });

    await expect(novelFiles.writeMetadata(folder, invalid)).rejects.toThrowError('invalid novel metadata');

    expect(fs.existsSync(folder.metadata)).toBe(false);
    expect(fs.existsSync(`${folder.metadata}.tmp`)).toBe(false);
  });

  it('keeps the old metadata file and removes the temporary file when rename fails', async () => {
    const oldMetadata: NovelMetadata = sampleMetadata({ title: 'Old title' });
    const folder: NovelFolder = writeNovel(paths, oldMetadata);
    const oldFile: string = fs.readFileSync(folder.metadata, 'utf8');
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('rename failed'));

    await expect(novelFiles.writeMetadata(folder, sampleMetadata({ title: 'New title' }))).rejects.toThrowError(
      'rename failed',
    );

    expect(fs.readFileSync(folder.metadata, 'utf8')).toBe(oldFile);
    expect(fs.existsSync(`${folder.metadata}.tmp`)).toBe(false);
  });

  it('reads valid metadata and returns null for missing or broken metadata', () => {
    const folder: NovelFolder = novelFolder(paths, novelId);
    expect(novelFiles.readMetadata(folder)).toBeNull();

    fs.mkdirSync(folder.dir, { recursive: true });
    fs.writeFileSync(folder.metadata, '{broken');
    expect(novelFiles.readMetadata(folder)).toBeNull();

    const metadata: NovelMetadata = sampleMetadata();
    fs.writeFileSync(folder.metadata, JSON.stringify(metadata));
    expect(novelFiles.readMetadata(folder)).toEqual(metadata);
  });

  it('removes unreferenced chapters and a cover not named by saved metadata', async () => {
    const metadata: NovelMetadata = sampleMetadata({
      chapters: [{ title: 'Kept', file: firstHash, paragraphs: 1, chars: 4 }],
      cover: null,
    });
    const folder: NovelFolder = writeNovel(paths, metadata, { [firstHash]: 'Kept', [secondHash]: 'Removed' });
    fs.writeFileSync(join(folder.dir, 'cover.jpg'), new Uint8Array([1, 2]));

    await novelFiles.saveMetadata(folder, metadata);

    expect(fs.existsSync(chapterPath(folder, firstHash))).toBe(true);
    expect(fs.existsSync(chapterPath(folder, secondHash))).toBe(false);
    expect(fs.existsSync(join(folder.dir, 'cover.jpg'))).toBe(false);
  });

  it('reorders and renames chapters by changing only metadata.json', async () => {
    const original: NovelMetadata = sampleMetadata({
      chapters: [
        { title: 'First', file: firstHash, paragraphs: 1, chars: 5 },
        { title: 'Second', file: secondHash, paragraphs: 1, chars: 6 },
      ],
    });
    const folder: NovelFolder = writeNovel(paths, original, { [firstHash]: 'First', [secondHash]: 'Second' });
    const fixedTime: Date = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(chapterPath(folder, firstHash), fixedTime, fixedTime);
    fs.utimesSync(chapterPath(folder, secondHash), fixedTime, fixedTime);
    const before: Record<string, number> = {
      [firstHash]: fs.statSync(chapterPath(folder, firstHash)).mtimeMs,
      [secondHash]: fs.statSync(chapterPath(folder, secondHash)).mtimeMs,
    };
    const changed: NovelMetadata = sampleMetadata({
      chapters: [
        { title: 'Renamed second', file: secondHash, paragraphs: 1, chars: 6 },
        { title: 'First', file: firstHash, paragraphs: 1, chars: 5 },
      ],
    });

    await novelFiles.saveMetadata(folder, changed);

    expect(novelFiles.readMetadata(folder)?.chapters).toEqual(changed.chapters);
    expect(fs.statSync(chapterPath(folder, firstHash)).mtimeMs).toBe(before[firstHash]);
    expect(fs.statSync(chapterPath(folder, secondHash)).mtimeMs).toBe(before[secondHash]);
  });
});

describe('[TH03-03] novel lifecycle', () => {
  it('runs same-id tasks in order and continues after a failure', async () => {
    const events: string[] = [];
    let releaseFirst: () => void = (): void => undefined;
    const gate: Promise<void> = new Promise<void>((resolve: () => void): void => {
      releaseFirst = resolve;
    });
    const first: Promise<string> = novelFiles.withNovelLock(novelId, async (): Promise<string> => {
      events.push('first:start');
      await gate;
      events.push('first:failure');
      throw new Error('first failed');
    });
    const firstRejection: Promise<void> = expect(first).rejects.toThrowError('first failed');
    const second: Promise<string> = novelFiles.withNovelLock(novelId, (): Promise<string> => {
      events.push('second');
      return Promise.resolve('done');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await firstRejection;
    await expect(second).resolves.toBe('done');
    expect(events).toEqual(['first:start', 'first:failure', 'second']);
  });

  it('removes a novel folder and leaves no trash entry after successful deletion', async () => {
    const folder: NovelFolder = writeNovel(paths, sampleMetadata(), { [firstHash]: 'Chapter' });

    await novelFiles.deleteNovel(paths, novelId);

    expect(fs.existsSync(folder.dir)).toBe(false);
    const trash: string = trashDir(paths);
    expect(fs.existsSync(trash) ? fs.readdirSync(trash) : []).toEqual([]);
  });

  it('does nothing when deleting a missing novel', async () => {
    await expect(novelFiles.deleteNovel(paths, otherNovelId)).resolves.toBeUndefined();
    expect(fs.existsSync(novelFolder(paths, otherNovelId).dir)).toBe(false);
  });
});
