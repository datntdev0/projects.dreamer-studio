import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { effect } from '@angular/core';
import { inject } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import { viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import type { SplitterEdge } from '@components/splitter/splitter.directive';
import { TabsComponent } from '@components/tabs/tabs.component';
import type { TabItem } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelDirective } from '@shell/layout/panel.directive';
import { PageCrumbService } from '@shell/page-crumb.service';
import { PageTitleDirective } from '@shell/page-title.directive';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { NovelLock } from '@dreamer/shared/models/novel';
import { map } from 'rxjs';
import { chapterNumber } from './library-format';
import { isTypingTarget } from './library-format';
import { lockKind } from './library-format';
import type { LibraryChapter } from './library.models';
import type { PageState } from './library.models';
import type { NovelTab } from './library.models';
import type { ReaderHighlight } from './library.models';
import { NovelChaptersComponent } from './novel-reader/novel-chapters.component';
import { NovelReaderComponent } from './novel-reader/novel-reader.component';
import { NovelSearchComponent } from './novel-reader/novel-search.component';
import type { NovelSearchSelection } from './novel-reader/novel-search.component';
import { ReadingSettingsComponent } from './novel-reader/reading-settings.component';
import { NovelSearchStore } from './novel-search.store';
import { NovelStore } from './novel.store';

const LOCK_KEYS: Record<'export' | 'import', { heading: string; reason: string }> = {
  export: { heading: 'library.novel.lock.export', reason: 'library.novel.lock.reasonExport' },
  import: { heading: 'library.novel.lock.import', reason: 'library.novel.lock.reasonImport' },
};

@Component({
  selector: 'ds-novel-page',
  imports: [
    AreaStateComponent,
    BannerComponent,
    ButtonDirective,
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
  ],
  providers: [NovelStore, NovelSearchStore],
  host: {
    class: 'ds-page library-novel',
    'data-testid': 'novel-page',
    '[attr.data-state]': 'store.state()',
    '[attr.aria-busy]': "store.state() === 'loading' || null",
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './novel.page.html',
})
export class NovelPage {
  protected readonly store: NovelStore = inject(NovelStore);
  private readonly searchStore: NovelSearchStore = inject(NovelSearchStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly layout: LayoutService = inject(LayoutService);
  private readonly crumb: PageCrumbService = inject(PageCrumbService);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly router: Router = inject(Router);
  private readonly hiddenPanels: Set<SplitterEdge> = new Set<SplitterEdge>();
  private readonly search = viewChild(NovelSearchComponent);
  protected readonly id: Signal<string> = toSignal(
    this.route.paramMap.pipe(map((params): string => params.get('id') ?? '')),
    {
      initialValue: this.route.snapshot.paramMap.get('id') ?? '',
    },
  );
  private readonly queryChapter: Signal<string | null> = toSignal(
    this.route.queryParamMap.pipe(map((params): string | null => params.get('chapter'))),
    { initialValue: this.route.snapshot.queryParamMap.get('chapter') },
  );

  protected readonly skeletonCount: number[] = Array.from({ length: 8 }, (_, index: number): number => index);
  protected readonly novel: Signal<NovelDetail | null> = this.store.novel;
  protected readonly state: Signal<PageState> = this.store.state;
  protected readonly chapters: Signal<LibraryChapter[]> = this.store.chapters;
  protected readonly tab: WritableSignal<NovelTab> = signal<NovelTab>('reading');
  protected readonly focusMode: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly current: WritableSignal<string | null> = signal<string | null>(null);
  protected readonly highlight: WritableSignal<ReaderHighlight | null> = signal<ReaderHighlight | null>(null);
  protected readonly tabs: Signal<TabItem[]> = computed(() => [
    { id: 'reading', label: this.i18n.t('library.novel.tabs.reading') },
    { id: 'search', label: this.i18n.t('library.novel.tabs.search') },
  ]);
  protected readonly chapter: Signal<LibraryChapter | null> = computed(
    () => this.chapters().find((item: LibraryChapter): boolean => item.id === this.current()) ?? null,
  );
  protected readonly lockHeading: Signal<string> = computed(() => this.lockText(this.novel()?.lock, 'heading'));
  protected readonly lockReason: Signal<string> = computed(() => this.lockText(this.novel()?.lock, 'reason'));
  protected readonly editReason: Signal<string> = computed(
    () =>
      this.lockReason() ||
      (!this.chapters().length ? this.i18n.t('library.novel.page.noChapters') : this.i18n.t('common.soon')),
  );
  protected readonly heading: Signal<string> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    return chapter ? `${chapterNumber(chapter)} · ${chapter.title}` : (this.novel()?.title ?? '');
  });

  constructor() {
    effect(() => {
      const novelId: string = this.novel()?.id ?? '';
      const chapters: LibraryChapter[] = this.chapters();
      untracked(() => this.searchStore.setContext(novelId, chapters));
    });
    effect(() => {
      const id: string = this.id();
      untracked(() => {
        this.current.set(null);
        this.highlight.set(null);
        this.tab.set('reading');
        this.focusMode.set(false);
        void this.store.open(id);
      });
    });
    effect(() => {
      const chapters: LibraryChapter[] = this.chapters();
      const query: string | null = this.queryChapter();
      if (this.state() !== 'ready') return;
      untracked(() => {
        const requested: number | null = query !== null && /^\d+$/.test(query) ? Number(query) : null;
        const selected: LibraryChapter | undefined = chapters.find(
          (item: LibraryChapter): boolean => item.position === requested,
        );
        const fallback: LibraryChapter | undefined =
          query !== null && this.current()
            ? (chapters.find((item: LibraryChapter): boolean => item.position === Number(this.current())) ??
              chapters.at(-1))
            : chapters[0];
        const chapter: LibraryChapter | undefined = selected ?? fallback;
        const id: string | null = chapter?.id ?? null;
        if (this.current() !== id) this.current.set(id);
        if (query !== null && chapter && query !== String(chapter.position)) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { chapter: String(chapter.position) },
            replaceUrl: true,
          });
        }
      });
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
  }

  canLeave(): boolean {
    return true;
  }

  protected selectChapter(id: string | null): void {
    if (!id || id === this.current()) return;
    this.current.set(id);
    this.highlight.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { chapter: id }, replaceUrl: true });
  }

  protected toggleFocusMode(): void {
    this.focusMode.update((enabled: boolean): boolean => !enabled);
  }

  protected onSearchSelected(selection: NovelSearchSelection): void {
    const chapterId: string = String(selection.hit.position);
    this.selectChapter(chapterId);
    this.highlight.set({
      chapterId,
      query: selection.query,
      paragraph: selection.hit.paragraph,
      occurrence: selection.occurrence,
    });
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || event.altKey || event.metaKey) return;
    const isF: boolean = event.key.toLocaleLowerCase() === 'f';
    if (event.ctrlKey && event.shiftKey && isF) {
      event.preventDefault();
      this.tab.set('search');
      if (!this.layout.isOpen('right')) this.layout.toggle('right');
      requestAnimationFrame(() => this.search()?.focus());
    } else if (!event.ctrlKey && event.shiftKey && isF) {
      event.preventDefault();
      this.toggleFocusMode();
    } else if (event.key === 'Escape' && this.focusMode()) {
      event.preventDefault();
      this.focusMode.set(false);
    }
  }

  private lockText(lock: NovelLock | null | undefined, kind: 'heading' | 'reason'): string {
    if (!lock || (lock.type !== 'novel-export' && lock.type !== 'novel-import')) return '';
    return this.i18n.t(LOCK_KEYS[lockKind(lock)][kind], { run: lock.label ?? this.novel()?.title ?? '' });
  }

  private syncFocusMode(enabled: boolean): void {
    if (!enabled) {
      this.hiddenPanels.forEach((edge: SplitterEdge): void => {
        if (!this.layout.isOpen(edge)) this.layout.toggle(edge);
      });
      this.hiddenPanels.clear();
      return;
    }
    (['left', 'right'] as SplitterEdge[]).forEach((edge: SplitterEdge): void => {
      if (this.layout.isOpen(edge)) {
        this.layout.toggle(edge);
        this.hiddenPanels.add(edge);
      }
    });
  }
}
