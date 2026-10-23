import { Dirent, existsSync, promises as fs, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { chapterStats, contentHash, normalizeChapterText } from '@dreamer/shared/core/novel-text';
import { CoverMime } from '@dreamer/shared/models/novel-package';
import * as NovelStore from '@dreamer/shared/models/novel-store';
import { createLogger, Logger } from '../../logging/logger';
import { AppPaths } from '../../storage/paths';
import { chapterPath, coverPath, NovelFolder, novelFolder, trashDir } from './library-files';

const logger: Logger = createLogger('library');
const novelLocks: Map<string, Promise<void>> = new Map();

export interface WrittenChapter {
  file: string;
  paragraphs: number;
  chars: number;
}

async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const temp: string = `${file}.tmp`;
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    await fs.mkdir(dirname(file), { recursive: true });
    handle = await fs.open(temp, 'w');
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temp, file);
  } catch (error: unknown) {
    await handle?.close().catch((): void => undefined);
    await fs.rm(temp, { force: true }).catch((): void => undefined);
    throw error;
  }
}

export async function writeChapter(folder: NovelFolder, text: string): Promise<WrittenChapter> {
  const normalized: string = normalizeChapterText(text);
  const file: string = await contentHash(normalized);
  const path: string = chapterPath(folder, file);
  if (!existsSync(path)) {
    await writeFileAtomic(path, normalized);
  }
  return { file, ...chapterStats(normalized) };
}

export async function writeCover(
  folder: NovelFolder,
  bytes: Uint8Array,
  mime: CoverMime,
): Promise<NovelStore.NovelCoverFile> {
  const cover: NovelStore.NovelCoverFile = NovelStore.COVER_FILES[mime];
  await writeFileAtomic(coverPath(folder, cover), bytes);
  return cover;
}

export async function writeMetadata(folder: NovelFolder, metadata: NovelStore.NovelMetadata): Promise<void> {
  if (NovelStore.parseNovelMetadata(metadata) === null) {
    throw new Error('invalid novel metadata');
  }
  await writeFileAtomic(folder.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
}

export function readMetadata(folder: NovelFolder): NovelStore.NovelMetadata | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(folder.metadata, 'utf-8'));
    return NovelStore.parseNovelMetadata(parsed);
  } catch {
    return null;
  }
}

export function unreferencedChapterFiles(folder: NovelFolder, metadata: NovelStore.NovelMetadata): string[] {
  const referenced: Set<string> = new Set(
    metadata.chapters.map(({ file }: NovelStore.NovelChapterEntry): string => file),
  );
  try {
    return readdirSync(folder.chapters, { withFileTypes: true })
      .filter((entry: Dirent): boolean => entry.isFile() && entry.name.endsWith('.txt'))
      .filter((entry: Dirent): boolean => !referenced.has(parse(entry.name).name))
      .map((entry: Dirent): string => join(folder.chapters, entry.name));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function saveMetadata(folder: NovelFolder, metadata: NovelStore.NovelMetadata): Promise<void> {
  await writeMetadata(folder, metadata);
  const chapters: string[] = unreferencedChapterFiles(folder, metadata);
  await Promise.all(chapters.map((file: string): Promise<void> => fs.rm(file, { force: true })));
  await removeOtherCovers(folder, metadata.cover);
}

export function withNovelLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous: Promise<void> = novelLocks.get(id) ?? Promise.resolve();
  const result: Promise<T> = previous.then(task, task);
  const tail: Promise<void> = result.then(
    (): void => undefined,
    (): void => undefined,
  );
  novelLocks.set(id, tail);
  void tail.then((): void => {
    if (novelLocks.get(id) === tail) {
      novelLocks.delete(id);
    }
  });
  return result;
}

export async function deleteNovel(paths: AppPaths, id: string): Promise<void> {
  const folder: NovelFolder = novelFolder(paths, id);
  if (!existsSync(folder.dir)) {
    return;
  }
  const trash: string = trashDir(paths);
  const destination: string = join(trash, `${id}-${Date.now()}`);
  await fs.mkdir(trash, { recursive: true });
  await fs.rename(folder.dir, destination);
  try {
    await fs.rm(destination, { recursive: true, force: true });
  } catch (error: unknown) {
    logger.error(`novel trash could not be removed: ${destination}`, error);
  }
}

async function removeOtherCovers(folder: NovelFolder, cover: NovelStore.NovelCoverFile | null): Promise<void> {
  const covers: NovelStore.NovelCoverFile[] = Object.values(NovelStore.COVER_FILES).filter(
    (candidate: NovelStore.NovelCoverFile): boolean => candidate !== cover,
  );
  await Promise.all(
    covers.map((candidate: NovelStore.NovelCoverFile): Promise<void> =>
      fs.rm(coverPath(folder, candidate), { force: true }),
    ),
  );
}
