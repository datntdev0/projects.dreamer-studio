import { DestroyRef, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { DeleteNovelsResult } from '@dreamer/shared/models/novel';
import type { LibraryChangedEvent, NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import type { PickedImage } from '@dreamer/shared/models/novel-package';
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
const SAMPLE_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
  private novels: NovelSummary[];
  private readonly descriptions = new Map<string, string>();
  private readonly changedListeners = new Set<(event: LibraryChangedEvent) => void>();

  constructor(
    private readonly library: FakeLibraryListOptions,
    destroyRef: DestroyRef,
  ) {
    super({ runs: library.runs }, destroyRef);
    this.novels = library.novels.map((novel: NovelSummary): NovelSummary => ({ ...novel, tags: [...novel.tags] }));
    this.novels.forEach((novel: NovelSummary) => {
      this.descriptions.set(novel.id, NOVELS.find((item: LibraryNovel) => item.id === novel.id)?.description ?? '');
    });
  }

  override async listNovels(): Promise<NovelSummary[]> {
    if (this.library.list === 'error') throw new Error(LIST_ERROR);
    return this.novels;
  }

  override async getNovel(id: string): Promise<NovelDetail | null> {
    const novel: NovelSummary | undefined = this.novels.find((item: NovelSummary) => item.id === id);
    if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${id} was not found`);
    return { ...novel, tags: [...novel.tags], description: this.descriptions.get(id) ?? '' };
  }

  override async updateNovel(id: string, patch: NovelPatch): Promise<NovelDetail | null> {
    const novel: NovelSummary | undefined = this.novels.find((item: NovelSummary) => item.id === id);
    if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${id} was not found`);
    const updated: NovelSummary = {
      ...novel,
      originalTitle: patch.originalTitle ?? novel.originalTitle,
      title: patch.title ?? novel.title,
      author: patch.author ?? novel.author,
      language: patch.language ?? novel.language,
      publication: patch.publication ?? novel.publication,
      tags: patch.tags ? [...patch.tags] : novel.tags,
      hasCover: typeof patch.cover === 'object' ? true : patch.cover === 'remove' ? false : novel.hasCover,
      updatedAt: new Date().toISOString(),
    };
    this.novels = this.novels.map((item: NovelSummary): NovelSummary => (item.id === id ? updated : item));
    if (patch.description !== undefined) this.descriptions.set(id, patch.description);
    this.changedListeners.forEach((listener) => listener({ novelIds: [id] }));
    return this.getNovel(id);
  }

  override async deleteNovels(ids: string[]): Promise<DeleteNovelsResult | null> {
    const deleted: string[] = [];
    const skipped: string[] = [];
    const uniqueIds: string[] = [...new Set(ids)];
    uniqueIds.forEach((id: string): void => {
      const novel: NovelSummary | undefined = this.novels.find((item: NovelSummary): boolean => item.id === id);
      if (novel?.lock) {
        skipped.push(id);
      } else if (novel) {
        deleted.push(id);
      }
    });
    if (deleted.length > 0) {
      this.novels = this.novels.filter((novel: NovelSummary): boolean => !deleted.includes(novel.id));
      deleted.forEach((id: string): boolean => this.descriptions.delete(id));
      this.changedListeners.forEach((listener) => listener({ novelIds: deleted }));
    }
    return { deleted, skipped };
  }

  override async pickImage(): Promise<PickedImage | null> {
    return { path: 'C:\\Storybook\\cover.png', name: 'cover.png', size: 68, previewUrl: SAMPLE_COVER };
  }

  override async openNovelFolder(): Promise<void> {}

  override onLibraryChanged(listener: (event: LibraryChangedEvent) => void): () => void {
    this.changedListeners.add(listener);
    return () => this.changedListeners.delete(listener);
  }
}

export function provideFakeLibraryListApi(options: FakeLibraryListOptions): Provider {
  return { provide: DesktopApi, useFactory: () => new FakeLibraryListApi(options, inject(DestroyRef)) };
}
