import { computed, inject, Injectable, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { Router } from '@angular/router';
import { LibraryStore } from '@core/stores/library-store';
import type { NovelSummary } from '@dreamer/shared/models/novel';

const STORAGE_KEY = 'dreamer.currentNovel';

function readCurrentNovel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class CurrentNovelStore {
  private readonly library: LibraryStore = inject(LibraryStore);
  private readonly router: Router = inject(Router);
  private readonly selected = signal<string | null>(readCurrentNovel());

  readonly novels: Signal<NovelSummary[]> = this.library.novels;
  readonly novel: Signal<NovelSummary | null> = computed(() => {
    const novels = this.novels();
    return novels.find((novel) => novel.id === this.selected()) ?? novels[0] ?? null;
  });
  readonly novelId: Signal<string | null> = computed(() => this.novel()?.id ?? null);

  constructor() {
    void this.library.load();
  }

  select(id: string | null): void {
    this.selected.set(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
  }

  analyse(id: string): void {
    this.open(id, '/omniscient');
  }

  translate(id: string): void {
    this.open(id, '/translation');
  }

  private open(id: string, url: string): void {
    this.select(id);
    void this.router.navigateByUrl(url);
  }
}
