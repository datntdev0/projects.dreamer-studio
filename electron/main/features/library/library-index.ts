import { chapterStatuses, isUpToDate } from '@dreamer/shared/core/analysis-plan';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { ChapterAnalysisSummary } from '@dreamer/shared/models/analysis';
import { NovelAnalysisSummary, NovelChapter, NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import * as NovelStore from '@dreamer/shared/models/novel-store';
import { createLogger, Logger } from '../../logging/logger';
import { AppPaths } from '@storage/paths';
import { listLibraryFolders, NovelFolder, novelFolder } from './library-files';
import { readMetadata } from './novel/novel-files';
import { readAnalysisIndex } from '../analysis/analysis-files';

const logger: Logger = createLogger('library');

function analysisSummary(metadata: NovelStore.NovelMetadata, folder: NovelFolder): NovelAnalysisSummary {
  const statuses: ChapterAnalysisSummary[] = chapterStatuses(metadata.chapters, readAnalysisIndex(folder));
  return { analysed: statuses.filter((chapter): boolean => isUpToDate(chapter.status)).length, total: statuses.length };
}

function toSummary(metadata: NovelStore.NovelMetadata, folder: NovelFolder): NovelSummary {
  return {
    id: metadata.id,
    originalTitle: metadata.originalTitle,
    title: metadata.title,
    author: metadata.author,
    language: metadata.language,
    publication: metadata.publication,
    tags: metadata.tags,
    chapterCount: metadata.chapters.length,
    charCount: metadata.chapters.reduce(
      (sum: number, chapter: NovelStore.NovelChapterEntry): number => sum + chapter.chars,
      0,
    ),
    importedAt: metadata.importedAt,
    updatedAt: metadata.updatedAt,
    hasCover: metadata.cover !== null,
    translations: [],
    analysis: analysisSummary(metadata, folder),
    lock: null,
  };
}

function toDetail(metadata: NovelStore.NovelMetadata, folder: NovelFolder): NovelDetail {
  return {
    ...toSummary(metadata, folder),
    description: metadata.description,
    chapters: metadata.chapters.map((chapter: NovelStore.NovelChapterEntry, index: number): NovelChapter => ({
      position: index + 1,
      title: chapter.title,
      file: chapter.file,
      paragraphs: chapter.paragraphs,
      chars: chapter.chars,
    })),
  };
}

export class LibraryIndex {
  private readonly novels: Map<string, NovelStore.NovelMetadata> = new Map();

  constructor(private readonly paths: AppPaths) {}

  scan(): void {
    this.novels.clear();
    listLibraryFolders(this.paths).forEach((name: string): void => this.refresh(name));
  }

  list(): NovelSummary[] {
    return Array.from(this.novels.values()).map((metadata: NovelStore.NovelMetadata): NovelSummary =>
      toSummary(metadata, novelFolder(this.paths, metadata.id)),
    );
  }

  get(id: string): NovelDetail {
    const metadata: NovelStore.NovelMetadata | undefined = this.novels.get(id);
    if (!metadata) {
      throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${id}`);
    }
    return toDetail(metadata, novelFolder(this.paths, id));
  }

  coverFile(id: string): NovelStore.NovelCoverFile | null {
    return this.novels.get(id)?.cover ?? null;
  }

  remove(id: string): void {
    this.novels.delete(id);
  }

  refresh(id: string): void {
    this.novels.delete(id);
    if (!NovelStore.isNovelId(id)) {
      logger.warn(`library folder skipped, not a novel id: ${id}`);
      return;
    }
    const metadata: NovelStore.NovelMetadata | null = readMetadata(novelFolder(this.paths, id));
    if (metadata === null) {
      logger.warn(`library folder skipped, metadata missing or invalid: ${id}`);
    } else if (metadata.id !== id) {
      logger.warn(`library folder skipped, metadata id ${metadata.id} differs from folder ${id}`);
    } else {
      this.novels.set(id, metadata);
    }
  }
}
