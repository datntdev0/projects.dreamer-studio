import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { inject } from '@angular/core';
import { Injector } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import { viewChild } from '@angular/core';
import { afterNextRender } from '@angular/core';
import type { Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { TabsComponent } from '@components/tabs/tabs.component';
import type { SplitterEdge } from '@components/splitter/splitter.directive';
import type { TabItem } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelDirective } from '@shell/layout/panel.directive';
import { PageCrumbService } from '@shell/page-crumb.service';
import { PageTitleDirective } from '@shell/page-title.directive';
import { chapterNumber } from './library-format';
import { isTypingTarget } from './library-format';
import type { LibraryChapter } from './library.models';
import type { LibraryNovel } from './library.models';
import type { NovelLock } from './library.models';
import type { NovelSearchState } from './library.models';
import type { NovelTab } from './library.models';
import type { PageState } from './library.models';
import type { ReaderHighlight } from './library.models';
import { LibraryMockStore } from './library.store';
import { ChapterEditorComponent } from './novel-reader/chapter-editor.component';
import { NovelChaptersComponent } from './novel-reader/novel-chapters.component';
import { NovelReaderComponent } from './novel-reader/novel-reader.component';
import { NovelSearchComponent } from './novel-reader/novel-search.component';
import type { NovelSearchSelection } from './novel-reader/novel-search.component';
import { ReadingSettingsComponent } from './novel-reader/reading-settings.component';
import { UnsavedChangesDialogComponent } from './novel-list/unsaved-changes-dialog.component';

const BROKEN_ID: string = 'n-broken';

const LOCK_HEADING_KEYS: Record<NovelLock['kind'], string> = {
  export: 'library.novel.lock.export',
  import: 'library.novel.lock.import',
};

const LOCK_REASON_KEYS: Record<NovelLock['kind'], string> = {
  export: 'library.novel.lock.reasonExport',
  import: 'library.novel.lock.reasonImport',
};

@Component({
  selector: 'ds-novel-page',
  imports: [
    AreaStateComponent,
    BannerComponent,
    ButtonDirective,
    ChapterEditorComponent,
    IconComponent,
    NovelChaptersComponent,
    NovelReaderComponent,
    NovelSearchComponent,
    PanelDirective,
    NgTemplateOutlet,
    PageTitleDirective,
    RouterLink,
    ReadingSettingsComponent,
    TabsComponent,
    TooltipDirective,
    TranslatePipe,
    UnsavedChangesDialogComponent,
  ],
  host: {
    class: 'ds-page library-novel',
    'data-testid': 'novel-page',
    '[attr.data-state]': 'state()',
    '[attr.aria-busy]': "state() === 'loading' || null",
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './novel.page.html',
})
export class NovelPage {
  protected readonly store: LibraryMockStore = inject(LibraryMockStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly injector: Injector = inject(Injector);
  private readonly layout: LayoutService = inject(LayoutService);
  private readonly crumb: PageCrumbService = inject(PageCrumbService);
  private readonly editor = viewChild(ChapterEditorComponent);
  private readonly hiddenPanels = new Set<SplitterEdge>();
  private readonly search = viewChild(NovelSearchComponent);
  private leaveResolve: ((leave: boolean) => void) | null = null;
  private searchInitialState: { query: string; state: NovelSearchState } | null = null;

  protected readonly lockHeadingKeys: Record<NovelLock['kind'], string> = LOCK_HEADING_KEYS;
  protected readonly skeletonCount: number[] = Array.from({ length: 8 }, (_, index: number): number => index);
  protected readonly id: Signal<string> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );
  protected readonly novel: Signal<LibraryNovel | null> = computed(() =>
    this.store.loading() ? null : this.store.novel(this.id()),
  );
  protected readonly state: Signal<PageState> = computed(() => {
    if (this.store.loading()) return 'loading';
    if (this.id() === BROKEN_ID) return 'error';
    return this.novel() ? 'ready' : 'notFound';
  });
  protected readonly tab = signal<NovelTab>('reading');
  protected readonly editing = signal<boolean>(false);
  protected readonly focusMode = signal<boolean>(false);
  protected readonly current = signal<string | null>(null);
  protected readonly highlight = signal<ReaderHighlight | null>(null);
  protected readonly leaveOpen = signal<boolean>(false);
  private initialized = false;

  protected readonly tabs: Signal<TabItem[]> = computed(() => [
    { id: 'reading', label: this.i18n.t('library.novel.tabs.reading') },
    { id: 'search', label: this.i18n.t('library.novel.tabs.search') },
  ]);
  protected readonly chapters: Signal<LibraryChapter[]> = computed(() => {
    const novel: LibraryNovel | null = this.novel();
    return novel ? this.store.chapters(novel.id) : [];
  });
  protected readonly chapter: Signal<LibraryChapter | null> = computed(
    () => this.chapters().find((chapter: LibraryChapter): boolean => chapter.id === this.current()) ?? null,
  );
  protected readonly lockReason: Signal<string> = computed(() => {
    const lock: NovelLock | null = this.novel()?.lock ?? null;
    return lock ? this.i18n.t(LOCK_REASON_KEYS[lock.kind], { run: lock.runLabel }) : '';
  });
  protected readonly editReason: Signal<string> = computed(
    () => this.lockReason() || (this.chapter() ? '' : this.i18n.t('library.novel.page.noChapters')),
  );
  protected readonly heading: Signal<string> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    return chapter ? `${chapterNumber(chapter)} · ${chapter.title}` : (this.novel()?.title ?? '');
  });
  protected readonly errorDetails: Signal<string> = computed(
    () => `LibraryReadError: library/${this.id()}/novel.json is not valid JSON (line 1, column 214)`,
  );

  constructor() {
    effect(() => {
      this.id();
      untracked(() => {
        this.initialized = false;
        this.editing.set(false);
        this.current.set(null);
        this.highlight.set(null);
        this.tab.set('reading');
        this.focusMode.set(false);
        this.searchInitialState = null;
        this.store.simulateLoading();
      });
    });
    effect(() => {
      if (this.state() !== 'ready' || this.initialized) return;
      this.initialized = true;
      const initial = untracked(() => this.store.detailInitialState());
      const chapter: LibraryChapter | undefined = this.chapters().find(
        (item: LibraryChapter): boolean => item.position === initial.chapter,
      );
      this.current.set(chapter?.id ?? null);
      this.tab.set(initial.tab);
      this.editing.set(initial.editing && !!chapter);
      this.focusMode.set(initial.focusMode);
      this.searchInitialState = { query: initial.searchQuery, state: initial.searchState };
    });
    effect(() => this.crumb.detail.set(this.novel()?.title ?? null));
    effect(() => {
      const enabled: boolean = this.focusMode();
      untracked(() => this.syncFocusMode(enabled));
    });
    inject(DestroyRef).onDestroy(() => {
      this.crumb.detail.set(null);
      this.syncFocusMode(false);
    });
    effect(() => {
      if (this.state() !== 'ready' || this.tab() !== 'search' || !this.searchInitialState) return;
      afterNextRender(
        () => {
          const initial = this.searchInitialState;
          const search = this.search();
          if (!initial || !search) return;
          search.initialize(initial.query, initial.state);
          this.searchInitialState = null;
        },
        {
          injector: this.injector,
        },
      );
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.editing() || !this.editor()?.dirty()) return true;
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve: (leave: boolean) => void) => (this.leaveResolve = resolve));
  }

  protected async cancelEdit(): Promise<void> {
    if (await this.canLeave()) this.editing.set(false);
  }

  protected settleLeave(leave: boolean): void {
    this.leaveOpen.set(false);
    if (leave) this.editing.set(false);
    this.leaveResolve?.(leave);
    this.leaveResolve = null;
  }

  protected toggleFocusMode(): void {
    this.focusMode.update((enabled: boolean) => !enabled);
  }

  protected onSearchSelected(selection: NovelSearchSelection): void {
    this.current.set(selection.chapterId);
    this.highlight.set({ chapterId: selection.chapterId, query: selection.query });
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || event.altKey || event.metaKey) return;
    const isF: boolean = event.key.toLocaleLowerCase() === 'f';
    if (event.ctrlKey && event.shiftKey && isF) {
      event.preventDefault();
      this.tab.set('search');
      requestAnimationFrame(() => this.search()?.focus());
    } else if (!event.ctrlKey && event.shiftKey && isF) {
      event.preventDefault();
      this.toggleFocusMode();
    } else if (event.key === 'Escape' && this.focusMode()) {
      event.preventDefault();
      this.focusMode.set(false);
    }
  }

  private syncFocusMode(enabled: boolean): void {
    if (!enabled) {
      this.hiddenPanels.forEach((edge: SplitterEdge) => {
        if (!this.layout.isOpen(edge)) this.layout.toggle(edge);
      });
      this.hiddenPanels.clear();
      return;
    }
    (['left', 'right'] as SplitterEdge[]).forEach((edge: SplitterEdge) => {
      if (this.layout.isOpen(edge)) {
        this.layout.toggle(edge);
        this.hiddenPanels.add(edge);
      }
    });
  }
}
