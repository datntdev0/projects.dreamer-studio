import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import type { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { chapterPath, novelFolder, NovelFolder } from './library-files';
import { LibraryIndex } from './library-index';
import { LibraryService } from './library-service';

vi.mock('electron', () => ({
  app: { getPath: (): string => 'appData', isPackaged: false },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const otherNovelId: string = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const chapterFile: string = 'a'.repeat(64);
let tempRoot: string;
let paths: AppPaths;
let activeRuns: PipelineRun[];
let notify: ReturnType<typeof vi.fn<(ids: string[]) => void>>;
let service: LibraryService;

function writeNovel(id: string): NovelFolder {
  const metadata: NovelMetadata = {
    formatVersion: NOVEL_STORE_VERSION,
    id,
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
    chapters: [{ title: 'One', file: chapterFile, paragraphs: 2, chars: 6 }],
  };
  const folder: NovelFolder = novelFolder(paths, id);
  mkdirSync(folder.chapters, { recursive: true });
  writeFileSync(folder.metadata, JSON.stringify(metadata));
  writeFileSync(chapterPath(folder, chapterFile), 'abc\ndef');
  return folder;
}

function lockRun(id: string): PipelineRun {
  return { id: 'run-1', novelId: id, type: 'novel-export', label: 'Export', status: 'running' } as PipelineRun;
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-library-service-'));
  paths = resolveAppPaths(tempRoot);
  writeNovel(novelId);
  writeNovel(otherNovelId);
  activeRuns = [];
  notify = vi.fn<(ids: string[]) => void>();
  const index: LibraryIndex = new LibraryIndex(paths);
  index.scan();
  const runs = { activeNovelRuns: (): PipelineRun[] => activeRuns } as unknown as PipelineRunRepository;
  service = new LibraryService(paths, index, runs, notify);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('[TH03-02] LibraryService', () => {
  it('lists novels with their active run lock', () => {
    activeRuns = [lockRun(novelId)];

    const locks = Object.fromEntries(service.list().map((novel) => [novel.id, novel.lock]));

    expect(locks).toEqual({
      [novelId]: { runId: 'run-1', type: 'novel-export', label: 'Export', status: 'running' },
      [otherNovelId]: null,
    });
    expect(service.get(otherNovelId)).toMatchObject({ chapterCount: 1, charCount: 6, lock: null });
  });

  it('updates metadata with trimmed fields and notifies', async () => {
    const detail = await service.updateNovel({ id: novelId, patch: { title: '  New title  ', tags: ['Fantasy'] } });

    expect(detail).toMatchObject({ title: 'New title', tags: ['Fantasy'] });
    expect(JSON.parse(readFileSync(novelFolder(paths, novelId).metadata, 'utf-8')).title).toBe('New title');
    expect(notify).toHaveBeenCalledWith([novelId]);
  });

  it('rejects an update of a locked novel or with an empty title', async () => {
    await expect(service.updateNovel({ id: novelId, patch: { title: ' ' } })).rejects.toMatchObject({
      code: ErrorCode.NovelMetadataInvalid,
    });
    activeRuns = [lockRun(novelId)];
    await expect(service.updateNovel({ id: novelId, patch: { title: 'X' } })).rejects.toMatchObject({
      code: ErrorCode.NovelLocked,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('reads and changes chapters', async () => {
    expect(await service.getChapter({ novelId, file: chapterFile })).toEqual({ paragraphs: ['abc', 'def'] });

    const detail = await service.changeChapters({
      novelId,
      change: { kind: 'split', chapter: { position: 1, file: chapterFile }, atParagraph: 1, title: 'Two' },
    });

    expect(detail.chapters.map((chapter) => [chapter.title, chapter.paragraphs])).toEqual([
      ['One', 1],
      ['Two', 1],
    ]);
    expect(await service.getChapter({ novelId, file: detail.chapters[1].file })).toEqual({ paragraphs: ['def'] });
  });

  it('rejects a chapter file not listed in the novel', async () => {
    await expect(service.getChapter({ novelId, file: 'b'.repeat(64) })).rejects.toMatchObject({
      code: ErrorCode.ChapterFileMissing,
    });
  });

  it('deletes unlocked novels, skips locked ones and ignores unknown ids', async () => {
    activeRuns = [lockRun(otherNovelId)];
    const unknownId: string = '00000000-0000-4000-8000-000000000000';

    const result = await service.deleteNovels([novelId, novelId, otherNovelId, unknownId]);

    expect(result).toEqual({ deleted: [novelId], skipped: [otherNovelId] });
    expect(existsSync(novelFolder(paths, novelId).dir)).toBe(false);
    expect(service.list().map((novel) => novel.id)).toEqual([otherNovelId]);
    expect(notify).toHaveBeenCalledWith([novelId]);
  });
});
