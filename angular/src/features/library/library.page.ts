import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import { viewChild } from '@angular/core';
import type { OnInit } from '@angular/core';
import type { Signal } from '@angular/core';
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
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PanelDirective } from '../../shell/layout/panel.directive';
import { LayoutService } from '../../shell/layout/layout.service';
import { PageTitleDirective } from '../../shell/page-title.directive';
import { fold } from './library-format';
import { isTypingTarget } from './library-format';
import { toggled } from './library-format';
import { LIBRARY_GENRES } from './library-format';
import { matches } from './library-format';
import type { LibraryNovel } from './library.models';
import type { LibrarySortKey } from './library.models';
import type { LibraryView } from './library.models';
import type { SortDirection } from './library.models';
import { LibraryStore } from './library.store';
import { LibraryCoverComponent } from './components/library-cover.component';
import { LibraryItemsComponent } from './components/library-items.component';
import { NovelDeleteDialogComponent } from './components/novel-delete-dialog.component';
import { NovelExportDialogComponent } from './components/novel-export-dialog.component';
import { NovelInfoComponent } from './components/novel-info.component';
import { NovelMetadataFormComponent } from './components/novel-metadata-form.component';

const LIBRARY_LANGUAGES: { code: string; key: string; testId: string }[] = [
  { code: 'zh', key: 'library.mock.language.zh', testId: 'zh' },
  { code: 'ko', key: 'library.mock.language.ko', testId: 'ko' },
  { code: 'ja', key: 'library.mock.language.ja', testId: 'ja' },
  { code: 'en', key: 'library.mock.language.en', testId: 'en' },
];

@Component({
  selector: 'ds-library-page',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    CheckboxComponent,
    IconComponent,
    LibraryCoverComponent,
    LibraryItemsComponent,
    NovelInfoComponent,
    NovelMetadataFormComponent,
    NovelDeleteDialogComponent,
    NovelExportDialogComponent,
    PageTitleDirective,
    PanelDirective,
    PillComponent,
    SegmentedComponent,
    TabsComponent,
    TooltipDirective,
    TranslatePipe,
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
  private readonly toast: ToastService = inject(ToastService);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly active = signal<string | null>('n-0006');
  protected readonly media = signal<string>('novels');
  protected readonly languageFilter = signal<string | null>(null);
  protected readonly genreFilters = signal<string[]>([]);
  protected readonly publicationFilters = signal<string[]>([]);
  protected readonly tagFilters = signal<string[]>([]);
  protected readonly editing = signal<boolean>(false);
  protected readonly deleteOpen = signal<boolean>(false);
  protected readonly exportOpen = signal<boolean>(false);
  protected readonly deleteTargets = signal<LibraryNovel[]>([]);
  protected readonly selected = signal<string[]>([]);
  protected readonly languages = LIBRARY_LANGUAGES;
  protected readonly genres = LIBRARY_GENRES;
  protected readonly publications: ('ongoing' | 'completed')[] = ['ongoing', 'completed'];
  protected readonly appTags: string[] = ['analysed', 'translated'];
  protected readonly sortKeys: LibrarySortKey[] = ['updatedAt', 'importedAt', 'title', 'author', 'chapterCount'];
  protected readonly errorDetails = 'SQLITE_CANTOPEN: unable to open database file (library.db)';
  protected readonly tabs: Signal<TabItem[]> = computed(() => [
    { id: 'novels', label: this.i18n.t('library.mock.novels') },
    { id: 'musics', label: this.i18n.t('library.mock.musics') },
    { id: 'videos', label: this.i18n.t('library.mock.videos') },
  ]);
  protected readonly viewOptions: Signal<SegmentedOption[]> = computed(() => [
    { value: 'grid', label: this.i18n.t('library.browse.view.grid'), icon: 'grid' },
    { value: 'list', label: this.i18n.t('library.browse.view.list'), icon: 'list' },
  ]);
  protected readonly results: Signal<LibraryNovel[]> = computed(() => {
    const query: string = fold(this.store.query().trim());
    const language: string | null = this.languageFilter();
    const genres: string[] = this.genreFilters();
    const publications: string[] = this.publicationFilters();
    const tags: string[] = this.tagFilters();
    const key: LibrarySortKey = this.store.sortKey();
    const direction: number = this.store.sortDirection() === 'asc' ? 1 : -1;
    const collator: Intl.Collator = new Intl.Collator(this.i18n.language(), { numeric: true });
    const matched: LibraryNovel[] = this.store
      .visibleNovels()
      .filter(
        (novel: LibraryNovel): boolean =>
          (!language || novel.language === language) &&
          genres.every((genre: string) => novel.tags.includes(genre)) &&
          (!publications.length || publications.includes(novel.publication)) &&
          tags.every((tag: string) => novel.appTags.includes(tag)) &&
          (!query || matches(novel, query)),
      );
    return matched.sort(
      (a: LibraryNovel, b: LibraryNovel): number =>
        direction * (key === 'chapterCount' ? a.chapterCount - b.chapterCount : collator.compare(a[key], b[key])),
    );
  });
  protected readonly activeNovel: Signal<LibraryNovel | null> = computed(
    () => this.store.visibleNovels().find((novel) => novel.id === this.active()) ?? null,
  );
  constructor() {
    effect(() => {
      const results = this.results();
      if (!results.some((novel) => novel.id === untracked(this.active))) this.active.set(results[0]?.id ?? null);
      const shown: string[] = untracked(this.selected).filter((id) => results.some((novel) => novel.id === id));
      if (shown.length !== untracked(this.selected).length) this.selected.set(shown);
    });
  }
  ngOnInit(): void {
    this.store.simulateLoading();
  }
  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }
  protected languageCount(code: string): number {
    return this.store.visibleNovels().filter((novel) => novel.language === code).length;
  }
  protected genreCount(value: string): number {
    return this.store.visibleNovels().filter((novel) => novel.tags.includes(value)).length;
  }
  protected publicationCount(value: string): number {
    return this.store.visibleNovels().filter((novel) => novel.publication === value).length;
  }
  protected tagCount(value: string): number {
    return this.store.visibleNovels().filter((novel) => novel.appTags.includes(value)).length;
  }
  protected togglePublication(value: string): void {
    this.publicationFilters.update((current) => toggled(current, value));
  }
  protected toggleTag(value: string): void {
    this.tagFilters.update((current) => toggled(current, value));
  }
  protected toggleGenre(value: string): void {
    this.genreFilters.update((current) => toggled(current, value));
  }
  protected clearFilters(): void {
    this.store.query.set('');
    this.languageFilter.set(null);
    this.genreFilters.set([]);
    this.publicationFilters.set([]);
    this.tagFilters.set([]);
  }
  protected setSortKey(value: LibrarySortKey): void {
    this.store.sortKey.set(value);
    this.store.sortDirection.set(value === 'title' || value === 'author' ? 'asc' : 'desc');
  }

  protected toggleSortDirection(): void {
    this.store.sortDirection.update((direction: SortDirection) => (direction === 'asc' ? 'desc' : 'asc'));
  }

  protected deleteSelected(): void {
    const ids: string[] = this.selected();
    this.deleteTargets.set(this.store.visibleNovels().filter((novel) => ids.includes(novel.id)));
    this.deleteOpen.set(true);
  }
  protected setView(value: string): void {
    this.store.view.set(value as LibraryView);
  }

  protected sortDirectionKey(): string {
    return `library.browse.sortDirection.${this.store.sortDirection()}`;
  }

  protected sortKeyLabel(key: LibrarySortKey): string {
    return `library.mock.sort.${key}`;
  }

  protected publicationKey(value: string): string {
    return `library.mock.publication.${value}`;
  }

  protected tagKey(tag: string): string {
    return `library.mock.tag.${tag}`;
  }

  protected mediaKey(): string {
    return `library.mock.${this.media()}`;
  }

  protected retry(): void {
    this.store.setScenario('filled');
    this.store.simulateLoading();
  }
  protected importBusy(): boolean {
    return ['importing', 'paused', 'queued'].includes(this.store.importState());
  }
  protected canOpen(novel: LibraryNovel): boolean {
    return novel.id !== 'n-0006' || !this.importBusy();
  }
  protected chapterStat(novel: LibraryNovel): string {
    return novel.id === 'n-0006' && this.importBusy()
      ? `312 / ${this.count(novel.chapterCount)}`
      : novel.id === 'n-0006' && this.store.importState() === 'incomplete'
        ? this.count(312)
        : this.count(novel.chapterCount);
  }
  protected startDelete(novel: LibraryNovel): void {
    this.deleteTargets.set([novel]);
    this.deleteOpen.set(true);
  }
  protected onDeleted(): void {
    this.deleteOpen.set(false);
    this.selected.set([]);
  }
  protected open(id: string): void {
    const novel = this.store.novel(id);
    if (novel && this.canOpen(novel)) void this.router.navigateByUrl(`/library/${id}`);
  }
  protected goImport(): void {
    void this.router.navigateByUrl('/library/import');
  }
  protected showFolder(novel: LibraryNovel): void {
    this.toast.show({ kind: 'info', title: novel.folder });
  }
  protected changeCover(event: Event, novel: LibraryNovel): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') this.store.updateNovel(novel.id, { cover: reader.result });
    };
    reader.readAsDataURL(file);
  }
  protected onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && this.selected().length && !this.deleteOpen() && !isTypingTarget(target)) {
      this.selected.set([]);
      return;
    }
    if (event.key === '/' && !this.deleteOpen() && !this.exportOpen() && !this.editing() && !isTypingTarget(target)) {
      event.preventDefault();
      this.search()?.nativeElement.focus();
    }
  }
}
