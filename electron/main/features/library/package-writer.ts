import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { checkFields, checkGates, FieldProblem, FieldsCheck } from '@dreamer/shared/core/package-format';
import { GateCheck, PackageFormat } from '@dreamer/shared/core/package-format';
import { PackageChapter, PackageMetadata } from '@dreamer/shared/models/novel-package';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { StepContext } from '../pipelines/pipeline-definition';
import { chapterPath, coverPath, NovelFolder } from './library-files';
import { packageFormat } from './package-format';

export type PackageWriteHooks = Pick<StepContext, 'progress' | 'checkpoint'>;

const NOVEL_PACKAGE_TYPE: string = 'novel';

function packageChapterFile(format: PackageFormat, position: number): string {
  return `${format.chapterDir}${String(position).padStart(4, '0')}.txt`;
}

export function buildPackageMetadata(
  metadata: NovelMetadata,
  format: PackageFormat = packageFormat(),
): PackageMetadata {
  return {
    formatVersion: format.metadata.formatVersion.const as number,
    type: NOVEL_PACKAGE_TYPE,
    originalTitle: metadata.originalTitle,
    title: metadata.title,
    author: metadata.author,
    description: metadata.description,
    tags: metadata.tags,
    language: metadata.language,
    publication: metadata.publication,
    cover: metadata.cover,
    chapters: metadata.chapters.map((chapter: NovelChapterEntry, index: number): PackageChapter => ({
      file: packageChapterFile(format, index + 1),
      title: chapter.title,
    })),
  };
}

export function verifyPackageMetadata(metadata: PackageMetadata, format: PackageFormat = packageFormat()): void {
  const value: Record<string, unknown> = { ...metadata };
  const gate: GateCheck = checkGates(value, format.metadata);
  const checked: FieldsCheck = checkFields(value, format.metadata);
  const fields: string[] = checked.problems.map((problem: FieldProblem): string => `${problem.code} ${problem.field}`);
  if (gate.status !== 'ok') fields.unshift(`${gate.status} ${gate.field}`);
  if (fields.length) {
    throw new Error(`Exported metadata does not follow the package format: ${fields.join(', ')}`);
  }
}

async function addEntries(
  zip: yazl.ZipFile,
  folder: NovelFolder,
  metadata: NovelMetadata,
  hooks: PackageWriteHooks,
  format: PackageFormat,
): Promise<void> {
  const packageMetadata: PackageMetadata = buildPackageMetadata(metadata, format);
  verifyPackageMetadata(packageMetadata, format);
  zip.addBuffer(Buffer.from(JSON.stringify(packageMetadata, null, 2)), format.metadataFile);
  if (metadata.cover !== null) {
    zip.addBuffer(await readFile(coverPath(folder, metadata.cover)), metadata.cover);
  }
  for (const [index, chapter] of metadata.chapters.entries()) {
    hooks.checkpoint();
    const text: string = await readFile(chapterPath(folder, chapter.file), 'utf-8');
    const exported: string = splitParagraphs(text).join(format.exportSeparator);
    zip.addBuffer(Buffer.from(exported, 'utf-8'), packageChapterFile(format, index + 1));
    hooks.progress(((index + 1) / metadata.chapters.length) * 100);
  }
  hooks.checkpoint();
}

export async function writePackage(
  folder: NovelFolder,
  metadata: NovelMetadata,
  outputPath: string,
  hooks: PackageWriteHooks,
): Promise<void> {
  const zip: yazl.ZipFile = new yazl.ZipFile();
  const written: Promise<void> = pipeline(zip.outputStream, createWriteStream(outputPath));
  written.catch((): void => undefined);
  try {
    await addEntries(zip, folder, metadata, hooks, packageFormat());
    zip.end();
    await written;
  } catch (error: unknown) {
    (zip.outputStream as Readable).destroy();
    await written.catch((): void => undefined);
    throw error;
  }
}
