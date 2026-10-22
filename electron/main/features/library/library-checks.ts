import { existsSync } from 'node:fs';
import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { isNovelId, NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths } from '../../storage/paths';
import { CheckContext } from '../diagnostics/self-check';
import { SelfCheckEngine } from '../diagnostics/self-check-engine';
import { chapterPath, coverPath, listLibraryFolders, novelFolder, NovelFolder } from './library-files';
import { readMetadata } from './novel-files';

interface LibraryProblems {
  invalid: number;
  missing: number;
  folders: string[];
  validNovels: number;
}

function missingFiles(folder: NovelFolder, metadata: NovelMetadata): number {
  let missing: number = metadata.chapters.filter(
    (chapter: NovelChapterEntry): boolean => !existsSync(chapterPath(folder, chapter.file)),
  ).length;
  if (metadata.cover !== null && !existsSync(coverPath(folder, metadata.cover))) {
    missing += 1;
  }
  return missing;
}

function inspectLibrary(paths: AppPaths): LibraryProblems {
  const problems: LibraryProblems = { invalid: 0, missing: 0, folders: [], validNovels: 0 };
  for (const name of listLibraryFolders(paths)) {
    if (!isNovelId(name)) {
      problems.invalid += 1;
      problems.folders.push(name);
      continue;
    }
    const folder: NovelFolder = novelFolder(paths, name);
    const metadata: NovelMetadata | null = readMetadata(folder);
    if (metadata === null) {
      problems.invalid += 1;
      problems.folders.push(name);
      continue;
    }
    problems.validNovels += 1;
    const missing: number = missingFiles(folder, metadata);
    problems.missing += missing;
    if (missing > 0) {
      problems.folders.push(name);
    }
  }
  return problems;
}

function folderSummary(folders: string[]): string {
  const shown: string = folders.slice(0, 5).join(', ');
  const remaining: number = folders.length - 5;
  return remaining > 0 ? `${shown} +${remaining}` : shown;
}

export function checkLibraryFiles(paths: AppPaths): CheckOutcome {
  const problems: LibraryProblems = inspectLibrary(paths);
  if (problems.invalid === 0 && problems.missing === 0) {
    return {
      status: 'ok',
      messageKey: 'diagnostics.check.library.files.ok',
      fixKey: null,
      params: { count: problems.validNovels },
    };
  }
  return {
    status: 'error',
    messageKey: 'diagnostics.check.library.files.error',
    fixKey: 'diagnostics.check.library.files.fix',
    params: {
      invalid: problems.invalid,
      missing: problems.missing,
      folders: folderSummary(problems.folders),
    },
  };
}

export function registerLibraryChecks(engine: SelfCheckEngine): void {
  engine.register({
    id: 'library.files',
    category: 'storage',
    nameKey: 'diagnostics.check.library.files.name',
    run: async (ctx: CheckContext): Promise<CheckOutcome> => checkLibraryFiles(ctx.paths),
  });
}
