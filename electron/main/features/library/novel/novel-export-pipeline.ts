import { rmSync, Stats } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineDefinition, StepContext } from '../../pipelines/pipeline-definition';
import { chapterPath, coverPath, NovelFolder, novelFolder } from '../library-files';
import { asWriteError, renameWithRetry } from '../library-io';
import { writePackage } from '../package-writer';
import { readMetadata } from './novel-files';

interface ExportState {
  folder: NovelFolder;
  metadata: NovelMetadata;
}

const states: Map<string, ExportState> = new Map<string, ExportState>();

function stringParam(params: Record<string, unknown>, name: string): string {
  const value: unknown = params[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Novel export parameter is missing: ${name}`);
  }
  return value;
}

export function exportOutputPath(params: Record<string, unknown>): string {
  return stringParam(params, 'outputPath');
}

function exportTempPath(outputPath: string): string {
  return `${outputPath}.tmp`;
}

function stateFor(ctx: StepContext): ExportState {
  const state: ExportState | undefined = states.get(ctx.runId);
  if (!state) {
    throw new Error('Novel export state is missing');
  }
  return state;
}

async function requireFile(path: string, what: string): Promise<void> {
  const isFile: boolean = await stat(path).then(
    (details: Stats): boolean => details.isFile(),
    (): boolean => false,
  );
  if (!isFile) {
    throw new CodedError(ErrorCode.ChapterFileMissing, `${what} is missing: ${path}`);
  }
}

async function snapshotStep(ctx: StepContext): Promise<void> {
  const novelId: string = stringParam(ctx.params, 'novelId');
  const folder: NovelFolder = novelFolder(ctx.paths, novelId);
  const metadata: NovelMetadata | null = readMetadata(folder);
  if (metadata === null) {
    throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
  }
  if (metadata.cover !== null) {
    await requireFile(coverPath(folder, metadata.cover), 'Cover file');
  }
  for (const chapter of metadata.chapters) {
    await requireFile(chapterPath(folder, chapter.file), 'Chapter file');
    ctx.checkpoint();
  }
  states.set(ctx.runId, { folder, metadata });
  ctx.progress(100);
  ctx.log.info(`Exporting novel ${novelId} with ${metadata.chapters.length} chapters`);
}

async function writeStep(ctx: StepContext): Promise<void> {
  try {
    const state: ExportState = stateFor(ctx);
    await writePackage(state.folder, state.metadata, exportTempPath(exportOutputPath(ctx.params)), ctx);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

async function finishStep(ctx: StepContext): Promise<void> {
  try {
    const outputPath: string = exportOutputPath(ctx.params);
    await renameWithRetry(exportTempPath(outputPath), outputPath, ctx.signal);
    ctx.progress(100);
    ctx.log.info(`Exported to ${outputPath}`);
    states.delete(ctx.runId);
  } catch (error: unknown) {
    asWriteError(error);
  }
}

async function cleanup(ctx: StepContext): Promise<void> {
  try {
    await rm(exportTempPath(exportOutputPath(ctx.params)), { force: true });
  } finally {
    states.delete(ctx.runId);
  }
}

function discard(params: Record<string, unknown>): void {
  rmSync(exportTempPath(exportOutputPath(params)), { force: true });
}

export const novelExportPipeline: PipelineDefinition = {
  type: 'novel-export',
  steps: [
    { key: 'library.export.step.snapshot', backend: false, run: snapshotStep },
    { key: 'library.export.step.write', backend: false, run: writeStep },
    { key: 'library.export.step.finish', backend: false, run: finishStep },
  ],
  cleanup,
  discard,
};

export function exportParams(novelId: string, outputPath: string): Record<string, unknown> {
  return { novelId, outputPath };
}

export function exportLabel(metadata: { title: string; originalTitle: string }): string {
  return metadata.title.trim() || metadata.originalTitle.trim();
}
