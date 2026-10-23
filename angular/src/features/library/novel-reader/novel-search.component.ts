import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import { viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { BadgeComponent } from '@components/status/badge.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { LibraryChapter, LibraryNovel, NovelSearchState, SearchChapterResult, SearchHit } from '../library.models';
import { LibraryMockStore } from '../library.store';
import { NovelSearchStore } from '../novel-search.store';

export interface NovelSearchSelection {
  chapterId: string;
  query: string;
}

@Component({
  selector: 'ds-novel-search',
  imports: [AreaStateComponent, BadgeComponent, ButtonDirective, IconComponent, TranslatePipe],
  providers: [NovelSearchStore],
  host: { class: 'library-novel-search', 'data-testid': 'novel-search' },
  templateUrl: './novel-search.component.html',
})
export class NovelSearchComponent {
  readonly novel = input.required<LibraryNovel>();
  readonly chapters = input.required<LibraryChapter[]>();
  readonly selected = output<NovelSearchSelection>();

  private readonly libraryStore: LibraryMockStore = inject(LibraryMockStore);
  private readonly i18n: I18nService = inject(I18nService);
  protected readonly search: NovelSearchStore = inject(NovelSearchStore);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly value = signal<string>('');
  protected readonly collapsed = signal<Set<string>>(new Set());
  protected readonly running: Signal<boolean> = this.search.running;
  protected readonly done: Signal<number> = this.search.done;
  protected readonly total: Signal<number> = this.search.total;
  protected readonly results: Signal<SearchChapterResult[]> = this.search.results;
  protected readonly count: Signal<number> = computed(() =>
    this.results().reduce((total: number, group: SearchChapterResult): number => total + group.hits.length, 0),
  );
  protected readonly chapterCount: Signal<number> = computed(() => this.results().length);
  private novelId: string = '';

  constructor() {
    effect(() => {
      if (this.novelId !== this.novel().id) {
        this.novelId = this.novel().id;
        untracked(() => this.clear());
      }
    });
  }

  focus(): void {
    this.searchInput()?.nativeElement.focus();
  }

  initialize(query: string, state: NovelSearchState): void {
    this.value.set(query);
    if (state !== 'idle') this.start(state === 'running');
  }

  protected setValue(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.run();
    }
  }

  protected run(): void {
    this.start();
  }

  private start(continueRunning: boolean = true): void {
    this.collapsed.set(new Set());
    this.search.start(
      this.chapters(),
      (chapter: LibraryChapter): string[] => this.libraryStore.paragraphs(chapter),
      this.value(),
      continueRunning,
    );
  }

  protected clear(): void {
    this.value.set('');
    this.collapsed.set(new Set());
    this.search.clear();
    this.focus();
  }

  protected stop(): void {
    this.search.cancel();
  }

  protected toggle(chapterId: string): void {
    this.collapsed.update((collapsed: Set<string>): Set<string> => {
      const next: Set<string> = new Set(collapsed);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  protected isCollapsed(chapterId: string): boolean {
    return this.collapsed().has(chapterId);
  }

  protected select(hit: SearchHit): void {
    this.selected.emit({ chapterId: hit.chapterId, query: this.search.query() });
  }

  protected countText(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }
}
