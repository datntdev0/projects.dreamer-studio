import { Dirent, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as NovelStore from '@dreamer/shared/models/novel-store';
import { AppPaths } from '@storage/paths';

export interface NovelFolder {
  dir: string;
  metadata: string;
  chapters: string;
  analysis: string;
}

export function novelFolderAt(dir: string): NovelFolder {
  return {
    dir,
    metadata: join(dir, NovelStore.NOVEL_METADATA_FILE),
    chapters: join(dir, NovelStore.NOVEL_CHAPTERS_DIR),
    analysis: join(dir, NovelStore.ANALYSIS_DIR),
  };
}

export function novelFolder(paths: AppPaths, id: string): NovelFolder {
  if (!NovelStore.isNovelId(id)) {
    throw new Error('invalid novel id');
  }
  return novelFolderAt(join(paths.library, id));
}

export function chapterPath(folder: NovelFolder, hash: string): string {
  if (!NovelStore.isContentHash(hash)) {
    throw new Error('invalid content hash');
  }
  return join(folder.chapters, `${hash}.txt`);
}

export function coverPath(folder: NovelFolder, cover: NovelStore.NovelCoverFile): string {
  if (!Object.values(NovelStore.COVER_FILES).includes(cover)) {
    throw new Error('invalid cover file');
  }
  return join(folder.dir, cover);
}

export function importStagingRoot(paths: AppPaths): string {
  return join(paths.cache, 'import');
}

export function importStagingDir(paths: AppPaths, runId: string): string {
  if (!NovelStore.isNovelId(runId)) {
    throw new Error('invalid run id');
  }
  return join(importStagingRoot(paths), runId);
}

export function trashDir(paths: AppPaths): string {
  return join(paths.cache, 'trash');
}

export function listLibraryFolders(paths: AppPaths): string[] {
  try {
    return readdirSync(paths.library, { withFileTypes: true })
      .filter((entry: Dirent): boolean => entry.isDirectory())
      .map((entry: Dirent): string => entry.name)
      .sort();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
