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
import { BadgeComponent } from '@components/status/badge.component';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import type { ChapterTranslationStatus } from '@dreamer/shared/models/translation';
import type { TranslationView } from '@dreamer/shared/models/translation';
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
import type { LibraryChapter } from './library.models';
import type { PageState } from './library.models';
import type { NovelTab } from './library.models';
import type { ReaderHighlight } from './library.models';
import { ChapterEditorComponent } from './novel-reader/chapter-editor.component';
import { NovelChaptersComponent } from './novel-reader/novel-chapters.component';
import { NovelReaderComponent } from './novel-reader/novel-reader.component';
import { NovelSearchComponent } from './novel-reader/novel-search.component';
import type { NovelSearchSelection } from './novel-reader/novel-search.component';
import { ReadingSettingsComponent } from './novel-reader/reading-settings.component';
import { UnsavedChangesDialogComponent } from './novel-list/unsaved-changes-dialog.component';
import { NovelSearchStore } from './novel-search.store';
import { NovelStore } from './novel.store';
import { TranslationStore } from './translation.store';
import { AppInfoStore } from '@core/app-info';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { RecentNovelStore } from '@core/stores/recent-novel-store';
import { GlossaryViewComponent } from './translation/glossary-view.component';
import { InstructionEditorComponent } from './translation/instruction-editor.component';
import { TranslateContentDialogComponent } from './translation/translate-content-dialog.component';
import { TranslateGlossaryDialogComponent } from './translation/translate-glossary-dialog.component';
import { TranslationIssuesComponent } from './translation/translation-issues.component';
import { TranslationPillComponent } from './translation/translation-pill.component';

type PageTab = NovelTab | 'translation';

const LOCK_KEYS: Record<string, { heading: string; reason: string; message: string }> = {
  'novel-export': {
    heading: 'library.novel.lock.export',
    reason: 'library.novel.lock.reasonExport',
    message: 'library.novel.lock.message',
  },
  'novel-import': {
    heading: 'library.novel.lock.import',
    reason: 'library.novel.lock.reasonImport',
    message: 'library.novel.lock.message',
  },
  'glossary-translation': {
    heading: 'library.translation.page.lockGlossary',
    reason: 'library.translation.page.lockReasonGlossary',
    message: 'library.translation.page.lockMessage',
  },
  'content-translation': {
    heading: 'library.translation.page.lockContent',
    reason: 'library.translation.page.lockReasonContent',
    message: 'library.translation.page.lockMessage',
  },
};

@Component({
  selector: 'ds-novel-page',
  imports: [
    AreaStateComponent,
    BadgeComponent,
    BannerComponent,
    ButtonDirective,
    ChapterEditorComponent,
    IconComponent,
    GlossaryViewComponent,
    InstructionEditorComponent,
    NovelChaptersComponent,
    NovelReaderComponent,
    NovelSearchComponent,
    PanelDirective,
    NgTemplateOutlet,
    PageTitleDirective,
    RouterLink,
    ReadingSettingsComponent,
    TabsComponent,
    TranslateContentDialogComponent,
    TranslateGlossaryDialogComponent,
    TooltipDirective,
    TranslatePipe,
    TranslationIssuesComponent,
    TranslationPillComponent,
    UnsavedChangesDialogComponent,
  ],
  providers: [NovelStore, NovelSearchStore, TranslationStore],
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
  protected readonly translationStore: TranslationStore = inject(TranslationStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly layout: LayoutService = inject(LayoutService);
  private readonly crumb: PageCrumbService = inject(PageCrumbService);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly router: Router = inject(Router);
  private readonly appInfo = inject(AppInfoStore);
  private readonly recentNovels = inject(RecentNovelStore);
  protected readonly currentNovel = inject(CurrentNovelStore);
  private lastRecordedNovel: string | null = null;
  private lastRecordedRoot: string | null = null;
  private readonly hiddenPanels: Set<SplitterEdge> = new Set<SplitterEdge>();
  private readonly editor = viewChild(ChapterEditorComponent);
  private leaveResolve: ((leave: boolean) => void) | null = null;
  private previousChapters: LibraryChapter[] | null = null;
  private previousQuery: string | null = null;
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
  protected readonly tab: WritableSignal<PageTab> = signal<PageTab>('reading');
  protected readonly focusMode: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly editing: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly leaveOpen: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly current: WritableSignal<string | null> = signal<string | null>(null);
  protected readonly highlight: WritableSignal<ReaderHighlight | null> = signal<ReaderHighlight | null>(null);
  protected readonly tabs: Signal<TabItem[]> = computed(() => [
    { id: 'reading', label: this.i18n.t('library.novel.tabs.reading') },
    { id: 'search', label: this.i18n.t('library.novel.tabs.search') },
    {
      id: 'translation',
      label: this.i18n.t('library.translation.page.tab'),
      count:
        this.translationStore.chapter() && this.translationStore.issues().length
          ? this.translationStore.issues().length
          : null,
    },
  ]);
  protected readonly views: TranslationView[] = ['reader', 'glossary'];
  protected readonly viewIcons: Record<TranslationView, string> = { reader: 'book', glossary: 'tag' };
  protected readonly status = this.translationStore.status;
  protected readonly translateReason: Signal<string> = computed(() => {
    if (this.lockReason()) return this.lockReason();
    if (!this.chapters().length) return this.i18n.t('library.novel.page.noChapters');
    if (!this.translationStore.language()) return this.i18n.t('library.translation.page.noTarget');
    if (this.status()?.llm.content.available === false) return this.i18n.t('library.translation.page.noLlm');
    return '';
  });
  protected readonly editLabel: Signal<string> = computed(() =>
    this.translationStore.display() === 'original'
      ? this.i18n.t('library.novel.page.edit')
      : this.i18n.t('library.translation.page.editTranslation'),
  );
  protected readonly chapter: Signal<LibraryChapter | null> = computed(
    () => this.chapters().find((item: LibraryChapter): boolean => item.id === this.current()) ?? null,
  );
  protected readonly lockHeading: Signal<string> = computed(() => this.lockText(this.novel()?.lock, 'heading'));
  protected readonly lockReason: Signal<string> = computed(() => this.lockText(this.novel()?.lock, 'reason'));
  protected readonly lockMessage: Signal<string> = computed(() => {
    const type = this.novel()?.lock?.type;
    return type && LOCK_KEYS[type] ? this.i18n.t(LOCK_KEYS[type].message) : '';
  });
  protected readonly editReason: Signal<string> = computed(() => {
    if (this.translationStore.view() === 'glossary') return this.i18n.t('library.translation.page.editGlossaryView');
    if (this.lockReason()) return this.lockReason();
    if (!this.chapters().length) return this.i18n.t('library.novel.page.noChapters');
    const chapter: LibraryChapter | null = this.chapter();
    if (chapter && this.store.text(chapter).status === 'missing')
      return this.i18n.t('library.novel.page.chapterMissing');
    if (this.translationStore.display() !== 'original' && !this.translationStore.language())
      return this.i18n.t('library.translation.page.noTarget');
    return '';
  });
  protected startEdit(): void {
    if (!this.editReason() && !this.editing()) this.editing.set(true);
  }
  private readonly translatedHeading: Signal<boolean> = computed(() => {
    const translated = this.translationStore.chapter();
    const status: ChapterTranslationStatus | undefined = translated?.status;
    return (
      this.translationStore.view() === 'reader' &&
      this.translationStore.display() !== 'original' &&
      !!translated?.title.trim() &&
      status !== 'not-translated' &&
      status !== 'failed'
    );
  });
  protected readonly headingLanguage: Signal<string | null> = computed(() =>
    this.translatedHeading()
      ? this.translationStore.language()
      : this.chapter()
        ? (this.novel()?.language ?? null)
        : null,
  );
  protected readonly heading: Signal<string> = computed(() => {
    if (this.translationStore.view() === 'glossary') return this.novel()?.title ?? '';
    const chapter: LibraryChapter | null = this.chapter();
    return chapter
      ? `${chapterNumber(chapter)} · ${this.translatedHeading() ? this.translationStore.chapter()?.title : chapter.title}`
      : (this.novel()?.title ?? '');
  });

  constructor() {
    effect(() => {
      const novel = this.novel();
      const root = this.appInfo.info()?.appDataDir;
      if (
        this.state() === 'ready' &&
        novel &&
        root &&
        (novel.id !== this.lastRecordedNovel || root !== this.lastRecordedRoot)
      ) {
        this.lastRecordedNovel = novel.id;
        this.lastRecordedRoot = root;
        untracked(() => this.recentNovels.record(novel.id));
      }
    });
    effect(() => {
      const novelId: string = this.novel()?.id ?? '';
      const chapters: LibraryChapter[] = this.chapters();
      untracked(() => this.searchStore.setContext(novelId, chapters));
    });
    effect(() => {
      const novelId: string = this.novel()?.id ?? '';
      untracked(() => void this.translationStore.open(novelId));
    });
    effect(() => {
      const file: string | null = this.chapter()?.file ?? null;
      untracked(() => this.translationStore.setChapter(file));
    });
    effect(() => {
      const id: string = this.id();
      untracked(() => {
        this.current.set(null);
        this.editing.set(false);
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
        this.syncChapter(chapters, query);
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

  private syncChapter(chapters: LibraryChapter[], query: string | null): void {
    const listChanged: boolean = this.previousChapters !== chapters;
    const queryChanged: boolean = this.previousQuery !== query;
    const oldChapter: LibraryChapter | undefined = this.previousChapters?.find(
      (chapter: LibraryChapter): boolean => chapter.id === this.current(),
    );
    this.previousChapters = chapters;
    this.previousQuery = query;
    const requested: number | null = query !== null && /^\d+$/.test(query) ? Number(query) : null;
    const selected: LibraryChapter | undefined =
      queryChanged || !oldChapter
        ? chapters.find((chapter: LibraryChapter): boolean => chapter.position === requested)
        : undefined;
    const sameFile: LibraryChapter | undefined =
      listChanged && oldChapter
        ? chapters
            .filter((chapter: LibraryChapter): boolean => chapter.file === oldChapter.file)
            .sort(
              (a: LibraryChapter, b: LibraryChapter): number =>
                Math.abs(a.position - oldChapter.position) - Math.abs(b.position - oldChapter.position),
            )[0]
        : undefined;
    const fallback: LibraryChapter | undefined = this.current()
      ? (chapters.find((chapter: LibraryChapter): boolean => chapter.position === Number(this.current())) ??
        chapters.at(-1))
      : chapters[0];
    const chapter: LibraryChapter | undefined = selected ?? sameFile ?? fallback;
    const id: string | null = chapter?.id ?? null;
    const positionChanged: boolean = this.current() !== id;
    if (positionChanged) {
      this.current.set(id);
      this.highlight.set(null);
    }
    if ((query !== null || (listChanged && positionChanged)) && query !== id) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { chapter: id },
        replaceUrl: true,
      });
    }
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

  protected selectChapter(id: string | null): void {
    if (this.translationStore.view() === 'glossary') this.translationStore.setView('reader');
    if (this.editing() || !id || id === this.current()) return;
    this.current.set(id);
    this.highlight.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { chapter: id }, replaceUrl: true });
  }

  protected toggleFocusMode(): void {
    this.focusMode.update((enabled: boolean): boolean => !enabled);
  }

  protected showIssues(): void {
    const wasFocused = this.focusMode();
    if (wasFocused) this.focusMode.set(false);
    this.tab.set('translation');
    if (wasFocused) {
      requestAnimationFrame(() => {
        if (!this.layout.isOpen('right')) this.layout.toggle('right');
      });
    } else if (!this.layout.isOpen('right')) {
      this.layout.toggle('right');
    }
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
    if (this.editing()) return;
    if (isTypingTarget(event.target) || event.altKey || event.metaKey) return;
    const isF: boolean = event.key.toLocaleLowerCase() === 'f';
    if (event.ctrlKey && event.shiftKey && isF) {
      event.preventDefault();
      this.translationStore.setView('reader');
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
    if (!lock || !LOCK_KEYS[lock.type]) return '';
    return this.i18n.t(LOCK_KEYS[lock.type][kind], { run: lock.label ?? this.novel()?.title ?? '' });
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
