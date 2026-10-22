import { BrowserWindow, dialog, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { LibraryChannel } from '@dreamer/shared/ipc/channels';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import * as NovelPackage from '@dreamer/shared/models/novel-package';
import { t } from '../app/app-i18n';
import { importLabel, importParams } from '../features/library/novel-import-pipeline';
import { readPackage } from '../features/library/package-reader';
import { PipelineExecutor } from '../features/pipelines/pipeline-executor';
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

async function pickPackage(event: IpcMainInvokeEvent): Promise<string | null> {
  const result: OpenDialogReturnValue = await openDialog(event, {
    title: t('library.import.dialog.package'),
    properties: ['openFile'],
    filters: [{ name: t('library.import.dialog.packageFilter'), extensions: ['zip'] }],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

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

export function registerLibraryIpc(executor: () => PipelineExecutor): void {
  handle(LibraryChannel.PickPackage, pickPackage);
  handleValidated(LibraryChannel.ReadPackage, isAbsolutePath, readPackage);
  handle(LibraryChannel.PickImage, pickImage);
  handleValidated(LibraryChannel.Import, isImportRequest, (request: NovelPackage.NovelImportRequest): PipelineRun =>
    executor().startRun('novel-import', importParams(request), importLabel(request)),
  );
}
