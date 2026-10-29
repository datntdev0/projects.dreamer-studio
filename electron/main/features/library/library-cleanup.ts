import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { COVER_FILES, isNovelId, NovelCoverFile, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { TARGET_LANGUAGES, TargetLanguage, TranslationIndexFile } from '@dreamer/shared/models/translation';
import { createLogger, Logger } from '../../logging/logger';
import { AppPaths } from '@storage/paths';
import { coverPath, importStagingRoot, listLibraryFolders, novelFolder, NovelFolder, trashDir } from './library-files';
import { readMetadata, unreferencedChapterFiles } from './novel/novel-files';
import { readTranslationIndex } from '../translation/translation-index';
import { translationChaptersDir } from '../translation/translation-files';

const logger: Logger = createLogger('library');

export interface LibraryCleanup {
  staging: number;
  temp: number;
  chapters: number;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (error) {
    if (!isMissing(error)) {
      logger.error(`library cleanup could not list ${dir}`, error);
    }
    return [];
  }
}

function remove(path: string): boolean {
  try {
    rmSync(path, { recursive: true, force: true });
    return true;
  } catch (error) {
    logger.error(`library cleanup could not remove ${path}`, error);
    return false;
  }
}

function removeEntries(dir: string, filter: (name: string) => boolean = (): boolean => true): number {
  let removed: number = 0;
  for (const name of entries(dir).filter(filter)) {
    if (remove(join(dir, name))) {
      removed += 1;
    }
  }
  return removed;
}

function libraryFolders(paths: AppPaths): string[] {
  try {
    return listLibraryFolders(paths);
  } catch (error) {
    logger.error(`library cleanup could not list ${paths.library}`, error);
    return [];
  }
}

function unreferencedTranslationChapterFiles(folder: NovelFolder, language: TargetLanguage): number {
  const index: TranslationIndexFile | null = readTranslationIndex(folder, language);
  if (index === null) return 0;
  const files: Set<string> = new Set(index.chapters.map((entry) => entry.file));
  return removeEntries(translationChaptersDir(folder, language), (name: string): boolean => {
    if (name.endsWith('.tmp')) return true;
    if (!name.endsWith('.json')) return false;
    const file: string = name.slice(0, -'.json'.length);
    return isContentHash(file) && !files.has(file);
  });
}

export function cleanLibrary(paths: AppPaths): LibraryCleanup {
  const result: LibraryCleanup = {
    staging: removeEntries(importStagingRoot(paths)) + removeEntries(trashDir(paths)),
    temp: 0,
    chapters: 0,
  };
  for (const id of libraryFolders(paths).filter(isNovelId)) {
    const folder: NovelFolder = novelFolder(paths, id);
    const metadata: NovelMetadata | null = readMetadata(folder);
    if (metadata === null) {
      continue;
    }
    const isTemp: (name: string) => boolean = (name: string): boolean => name.endsWith('.tmp');
    result.temp += removeEntries(folder.dir, isTemp) + removeEntries(folder.chapters, isTemp);
    const covers: NovelCoverFile[] = Object.values(COVER_FILES).filter(
      (cover: NovelCoverFile): boolean => cover !== metadata.cover,
    );
    covers.forEach((cover: NovelCoverFile): void => {
      const path: string = coverPath(folder, cover);
      if (existsSync(path) && remove(path)) {
        result.temp += 1;
      }
    });
    try {
      for (const file of unreferencedChapterFiles(folder, metadata)) {
        if (remove(file)) {
          result.chapters += 1;
        }
      }
      for (const language of TARGET_LANGUAGES) {
        result.chapters += unreferencedTranslationChapterFiles(folder, language);
      }
    } catch (error) {
      logger.error(`library cleanup could not inspect chapters for ${id}`, error);
    }
  }
  if (result.staging > 0 || result.temp > 0 || result.chapters > 0) {
    logger.info(
      `library cleanup: ${result.staging} staging, ${result.temp} temp, ${result.chapters} chapter files removed`,
    );
  }
  return result;
}
