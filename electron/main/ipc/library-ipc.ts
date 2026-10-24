import { BrowserWindow, dialog, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { SaveDialogOptions, SaveDialogReturnValue } from 'electron';
import { Buffer } from 'node:buffer';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { safeFileName } from '@dreamer/shared/core/file-name';
import { LibraryChannel } from '@dreamer/shared/ipc/channels';
import { DeleteNovelsResult } from '@dreamer/shared/models/novel';
import { NovelDetail, NovelPatch, NovelSummary, NovelUpdateRequest } from '@dreamer/shared/models/novel';
import {
  ChapterChange,
  ChapterChangeRequest,
  ChapterRef,
  ChapterRequest,
  ChapterText,
} from '@dreamer/shared/models/novel';
import { SearchRequest } from '@dreamer/shared/models/novel';
import { isContentHash, isNovelId } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import * as NovelPackage from '@dreamer/shared/models/novel-package';
import { t } from '../app/app-i18n';
import { AppDataSession } from '../app/app-data-session';
import { readCoverImage } from '../features/library/cover-image';
import { NovelSearch } from '../features/library/novel-search';
import { NovelSearches } from '../features/library/novel-search';
import { exportLabel, exportParams } from '../features/library/novel/novel-export-pipeline';
import { importLabel, importParams } from '../features/library/novel/novel-import-pipeline';
import { readPackage } from '../features/library/package-reader';
import { handle, handleValidated } from './handle';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string');
}

function isMetadata(value: unknown): value is NovelPackage.ImportMetadata {
  return (
    isRecord(value) &&
    typeof value.originalTitle === 'string' &&
    value.originalTitle.trim().length > 0 &&
    typeof value.title === 'string' &&
    typeof value.author === 'string' &&
    typeof value.description === 'string' &&
    isStringArray(value.tags) &&
    typeof value.language === 'string' &&
    value.language.trim().length > 0 &&
    (value.publication === 'ongoing' || value.publication === 'completed')
  );
}

function isCover(value: unknown): value is NovelPackage.ImportCoverChoice {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'package' || value.kind === 'none') {
    return true;
  }
  return value.kind === 'file' && typeof value.path === 'string' && isAbsolute(value.path);
}

function isChapter(value: unknown): value is NovelPackage.ImportChapterChoice {
  return (
    isRecord(value) &&
    Number.isInteger(value.index) &&
    (value.index as number) >= 1 &&
    typeof value.title === 'string' &&
    typeof value.included === 'boolean'
  );
}

function isPackagePath(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && value.toLocaleLowerCase('en-US').endsWith('.zip');
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value);
}

export function isImportRequest(value: unknown): value is NovelPackage.NovelImportRequest {
  return (
    isRecord(value) &&
    isPackagePath(value.path) &&
    isFiniteNonNegative(value.size) &&
    isFiniteNonNegative(value.modifiedMs) &&
    isMetadata(value.metadata) &&
    isCover(value.cover) &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isChapter)
  );
}

async function openDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const parent: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

async function saveDialog(event: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const parent: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

export function createPackagePicker(): (event: IpcMainInvokeEvent) => Promise<string | null> {
  let lastDirectory: string | undefined;
  return async (event: IpcMainInvokeEvent): Promise<string | null> => {
    const options: OpenDialogOptions = {
      title: t('library.import.dialog.package'),
      properties: ['openFile'],
      filters: [{ name: t('library.import.dialog.packageFilter'), extensions: ['zip'] }],
    };
    if (lastDirectory !== undefined) options.defaultPath = lastDirectory;
    const result: OpenDialogReturnValue = await openDialog(event, options);
    const path: string | undefined = result.filePaths[0];
    if (result.canceled || path === undefined) return null;
    lastDirectory = dirname(path);
    return path;
  };
}

const pickPackage: (event: IpcMainInvokeEvent) => Promise<string | null> = createPackagePicker();

async function pickImage(event: IpcMainInvokeEvent): Promise<NovelPackage.PickedImage | null> {
  const result: OpenDialogReturnValue = await openDialog(event, {
    title: t('library.import.dialog.image'),
    properties: ['openFile'],
    filters: [{ name: t('library.import.dialog.imageFilter'), extensions: ['jpg', 'jpeg', 'png'] }],
  });
  const path: string | undefined = result.filePaths[0];
  if (result.canceled || path === undefined) {
    return null;
  }
  const image: Awaited<ReturnType<typeof readCoverImage>> = await readCoverImage(path);
  const previewUrl: string = `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`;
  return { path, name: basename(path), size: image.bytes.byteLength, previewUrl };
}

let lastExportDirectory: string | undefined;

async function exportNovel(
  event: IpcMainInvokeEvent,
  session: AppDataSession,
  id: string,
): Promise<PipelineRun | null> {
  const novel: NovelDetail = session.library.get(id);
  const fileName: string = `${safeFileName(exportLabel(novel))}.zip`;
  const result: SaveDialogReturnValue = await saveDialog(event, {
    title: t('library.export.dialog.title'),
    defaultPath: lastExportDirectory === undefined ? fileName : join(lastExportDirectory, fileName),
    filters: [{ name: t('library.export.dialog.packageFilter'), extensions: ['zip'] }],
  });
  if (result.canceled || result.filePath === '') {
    return null;
  }
  const outputPath: string = result.filePath.toLocaleLowerCase('en-US').endsWith('.zip')
    ? result.filePath
    : `${result.filePath}.zip`;
  lastExportDirectory = dirname(outputPath);
  return session.executor.startRun('novel-export', exportParams(id, outputPath), exportLabel(novel), id);
}

function isNovelIdValue(value: unknown): value is string {
  return typeof value === 'string' && isNovelId(value);
}

export function isNovelIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 1000 && value.every(isNovelIdValue);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed: Set<string> = new Set(keys);
  return Object.keys(value).every((key: string): boolean => allowed.has(key));
}

function isPatchCover(value: unknown): boolean {
  if (value === 'keep' || value === 'remove') {
    return true;
  }
  return isRecord(value) && hasOnlyKeys(value, ['path']) && typeof value.path === 'string' && isAbsolute(value.path);
}

function isNovelPatch(value: unknown): value is NovelPatch {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['originalTitle', 'title', 'author', 'language', 'publication', 'tags', 'description', 'cover'])
  ) {
    return false;
  }
  return (
    (value.originalTitle === undefined || typeof value.originalTitle === 'string') &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.author === undefined || typeof value.author === 'string') &&
    (value.language === undefined || typeof value.language === 'string') &&
    (value.publication === undefined || typeof value.publication === 'string') &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.cover === undefined || isPatchCover(value.cover))
  );
}

export function isNovelUpdateRequest(value: unknown): value is NovelUpdateRequest {
  return (
    isRecord(value) && hasOnlyKeys(value, ['id', 'patch']) && isNovelIdValue(value.id) && isNovelPatch(value.patch)
  );
}

export function isChapterRequest(value: unknown): value is ChapterRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['novelId', 'file']) &&
    isNovelIdValue(value.novelId) &&
    typeof value.file === 'string' &&
    isContentHash(value.file)
  );
}

function isChapterRef(value: unknown): value is ChapterRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['position', 'file']) &&
    Number.isInteger(value.position) &&
    (value.position as number) > 0 &&
    typeof value.file === 'string' &&
    isContentHash(value.file)
  );
}

function isChapterRefs(value: unknown): value is ChapterRef[] {
  return Array.isArray(value) && value.every(isChapterRef);
}

function isChapterChange(value: unknown): value is ChapterChange {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'rename':
      return (
        hasOnlyKeys(value, ['kind', 'chapter', 'title']) &&
        isChapterRef(value.chapter) &&
        typeof value.title === 'string'
      );
    case 'move':
      return (
        hasOnlyKeys(value, ['kind', 'chapters', 'toIndex']) &&
        isChapterRefs(value.chapters) &&
        typeof value.toIndex === 'number'
      );
    case 'merge':
    case 'delete':
      return hasOnlyKeys(value, ['kind', 'chapters']) && isChapterRefs(value.chapters);
    case 'split':
      return (
        hasOnlyKeys(value, ['kind', 'chapter', 'atParagraph', 'title']) &&
        isChapterRef(value.chapter) &&
        typeof value.atParagraph === 'number' &&
        typeof value.title === 'string'
      );
    default:
      return false;
  }
}

export function isChapterChangeRequest(value: unknown): value is ChapterChangeRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['novelId', 'change']) &&
    isNovelIdValue(value.novelId) &&
    isChapterChange(value.change)
  );
}

function isSearchRequest(value: unknown): value is SearchRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['novelId', 'query', 'searchId']) &&
    isNovelIdValue(value.novelId) &&
    typeof value.query === 'string' &&
    typeof value.searchId === 'string' &&
    value.searchId.trim().length > 0
  );
}

function isSearchId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function registerLibraryIpc(session: () => AppDataSession): void {
  const searches: NovelSearches = new NovelSearches(() => new NovelSearch(session().paths, session().index));
  handleValidated(
    LibraryChannel.Export,
    isNovelIdValue,
    (id: string, event: IpcMainInvokeEvent): Promise<PipelineRun | null> => exportNovel(event, session(), id),
  );
  handleValidated(LibraryChannel.ShowExport, isNovelIdValue, (runId: string): void =>
    session().library.showExport(runId),
  );
  handle(LibraryChannel.PickPackage, pickPackage);
  handleValidated(LibraryChannel.ReadPackage, isAbsolutePath, (path: string): ReturnType<typeof readPackage> =>
    readPackage(path),
  );
  handle(LibraryChannel.PickImage, pickImage);
  handleValidated(LibraryChannel.Import, isImportRequest, (request: NovelPackage.NovelImportRequest): PipelineRun =>
    session().executor.startRun('novel-import', importParams(request), importLabel(request)),
  );
  handle(LibraryChannel.List, (): NovelSummary[] => session().library.list());
  handleValidated(LibraryChannel.Get, isNovelIdValue, (id: string): NovelDetail => session().library.get(id));
  handleValidated(LibraryChannel.GetChapter, isChapterRequest, (request: ChapterRequest): Promise<ChapterText> =>
    session().library.getChapter(request),
  );
  handleValidated(LibraryChannel.Search, isSearchRequest, (request: SearchRequest, event: IpcMainInvokeEvent): void =>
    searches.start(event.sender, request),
  );
  handleValidated(LibraryChannel.SearchCancel, isSearchId, (searchId: string, event: IpcMainInvokeEvent): void =>
    searches.cancel(event.sender, searchId),
  );
  handleValidated(
    LibraryChannel.UpdateNovel,
    isNovelUpdateRequest,
    (request: NovelUpdateRequest): Promise<NovelDetail> => session().library.updateNovel(request),
  );
  handleValidated(
    LibraryChannel.ChangeChapters,
    isChapterChangeRequest,
    (request: ChapterChangeRequest): Promise<NovelDetail> => session().library.changeChapters(request),
  );
  handleValidated(LibraryChannel.DeleteNovels, isNovelIdList, (ids: string[]): Promise<DeleteNovelsResult> =>
    session().library.deleteNovels(ids),
  );
  handleValidated(LibraryChannel.OpenFolder, isNovelIdValue, (id: string): Promise<void> =>
    session().library.openFolder(id),
  );
}
