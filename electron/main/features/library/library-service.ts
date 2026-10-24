import { shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { ChapterRequest, ChapterText, DeleteNovelsResult } from '@dreamer/shared/models/novel';
import { NovelChapter, NovelDetail, NovelLock } from '@dreamer/shared/models/novel';
import { NovelPatch, NovelSummary, NovelUpdateRequest } from '@dreamer/shared/models/novel';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { normalizeTags, NovelCoverFile, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { AppPaths } from '@storage/paths';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { readCoverImage } from './cover-image';
import { LibraryIndex } from './library-index';
import { chapterPath, novelFolder, NovelFolder } from './library-files';
import { exportOutputPath } from './novel/novel-export-pipeline';
import { assertUnlocked, novelLocks } from './novel/novel-lock';
import { deleteNovel, readMetadata, saveMetadata, withNovelLock, writeCover } from './novel/novel-files';

function metadataInvalid(id: string): CodedError {
  return new CodedError(ErrorCode.NovelMetadataInvalid, `Novel metadata is invalid: ${id}`);
}

function mergeMetadata(current: NovelMetadata, patch: NovelPatch): NovelMetadata {
  const publication: unknown = patch.publication ?? current.publication;
  if (publication !== 'ongoing' && publication !== 'completed') {
    throw metadataInvalid(current.id);
  }
  const next: NovelMetadata = {
    ...current,
    originalTitle: (patch.originalTitle ?? current.originalTitle).trim(),
    title: (patch.title ?? current.title).trim(),
    author: (patch.author ?? current.author).trim(),
    language: (patch.language ?? current.language).trim(),
    publication,
    tags: normalizeTags(patch.tags ?? current.tags),
    description: (patch.description ?? current.description).trim(),
  };
  if (!next.originalTitle || !next.title || !next.language) {
    throw metadataInvalid(current.id);
  }
  return next;
}

export class LibraryService {
  constructor(
    private readonly paths: AppPaths,
    private readonly index: LibraryIndex,
    private readonly runs: PipelineRunRepository,
    private readonly notify: (novelIds: string[]) => void,
  ) {}

  list(): NovelSummary[] {
    const locks: Map<string, NovelLock> = novelLocks(this.runs);
    return this.index.list().map((novel: NovelSummary): NovelSummary => ({
      ...novel,
      lock: locks.get(novel.id) ?? null,
    }));
  }

  get(id: string): NovelDetail {
    const novel: NovelDetail = this.index.get(id);
    return { ...novel, lock: novelLocks(this.runs).get(id) ?? null };
  }

  async getChapter(request: ChapterRequest): Promise<ChapterText> {
    const missing: CodedError = new CodedError(
      ErrorCode.ChapterFileMissing,
      `Chapter file is missing: ${request.file}`,
    );
    const folder: NovelFolder = novelFolder(this.paths, request.novelId);
    const listed: boolean = this.index
      .get(request.novelId)
      .chapters.some((chapter: NovelChapter): boolean => chapter.file === request.file);
    if (!isContentHash(request.file) || !listed) {
      throw missing;
    }
    try {
      return { paragraphs: splitParagraphs(await readFile(chapterPath(folder, request.file), 'utf-8')) };
    } catch {
      throw missing;
    }
  }

  updateNovel(request: NovelUpdateRequest): Promise<NovelDetail> {
    return withNovelLock(request.id, async (): Promise<NovelDetail> => {
      try {
        this.index.get(request.id);
        assertUnlocked(this.runs, request.id);
        const folder: NovelFolder = novelFolder(this.paths, request.id);
        const current: NovelMetadata | null = readMetadata(folder);
        if (current === null) {
          throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${request.id}`);
        }
        const next: NovelMetadata = mergeMetadata(current, request.patch);
        let cover: NovelCoverFile | null = current.cover;
        if (request.patch.cover === 'remove') {
          cover = null;
        } else if (typeof request.patch.cover === 'object') {
          const image: Awaited<ReturnType<typeof readCoverImage>> = await readCoverImage(request.patch.cover.path);
          cover = await writeCover(folder, image.bytes, image.mime);
        }
        next.cover = cover;
        next.updatedAt = new Date().toISOString();
        await saveMetadata(folder, next);
        this.index.refresh(request.id);
        this.notify([request.id]);
        return this.get(request.id);
      } catch (error: unknown) {
        if (error instanceof CodedError) {
          throw error;
        }
        throw new CodedError(ErrorCode.LibraryWriteFailed, `Novel could not be updated: ${errorMessage(error)}`);
      }
    });
  }

  async deleteNovels(ids: string[]): Promise<DeleteNovelsResult> {
    const result: DeleteNovelsResult = { deleted: [], skipped: [] };
    const uniqueIds: string[] = [...new Set(ids)];
    for (const id of uniqueIds) {
      await withNovelLock(id, async (): Promise<void> => {
        try {
          this.index.get(id);
        } catch (error: unknown) {
          if (error instanceof CodedError && error.code === ErrorCode.NovelNotFound) {
            return;
          }
          throw error;
        }
        if (novelLocks(this.runs).has(id)) {
          result.skipped.push(id);
          return;
        }
        try {
          await deleteNovel(this.paths, id);
        } catch (error: unknown) {
          if (result.deleted.length > 0) {
            this.notify(result.deleted);
          }
          throw new CodedError(ErrorCode.LibraryWriteFailed, `Novel could not be deleted: ${errorMessage(error)}`);
        }
        this.index.remove(id);
        result.deleted.push(id);
      });
    }
    if (result.deleted.length > 0) {
      this.notify(result.deleted);
    }
    return result;
  }

  showExport(runId: string): void {
    const run: PipelineRun | null = this.runs.get(runId);
    const params: Record<string, unknown> | null = this.runs.getParams(runId);
    if (run === null || params === null || run.type !== 'novel-export' || run.status !== 'succeeded') {
      throw new CodedError(ErrorCode.PipelineNotFound, `Finished novel export not found: ${runId}`);
    }
    shell.showItemInFolder(exportOutputPath(params));
  }

  async openFolder(id: string): Promise<void> {
    this.index.get(id);
    const failure: string = await shell.openPath(novelFolder(this.paths, id).dir);
    if (failure) {
      throw new Error(failure);
    }
  }
}
