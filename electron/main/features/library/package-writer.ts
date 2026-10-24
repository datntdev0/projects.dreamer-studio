import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { PACKAGE_CHAPTERS_DIR, PACKAGE_FORMAT_VERSION } from '@dreamer/shared/models/novel-package';
import { PACKAGE_METADATA_FILE, PACKAGE_TYPE_NOVEL } from '@dreamer/shared/models/novel-package';
import { PackageChapter, PackageMetadata } from '@dreamer/shared/models/novel-package';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { StepContext } from '../pipelines/pipeline-definition';
import { chapterPath, coverPath, NovelFolder } from './library-files';

export type PackageWriteHooks = Pick<StepContext, 'progress' | 'checkpoint'>;

function packageChapterFile(position: number): string {
  return `${PACKAGE_CHAPTERS_DIR}${String(position).padStart(4, '0')}.txt`;
}

export function buildPackageMetadata(metadata: NovelMetadata): PackageMetadata {
  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    type: PACKAGE_TYPE_NOVEL,
    originalTitle: metadata.originalTitle,
    title: metadata.title,
    author: metadata.author,
    description: metadata.description,
    tags: metadata.tags,
    language: metadata.language,
    publication: metadata.publication,
    cover: metadata.cover,
    chapters: metadata.chapters.map((chapter: NovelChapterEntry, index: number): PackageChapter => ({
      file: packageChapterFile(index + 1),
      title: chapter.title,
    })),
  };
}

async function addEntries(
  zip: yazl.ZipFile,
  folder: NovelFolder,
  metadata: NovelMetadata,
  hooks: PackageWriteHooks,
): Promise<void> {
  zip.addBuffer(Buffer.from(JSON.stringify(buildPackageMetadata(metadata), null, 2)), PACKAGE_METADATA_FILE);
  if (metadata.cover !== null) {
    zip.addBuffer(await readFile(coverPath(folder, metadata.cover)), metadata.cover);
  }
  for (const [index, chapter] of metadata.chapters.entries()) {
    hooks.checkpoint();
    const text: string = await readFile(chapterPath(folder, chapter.file), 'utf-8');
    zip.addBuffer(Buffer.from(splitParagraphs(text).join('\n\n'), 'utf-8'), packageChapterFile(index + 1));
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
    await addEntries(zip, folder, metadata, hooks);
    zip.end();
    await written;
  } catch (error: unknown) {
    (zip.outputStream as Readable).destroy();
    await written.catch((): void => undefined);
    throw error;
  }
}
