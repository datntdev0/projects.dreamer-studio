import { BrowserWindow, dialog, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue, shell } from 'electron';
import { stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute } from 'node:path';
import { LibraryChannel } from '@dreamer/shared/ipc/channels';
import { NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import { isNovelId } from '@dreamer/shared/models/novel-store';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import * as NovelPackage from '@dreamer/shared/models/novel-package';
import { t } from '../app/app-i18n';
import { AppDataSession } from '../app/app-data-session';
import { novelFolder } from '../features/library/library-files';
import { importLabel, importParams } from '../features/library/novel-import-pipeline';
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
  const details: Awaited<ReturnType<typeof stat>> = await stat(path);
  return { path, name: basename(path), size: details.size };
}

function isNovelIdValue(value: unknown): value is string {
  return typeof value === 'string' && isNovelId(value);
}

async function openFolder(session: AppDataSession, id: string): Promise<void> {
  session.index.get(id);
  const failure: string = await shell.openPath(novelFolder(session.paths, id).dir);
  if (failure) {
    throw new Error(failure);
  }
}

export function registerLibraryIpc(session: () => AppDataSession): void {
  handle(LibraryChannel.PickPackage, pickPackage);
  handleValidated(LibraryChannel.ReadPackage, isAbsolutePath, readPackage);
  handle(LibraryChannel.PickImage, pickImage);
  handleValidated(LibraryChannel.Import, isImportRequest, (request: NovelPackage.NovelImportRequest): PipelineRun =>
    session().executor.startRun('novel-import', importParams(request), importLabel(request)),
  );
  handle(LibraryChannel.List, (): NovelSummary[] => session().index.list());
  handleValidated(LibraryChannel.Get, isNovelIdValue, (id: string): NovelDetail => session().index.get(id));
  handleValidated(LibraryChannel.OpenFolder, isNovelIdValue, (id: string): Promise<void> => openFolder(session(), id));
}
