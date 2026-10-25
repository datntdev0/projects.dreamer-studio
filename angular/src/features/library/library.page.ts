import { Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import type { OnInit, Signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { TabsComponent } from '@components/tabs/tabs.component';
import type { TabItem } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { NovelSummary } from '@dreamer/shared/models/novel';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { LibraryStore } from '@core/stores/library-store';
import type { LibrarySortKey, LibraryView, SortDirection } from '@core/stores/library-store';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelDirective } from '@shell/layout/panel.directive';
import { formatCount } from '@core/format';
import { fold, isTypingTarget, languageName, matches, toggled } from './library-format';
import { LibraryInspectorComponent } from './novel-list/library-inspector.component';
import { LibraryItemsComponent } from './novel-list/library-items.component';
import { NovelDeleteDialogComponent } from './novel-list/novel-delete-dialog.component';
import { UnsavedChangesDialogComponent } from './novel-list/unsaved-changes-dialog.component';

interface FilterRow {
  value: string;
  label: string;
  count: number;
}

@Component({
  selector: 'ds-library-page',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    CheckboxComponent,
    IconComponent,
    LibraryInspectorComponent,
    LibraryItemsComponent,
    NovelDeleteDialogComponent,
    PanelDirective,
    PillComponent,
    SegmentedComponent,
    TabsComponent,
    TooltipDirective,
    TranslatePipe,
    UnsavedChangesDialogComponent,
  ],
  host: {
    class: 'ds-page',
    'data-testid': 'library-page',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './library.page.html',
})
export class LibraryPage implements OnInit {
  protected readonly store: LibraryStore = inject(LibraryStore);
  protected readonly layout: LayoutService = inject(LayoutService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);
  private readonly currentNovel: CurrentNovelStore = inject(CurrentNovelStore);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly inspector = viewChild(LibraryInspectorComponent);
  private leaveResolve: ((leave: boolean) => void) | null = null;
  private pendingActive: string | null = null;
  protected readonly query = signal<string>('');
  protected readonly active = signal<string | null>(null);
  protected readonly media = signal<string>('novels');
  protected readonly languageFilter = signal<string | null>(null);
  protected readonly genreFilters = signal<string[]>([]);
  protected readonly publicationFilters = signal<string[]>([]);
  protected readonly selected = signal<string[]>([]);
  protected readonly leaveOpen = signal<boolean>(false);
  protected readonly deleteTargets = signal<NovelSummary[]>([]);
  protected readonly publications: ('ongoing' | 'completed')[] = ['ongoing', 'completed'];
  protected readonly sortKeys: LibrarySortKey[] = ['updatedAt', 'importedAt', 'title', 'author', 'chapterCount'];
  protected readonly tabs: Signal<TabItem[]> = computed(() => [
    { id: 'novels', label: this.i18n.t('library.browse.novels') },
    { id: 'musics', label: this.i18n.t('library.browse.musics') },
    { id: 'videos', label: this.i18n.t('library.browse.videos') },
  ]);
  protected readonly viewOptions: Signal<SegmentedOption[]> = computed(() => [
    { value: 'grid', label: this.i18n.t('library.browse.view.grid'), icon: 'grid' },
    { value: 'list', label: this.i18n.t('library.browse.view.list'), icon: 'list' },
  ]);
  protected readonly languageRows: Signal<FilterRow[]> = computed(() =>
    this.rows(
      this.store.novels().map((novel: NovelSummary) => novel.language),
      (code: string) => languageName(code, this.i18n.language()),
    ),
  );
  protected readonly genreRows: Signal<FilterRow[]> = computed(() =>
    this.rows(
      this.store.novels().flatMap((novel: NovelSummary) => novel.tags),
      (genre: string) => genre,
    ),
  );
  protected readonly publicationCounts: Signal<Map<string, number>> = computed(() =>
    this.countBy(this.store.novels().map((novel: NovelSummary) => novel.publication)),
  );
  protected readonly results: Signal<NovelSummary[]> = computed(() => {
    const query: string = fold(this.query().trim());
    const language: string | null = this.languageFilter();
    const genres: string[] = this.genreFilters();
    const publications: string[] = this.publicationFilters();
    const key: LibrarySortKey = this.store.sortKey();
    const direction: number = this.store.sortDirection() === 'asc' ? 1 : -1;
    const collator: Intl.Collator = new Intl.Collator(this.i18n.language(), { numeric: true });
    return this.store
      .novels()
      .filter(
        (novel: NovelSummary): boolean =>
          (!language || novel.language === language) &&
          genres.every((genre: string) => novel.tags.includes(genre)) &&
          (!publications.length || publications.includes(novel.publication)) &&
          (!query || matches(novel, query)),
      )
      .sort(
        (a: NovelSummary, b: NovelSummary): number =>
          direction * (key === 'chapterCount' ? a.chapterCount - b.chapterCount : collator.compare(a[key], b[key])),
      );
  });
  protected readonly activeNovel: Signal<NovelSummary | null> = computed(
    () => this.store.novels().find((novel: NovelSummary) => novel.id === this.active()) ?? null,
  );

  constructor() {
    effect(() => {
      const results: NovelSummary[] = this.results();
      const dirty: boolean = this.inspector()?.dirty() ?? false;
      if (!dirty && !results.some((novel: NovelSummary) => novel.id === untracked(this.active))) {
        this.active.set(results[0]?.id ?? null);
      }
      const shown: string[] = untracked(this.selected).filter((id: string) =>
        results.some((novel: NovelSummary) => novel.id === id),
      );
      if (shown.length !== untracked(this.selected).length) this.selected.set(shown);
    });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.inspector()?.dirty()) return true;
    this.pendingActive = null;
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve: (leave: boolean) => void) => (this.leaveResolve = resolve));
  }

  protected count(value: number): string {
    return formatCount(value, this.i18n.language());
  }

  protected togglePublication(value: string): void {
    this.publicationFilters.update((current: string[]) => toggled(current, value));
  }

  protected toggleGenre(value: string): void {
    this.genreFilters.update((current: string[]) => toggled(current, value));
  }

  protected clearFilters(): void {
    this.query.set('');
    this.languageFilter.set(null);
    this.genreFilters.set([]);
    this.publicationFilters.set([]);
  }

  protected setSortKey(value: LibrarySortKey): void {
    this.store.sortKey.set(value);
    this.store.sortDirection.set(value === 'title' || value === 'author' ? 'asc' : 'desc');
  }

  protected toggleSortDirection(): void {
    this.store.sortDirection.update((direction: SortDirection) => (direction === 'asc' ? 'desc' : 'asc'));
  }

  protected setView(value: string): void {
    this.store.view.set(value as LibraryView);
  }

  protected sortDirectionKey(): string {
    return `library.browse.sortDirection.${this.store.sortDirection()}`;
  }

  protected sortKeyLabel(key: LibrarySortKey): string {
    return `library.browse.sort.${key}`;
  }

  protected publicationKey(value: string): string {
    return `library.browse.publication.${value}`;
  }

  protected mediaKey(): string {
    return `library.browse.${this.media()}`;
  }

  protected open(id: string): void {
    this.currentNovel.select(id);
    void this.router.navigateByUrl(`/library/${id}`);
  }

  protected activate(id: string): void {
    if (id === this.active()) return;
    if (!this.inspector()?.dirty()) {
      this.active.set(id);
      return;
    }
    this.pendingActive = id;
    this.leaveOpen.set(true);
  }

  protected settleLeave(leave: boolean): void {
    this.leaveOpen.set(false);
    if (leave) {
      this.inspector()?.discard();
      if (this.pendingActive) this.active.set(this.pendingActive);
    }
    this.pendingActive = null;
    this.leaveResolve?.(leave);
    this.leaveResolve = null;
  }

  protected deleteSelected(): void {
    const ids: string[] = this.selected();
    this.requestDelete(this.store.novels().filter((novel: NovelSummary) => ids.includes(novel.id)));
  }

  protected requestDelete(novels: NovelSummary[]): void {
    this.deleteTargets.set(novels);
  }

  protected onDeleted(ids: string[]): void {
    this.selected.update((current: string[]) => current.filter((id: string) => !ids.includes(id)));
    const active: string | null = this.active();
    if (active && ids.includes(active)) this.inspector()?.discard();
  }

  protected goImport(): void {
    void this.router.navigateByUrl('/library/import');
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    const typing: boolean = isTypingTarget(event.target);
    if (event.key === 'Escape' && this.selected().length && !typing) {
      this.selected.set([]);
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      this.search()?.nativeElement.focus();
    }
  }

  private rows(values: string[], label: (value: string) => string): FilterRow[] {
    return [...this.countBy(values)]
      .map(([value, count]: [string, number]): FilterRow => ({ value, label: label(value), count }))
      .sort((a: FilterRow, b: FilterRow): number => b.count - a.count || a.label.localeCompare(b.label));
  }

  private countBy(values: string[]): Map<string, number> {
    const counts: Map<string, number> = new Map();
    values.forEach((value: string) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return counts;
  }
}
