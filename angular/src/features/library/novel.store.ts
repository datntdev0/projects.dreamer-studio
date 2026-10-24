import { computed } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { inject } from '@angular/core';
import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import type { Signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { isAppError } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { LibraryChangedEvent } from '@dreamer/shared/models/novel';
import type { NovelChapter } from '@dreamer/shared/models/novel';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '@core/desktop-api';
import type { LibraryChapter } from './library.models';
import type { PageState } from './library.models';

export type ChapterTextState =
  { status: 'loading' } | { status: 'ready'; paragraphs: string[] } | { status: 'missing' };

const CACHE_LIMIT = 8;

@Injectable()
export class NovelStore {
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly detailValue: WritableSignal<NovelDetail | null> = signal<NovelDetail | null>(null);
  private readonly pageState: WritableSignal<PageState> = signal<PageState>('loading');
  private readonly errorValue: WritableSignal<string> = signal<string>('');
  private readonly textValues: WritableSignal<Map<string, ChapterTextState>> = signal<Map<string, ChapterTextState>>(
    new Map(),
  );
  private readonly pending: Map<string, Promise<void>> = new Map<string, Promise<void>>();
  private id: string = '';
  private request: number = 0;

  readonly novel: Signal<NovelDetail | null> = this.detailValue.asReadonly();
  readonly state: Signal<PageState> = this.pageState.asReadonly();
  readonly error: Signal<string> = this.errorValue.asReadonly();
  readonly chapters: Signal<LibraryChapter[]> = computed(() =>
    (this.novel()?.chapters ?? []).map((chapter: NovelChapter): LibraryChapter => ({
      id: String(chapter.position),
      position: chapter.position,
      title: chapter.title,
      file: chapter.file,
      chars: chapter.chars,
      paragraphCount: chapter.paragraphs,
    })),
  );

  constructor() {
    const offChanged: () => void = this.api.onLibraryChanged((event: LibraryChangedEvent): void => {
      if (event.novelIds.includes(this.id)) void this.reload();
    });
    const offPipeline: () => void = this.api.onPipelineUpdate((run: PipelineRun): void => {
      if (run.novelId !== this.id || !this.novel()) return;
      const active: boolean = run.status === 'queued' || run.status === 'running';
      if (active !== (this.novel()?.lock?.runId === run.id)) void this.reload();
    });
    inject(DestroyRef).onDestroy(() => {
      this.request++;
      offChanged();
      offPipeline();
    });
  }

  async open(id: string): Promise<void> {
    this.id = id;
    this.detailValue.set(null);
    this.pageState.set('loading');
    this.errorValue.set('');
    this.textValues.set(new Map());
    this.pending.clear();
    await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.id) return;
    const id: string = this.id;
    const request: number = ++this.request;
    try {
      const detail: NovelDetail | null = await this.api.getNovel(id);
      if (request !== this.request) return;
      if (!detail) {
        this.detailValue.set(null);
        this.pageState.set('notFound');
        return;
      }
      this.detailValue.set(detail);
      this.pageState.set('ready');
    } catch (error) {
      if (request !== this.request) return;
      this.detailValue.set(null);
      this.errorValue.set(errorMessage(error));
      this.pageState.set(isAppError(error) && error.code === ErrorCode.NovelNotFound ? 'notFound' : 'error');
    }
  }

  text(chapter: LibraryChapter): ChapterTextState {
    return this.textValues().get(chapter.file) ?? { status: 'loading' };
  }

  ensure(chapter: LibraryChapter): void {
    if (!this.textValues().has(chapter.file)) void this.load(chapter, true);
  }

  retry(chapter: LibraryChapter): void {
    this.pending.delete(chapter.file);
    this.setText(chapter.file, { status: 'loading' });
    void this.load(chapter, true);
  }

  private async load(chapter: LibraryChapter, prefetch: boolean): Promise<void> {
    if (this.pending.has(chapter.file)) return this.pending.get(chapter.file);
    const id: string = this.id;
    const file: string = chapter.file;
    this.setText(file, { status: 'loading' });
    const task: Promise<void> = this.api
      .getChapter({ novelId: id, file })
      .then((result): void => {
        if (id !== this.id) return;
        if (!result) {
          this.setText(file, { status: 'missing' });
          return;
        }
        this.setText(file, { status: 'ready', paragraphs: result.paragraphs });
        const next: LibraryChapter | undefined = this.chapters().find(
          (item: LibraryChapter): boolean => item.position === chapter.position + 1,
        );
        if (prefetch && next && !this.textValues().has(next.file)) void this.load(next, false);
      })
      .catch((): void => {
        if (id === this.id) this.setText(file, { status: 'missing' });
      })
      .finally((): void => {
        if (this.pending.get(file) === task) this.pending.delete(file);
      });
    this.pending.set(file, task);
    return task;
  }

  private setText(file: string, value: ChapterTextState): void {
    const values: Map<string, ChapterTextState> = new Map(this.textValues());
    values.delete(file);
    values.set(file, value);
    if (value.status === 'ready') {
      const ready: string[] = [...values]
        .filter(([, state]): boolean => state.status === 'ready')
        .map(([key]): string => key);
      if (ready.length > CACHE_LIMIT) values.delete(ready[0]);
    }
    this.textValues.set(values);
  }
}
