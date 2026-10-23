import { computed, effect, inject, Injectable, type Signal, signal, type WritableSignal } from '@angular/core';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import type { PickedImage } from '@dreamer/shared/models/novel-package';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '../desktop-api';
import { PipelineStore } from './pipeline-store';

export type LibraryView = 'grid' | 'list';
export type LibrarySortKey = 'updatedAt' | 'importedAt' | 'title' | 'author' | 'chapterCount';
export type SortDirection = 'asc' | 'desc';
export type LibraryLoadState = 'loading' | 'ready' | 'error';

const VIEWS: LibraryView[] = ['grid', 'list'];
const SORT_KEYS: LibrarySortKey[] = ['updatedAt', 'importedAt', 'title', 'author', 'chapterCount'];
const DIRECTIONS: SortDirection[] = ['asc', 'desc'];
const STORAGE_KEY = 'dreamer.library.browse';

interface BrowsePreference {
  view: LibraryView;
  sortKey: LibrarySortKey;
  sortDirection: SortDirection;
}

const DEFAULT_PREFERENCE: BrowsePreference = { view: 'grid', sortKey: 'updatedAt', sortDirection: 'desc' };

function pick<T extends string>(allowed: T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readPreference(): BrowsePreference {
  try {
    const stored: Partial<BrowsePreference> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      view: pick(VIEWS, stored.view, DEFAULT_PREFERENCE.view),
      sortKey: pick(SORT_KEYS, stored.sortKey, DEFAULT_PREFERENCE.sortKey),
      sortDirection: pick(DIRECTIONS, stored.sortDirection, DEFAULT_PREFERENCE.sortDirection),
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function writePreference(preference: BrowsePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    return;
  }
}

@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly pipelines: PipelineStore = inject(PipelineStore);
  private readonly initial: BrowsePreference = readPreference();
  private started = false;

  private readonly novelList = signal<NovelSummary[]>([]);
  private readonly loadState = signal<LibraryLoadState>('loading');
  private readonly loadError = signal<string | null>(null);

  readonly novels: Signal<NovelSummary[]> = this.novelList.asReadonly();
  readonly state: Signal<LibraryLoadState> = this.loadState.asReadonly();
  readonly error: Signal<string | null> = this.loadError.asReadonly();
  readonly pending: Signal<PipelineRun[]> = computed(() =>
    this.pipelines.active().runs.filter((run) => run.type === 'novel-import'),
  );
  readonly view: WritableSignal<LibraryView> = signal(this.initial.view);
  readonly sortKey: WritableSignal<LibrarySortKey> = signal(this.initial.sortKey);
  readonly sortDirection: WritableSignal<SortDirection> = signal(this.initial.sortDirection);

  constructor() {
    effect(() => writePreference({ view: this.view(), sortKey: this.sortKey(), sortDirection: this.sortDirection() }));
    this.desktopApi.onLibraryChanged(() => void this.reload());
    this.desktopApi.onAppDataChanged(() => void this.reload());
    this.desktopApi.onPipelineUpdate((run: PipelineRun) => {
      if (!run.novelId) return;
      const novel: NovelSummary | undefined = this.novelList().find((item: NovelSummary) => item.id === run.novelId);
      if (!novel) return;
      const active: boolean = run.status === 'queued' || run.status === 'running';
      if (active !== (novel.lock?.runId === run.id)) void this.reload();
    });
  }

  async load(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (this.loadState() !== 'ready') this.loadState.set('loading');
    try {
      this.novelList.set(await this.desktopApi.listNovels());
      this.loadError.set(null);
      this.loadState.set('ready');
    } catch (error) {
      this.loadError.set(errorMessage(error));
      this.loadState.set('error');
    }
  }

  async detail(id: string): Promise<NovelDetail | null> {
    try {
      return await this.desktopApi.getNovel(id);
    } catch {
      return null;
    }
  }

  async updateNovel(id: string, patch: NovelPatch): Promise<NovelDetail | null> {
    return this.desktopApi.updateNovel(id, patch);
  }

  async pickImage(): Promise<PickedImage | null> {
    return this.desktopApi.pickImage();
  }

  async openFolder(id: string): Promise<void> {
    await this.desktopApi.openNovelFolder(id);
  }
}
