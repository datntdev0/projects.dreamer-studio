import { DestroyRef, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '../../src/core/desktop-api';
import type { LibraryNovel } from '../../src/features/library/library.models';
import { NOVELS } from './library';
import { FakePipelinesApi } from './pipelines-api';

export interface FakeLibraryListOptions {
  novels: NovelSummary[];
  runs: PipelineRun[];
  list?: 'ready' | 'error';
}

const LIST_ERROR = 'EACCES: permission denied, scandir sources/novels';
const CHARS_PER_UNIT: Record<string, number> = { K: 1_000, M: 1_000_000 };

function parseCharCount(text: string): number {
  const unit: string = text.slice(-1);
  return Math.round(parseFloat(text) * (CHARS_PER_UNIT[unit] ?? 1));
}

export function toNovelSummary(novel: LibraryNovel): NovelSummary {
  return {
    id: novel.id,
    originalTitle: novel.originalTitle,
    title: novel.title,
    author: novel.author,
    language: novel.language,
    publication: novel.publication,
    tags: novel.tags,
    chapterCount: novel.chapterCount,
    charCount: parseCharCount(novel.characterCount),
    importedAt: novel.importedAt,
    updatedAt: novel.updatedAt,
    hasCover: false,
    lock: null,
  };
}

export const FIXTURE_SUMMARIES: NovelSummary[] = NOVELS.map(toNovelSummary);

class FakeLibraryListApi extends FakePipelinesApi {
  constructor(
    private readonly library: FakeLibraryListOptions,
    destroyRef: DestroyRef,
  ) {
    super({ runs: library.runs }, destroyRef);
  }

  override async listNovels(): Promise<NovelSummary[]> {
    if (this.library.list === 'error') throw new Error(LIST_ERROR);
    return this.library.novels;
  }

  override async getNovel(id: string): Promise<NovelDetail | null> {
    const novel: LibraryNovel | undefined = NOVELS.find((item) => item.id === id);
    if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${id} was not found`);
    return { ...toNovelSummary(novel), description: novel.description };
  }

  override async openNovelFolder(): Promise<void> {}

  override onLibraryChanged(): () => void {
    return () => undefined;
  }
}

export function provideFakeLibraryListApi(options: FakeLibraryListOptions): Provider {
  return { provide: DesktopApi, useFactory: () => new FakeLibraryListApi(options, inject(DestroyRef)) };
}
