import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { decodeUtf8 } from '@dreamer/shared/core/novel-text';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { PACKAGE_LIMITS, type CoverMime, type ImportChapterChoice } from '@dreamer/shared/models/novel-package';
import type { ImportPreview, NovelImportRequest, PreviewChapter } from '@dreamer/shared/models/novel-package';
import { NOVEL_STORE_VERSION, normalizeTags, type NovelChapterEntry } from '@dreamer/shared/models/novel-store';
import type { NovelCoverFile, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { t } from '../../app/app-i18n';
import { PipelineDefinition, sleep, StepContext } from '../pipelines/pipeline-definition';
import { importStagingDir, NovelFolder, novelFolder, novelFolderAt } from './library-files';
import { writeChapter, writeCover, writeMetadata, WrittenChapter } from './novel-files';
import { coverMime, openPackageArchive, PackageArchive, readPackage } from './package-reader';

interface ImportState {
  request: NovelImportRequest;
  preview: ImportPreview;
  staging: NovelFolder;
  chapters: NovelChapterEntry[];
  cover: NovelCoverFile | null;
}

interface SelectedChapter {
  preview: PreviewChapter;
  choice: ImportChapterChoice;
}

const states: Map<string, ImportState> = new Map<string, ImportState>();
const renameDelayMs: number = 200;
const renameRetries: number = 3;

function requestFrom(ctx: StepContext): NovelImportRequest {
  const request: unknown = ctx.params.request;
  if (typeof request !== 'object' || request === null) {
    throw new Error('Novel import request is missing');
  }
  return request as NovelImportRequest;
}

function stateFor(ctx: StepContext): ImportState {
  const state: ImportState | undefined = states.get(ctx.runId);
  if (!state) {
    throw new Error('Novel import state is missing');
  }
  return state;
}

function packageChanged(message: string): CodedError {
  return new CodedError(ErrorCode.PackageChanged, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function asWriteError(error: unknown): never {
  if (error instanceof CodedError || isAbortError(error)) {
    throw error;
  }
  throw new CodedError(ErrorCode.LibraryWriteFailed, errorMessage(error));
}

async function checkStep(ctx: StepContext): Promise<void> {
  const request: NovelImportRequest = requestFrom(ctx);
  let details: Awaited<ReturnType<typeof stat>>;
  try {
    details = await stat(request.path);
  } catch (error: unknown) {
    throw packageChanged(errorMessage(error));
  }
  if (!details.isFile() || details.size !== request.size || details.mtimeMs !== request.modifiedMs) {
    throw packageChanged('The package changed after it was previewed');
  }

  const result: Awaited<ReturnType<typeof readPackage>> = await readPackage(request.path);
  if (result.status !== 'ok') {
    throw packageChanged('The package is no longer valid');
  }
  if (result.preview.file.size !== request.size || result.preview.file.modifiedMs !== request.modifiedMs) {
    throw packageChanged('The package changed while it was being checked');
  }
  const indexes: Set<number> = new Set(result.preview.chapters.map((chapter: PreviewChapter): number => chapter.index));
  request.chapters.forEach((chapter: ImportChapterChoice): void => {
    if (!indexes.has(chapter.index)) {
      throw new Error(`Chapter ${chapter.index} is not in the package preview`);
    }
  });
  states.set(ctx.runId, {
    request,
    preview: result.preview,
    staging: novelFolderAt(importStagingDir(ctx.paths, ctx.runId)),
    chapters: [],
    cover: null,
  });
  ctx.progress(100);
}

function selectedChapters(state: ImportState): SelectedChapter[] {
  const choices: Map<number, ImportChapterChoice> = new Map(
    state.request.chapters.map((choice: ImportChapterChoice): [number, ImportChapterChoice] => [choice.index, choice]),
  );
  const selected: SelectedChapter[] = [];
  state.preview.chapters.forEach((preview: PreviewChapter): void => {
    const choice: ImportChapterChoice | undefined = choices.get(preview.index);
    if (choice?.included) {
      selected.push({ preview, choice });
    }
  });
  return selected;
}

async function extractChapter(
  archive: PackageArchive,
  state: ImportState,
  selected: SelectedChapter,
  position: number,
): Promise<void> {
  const bytes: Uint8Array = await archive.read(selected.preview.file, 'chapter', PACKAGE_LIMITS.chapterBytes);
  const text: string | null = decodeUtf8(bytes);
  if (text === null) {
    throw packageChanged(`Chapter is no longer UTF-8: ${selected.preview.file}`);
  }
  const written: WrittenChapter = await writeChapter(state.staging, text);
  const title: string =
    selected.choice.title.trim() || t('library.import.chapters.titlePlaceholder', { index: position });
  state.chapters.push({ title, ...written });
}

async function extractPackageCover(archive: PackageArchive, state: ImportState): Promise<void> {
  if (state.preview.cover === null) {
    state.cover = null;
    return;
  }
  const bytes: Uint8Array = await archive.read(state.preview.cover.file, 'cover', PACKAGE_LIMITS.coverBytes);
  state.cover = await writeCover(state.staging, bytes, state.preview.cover.mime);
}

async function extractFileCover(state: ImportState, path: string): Promise<void> {
  const bytes: Uint8Array = await readFile(path);
  const mime: CoverMime | null = coverMime(bytes);
  if (bytes.byteLength > PACKAGE_LIMITS.coverBytes || mime === null) {
    throw new CodedError(ErrorCode.PackageUnreadable, `Invalid cover image: ${path}`);
  }
  state.cover = await writeCover(state.staging, bytes, mime);
}

async function extractCover(archive: PackageArchive, state: ImportState): Promise<void> {
  if (state.request.cover.kind === 'package') {
    await extractPackageCover(archive, state);
  } else if (state.request.cover.kind === 'file') {
    await extractFileCover(state, state.request.cover.path);
  } else {
    state.cover = null;
  }
}

async function extractStep(ctx: StepContext): Promise<void> {
  try {
    const state: ImportState = stateFor(ctx);
    const selected: SelectedChapter[] = selectedChapters(state);
    state.chapters = [];
    state.cover = null;
    const archive: PackageArchive = await openPackageArchive(state.request.path);
    try {
      for (let offset: number = 0; offset < selected.length; offset += 1) {
        await extractChapter(archive, state, selected[offset], offset + 1);
        ctx.progress(((offset + 1) / selected.length) * 100);
        ctx.checkpoint();
        if ((offset + 1) % 100 === 0) {
          ctx.log.info(`Extracted ${offset + 1} of ${selected.length} chapters`);
        }
      }
      await extractCover(archive, state);
      ctx.progress(100);
    } finally {
      archive.close();
    }
  } catch (error: unknown) {
    asWriteError(error);
  }
}

function buildMetadata(state: ImportState, id: string): NovelMetadata {
  const now: string = new Date().toISOString();
  const language: string = Intl.getCanonicalLocales(state.request.metadata.language.trim())[0];
  return {
    formatVersion: NOVEL_STORE_VERSION,
    id,
    originalTitle: state.request.metadata.originalTitle.trim(),
    title: state.request.metadata.title.trim(),
    author: state.request.metadata.author.trim(),
    description: state.request.metadata.description.trim(),
    language,
    publication: state.request.metadata.publication,
    tags: normalizeTags(state.request.metadata.tags),
    cover: state.cover,
    importedAt: now,
    updatedAt: now,
    chapters: state.chapters,
  };
}

function isRetryableRename(error: unknown): boolean {
  const code: string | undefined = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

async function renameWithRetry(source: string, destination: string, signal: AbortSignal): Promise<void> {
  for (let attempt: number = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (!isRetryableRename(error) || attempt >= renameRetries) {
        throw error;
      }
      await sleep(renameDelayMs, signal);
    }
  }
}

async function saveStep(ctx: StepContext): Promise<void> {
  try {
    const state: ImportState = stateFor(ctx);
    const id: string = randomUUID();
    const metadata: NovelMetadata = buildMetadata(state, id);
    await writeMetadata(state.staging, metadata);
    await mkdir(ctx.paths.library, { recursive: true });
    await renameWithRetry(state.staging.dir, novelFolder(ctx.paths, id).dir, ctx.signal);
    ctx.setNovelId(id);
    ctx.progress(100);
    ctx.log.info(`Imported novel ${id} with ${state.chapters.length} chapters`);
    states.delete(ctx.runId);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

async function cleanup(ctx: StepContext): Promise<void> {
  try {
    await rm(importStagingDir(ctx.paths, ctx.runId), { recursive: true, force: true });
  } finally {
    states.delete(ctx.runId);
  }
}

export const novelImportPipeline: PipelineDefinition = {
  type: 'novel-import',
  steps: [
    { key: 'library.import.step.check', backend: false, run: checkStep },
    { key: 'library.import.step.extract', backend: false, run: extractStep },
    { key: 'library.import.step.save', backend: false, run: saveStep },
  ],
  cleanup,
};

export function importParams(request: NovelImportRequest): Record<string, unknown> {
  return { request };
}

export function importLabel(request: NovelImportRequest): string {
  return request.metadata.title.trim() || request.metadata.originalTitle.trim();
}
