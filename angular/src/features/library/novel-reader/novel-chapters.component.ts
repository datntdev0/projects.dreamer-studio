import { NgTemplateOutlet } from '@angular/common';
import { CdkFixedSizeVirtualScroll } from '@angular/cdk/scrolling';
import { CdkVirtualForOf } from '@angular/cdk/scrolling';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { computed } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { effect } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { model } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import { viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CHAPTER_TITLE_MAX } from '@dreamer/shared/models/novel';
import type { ChapterTranslationSummary } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import { isConsecutive } from '../library-format';
import { chapterRef } from '../library-format';
import { CHAPTER_ERROR_KEYS } from '../library-format';
import { lockKind } from '../library-format';
import type { ChapterChangeError } from '../library.models';
import type { ChapterDialogKind } from '../library.models';
import type { ChapterDialogState } from '../library.models';
import type { DragState } from '../library.models';
import type { LibraryChapter } from '../library.models';
import type { MenuState } from '../library.models';
import type { RenameState } from '../library.models';
import type { TextParts } from '../library.models';
import { NovelStore } from '../novel.store';
import { TranslationStore } from '../translation.store';
import { TranslationStatusComponent } from '../translation/translation-status.component';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { NovelLock as DetailLock } from '@dreamer/shared/models/novel';
import { chapterNumber } from '../library-format';
import { ChapterDeleteDialogComponent } from './chapter-delete-dialog.component';
import { ChapterMergeDialogComponent } from './chapter-merge-dialog.component';
import { ChapterMoveDialogComponent } from './chapter-move-dialog.component';
import { ChapterSplitDialogComponent } from './chapter-split-dialog.component';

const NUMBER_QUERY = /^\d+$/;
const SAVED_MS = 2000;

@Component({
  selector: 'ds-novel-chapters',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    ChapterDeleteDialogComponent,
    ChapterMergeDialogComponent,
    ChapterMoveDialogComponent,
    ChapterSplitDialogComponent,
    CheckboxComponent,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    IconComponent,
    NgTemplateOutlet,
    PillComponent,
    RouterLink,
    TooltipDirective,
    TranslatePipe,
    TranslationStatusComponent,
  ],
  host: {
    class: 'library-chapters',
    'data-testid': 'novel-chapters',
    '[class.is-organizing]': 'organizing()',
    '(document:pointerdown)': 'onDocumentPointer($event)',
    '(document:pointermove)': 'onDocumentPointerMove($event)',
    '(document:pointerup)': 'onDocumentPointerUp()',
    '(document:pointercancel)': 'onDocumentPointerCancel()',
  },
  templateUrl: './novel-chapters.component.html',
})
export class NovelChaptersComponent {
  readonly novel = input.required<NovelDetail>();
  readonly chapters = input.required<LibraryChapter[]>();
  readonly current = model<string | null>(null);
  readonly organizable = input<boolean>(true);
  readonly deselectable = input<boolean>(false);
  readonly readerLink = input<boolean>(false);
  readonly translatedTitles = input<boolean>(false);
  private readonly store: NovelStore = inject(NovelStore);
  private readonly translation: TranslationStore | null = inject(TranslationStore, { optional: true });
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly query = signal<string>('');
  protected readonly organizing = signal<boolean>(false);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly renaming = signal<RenameState | null>(null);
  protected readonly drag = signal<DragState | null>(null);
  protected readonly menu = signal<MenuState | null>(null);
  protected readonly dialog = signal<ChapterDialogState | null>(null);
  protected readonly saved = signal<boolean>(false);
  protected readonly translationLanguage: Signal<TargetLanguage | null> = computed(() =>
    this.translation?.status() ? this.translation.language() : null,
  );
  private readonly showTranslatedTitle: Signal<boolean> = computed(
    () =>
      !!this.translation &&
      (this.translatedTitles() || (!this.organizing() && this.translation.display() !== 'original')),
  );
  protected readonly titleMax: number = CHAPTER_TITLE_MAX;
  protected readonly announcement = signal<string>('');
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly menuPanel = viewChild<ElementRef<HTMLElement>>('menuPanel');
  private pointerY: number = 0;
  private frame: number = 0;
  private movingHandleFocus: boolean = false;
  private clickingMore: boolean = false;
  private focusRequest: number = 0;
  private listSelection: string | null = null;
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly novelId: Signal<string> = computed(() => this.novel().id);
  protected readonly locked: Signal<boolean> = computed(() => !!this.novel().lock);
  protected readonly canOrganize: Signal<boolean> = computed(
    () => this.organizable() && !this.locked() && this.chapters().length > 0,
  );
  private readonly numberMode: Signal<boolean> = computed(() => NUMBER_QUERY.test(this.query().trim()));
  protected readonly shown: Signal<LibraryChapter[]> = computed(() => {
    const query: string = this.query().trim().toLowerCase();
    return !query
      ? this.chapters()
      : this.chapters().filter((chapter: LibraryChapter): boolean =>
          this.numberMode() ? this.numberLabel(chapter).includes(query) : chapter.title.toLowerCase().includes(query),
        );
  });
  private readonly jumpTarget: Signal<LibraryChapter | null> = computed(() => {
    const exact: LibraryChapter | undefined = this.numberMode()
      ? this.shown().find((chapter: LibraryChapter): boolean => chapter.position === Number(this.query().trim()))
      : undefined;
    return exact ?? this.shown()[0] ?? null;
  });
  protected readonly hint: Signal<string> = computed(() => {
    const count: number = this.shown().length;
    if (!this.query().trim() || !count) return '';
    const matches: string =
      count === 1
        ? this.i18n.t('library.chapters.search.matchOne')
        : this.i18n.t('library.chapters.search.matchMany', { count: this.formatCount(count) });
    const target: LibraryChapter | null = this.jumpTarget();
    return this.numberMode() && target
      ? this.i18n.t('library.chapters.search.numberHint', { number: this.numberLabel(target), matches })
      : matches;
  });
  protected readonly focusId: Signal<string | null> = computed(() =>
    this.shown().some((chapter: LibraryChapter): boolean => chapter.id === this.current())
      ? this.current()
      : (this.shown()[0]?.id ?? null),
  );
  protected readonly selectedChapters: Signal<LibraryChapter[]> = computed(() =>
    this.chapters().filter((chapter: LibraryChapter): boolean => this.selected().has(chapter.id)),
  );
  protected readonly allShownSelected: Signal<boolean> = computed(
    () =>
      this.shown().length > 0 &&
      this.shown().every((chapter: LibraryChapter): boolean => this.selected().has(chapter.id)),
  );
  protected readonly organizeTooltip: Signal<string> = computed(() => {
    const lock: DetailLock | null = this.novel().lock;
    if (lock) return this.i18n.t(this.lockKey(lock));
    if (!this.chapters().length) return this.i18n.t('library.chapters.organizeEmpty');
    return this.organizing() ? '' : this.i18n.t('library.chapters.organizeHint');
  });
  protected readonly mergeReason: Signal<string> = computed(() =>
    this.selectedChapters().length < 2
      ? this.i18n.t('library.chapters.merge.needTwo')
      : isConsecutive(this.selectedChapters())
        ? ''
        : this.i18n.t('library.chapters.merge.notConsecutive'),
  );
  protected readonly selectionReason: Signal<string> = computed(() =>
    this.selectedChapters().length ? '' : this.i18n.t('library.chapters.needSelection'),
  );
  protected readonly handleTooltip: Signal<string> = computed(() =>
    this.drag() ? '' : this.i18n.t(this.query() ? 'library.chapters.drag.filtered' : 'library.chapters.drag.hint'),
  );
  protected readonly menuChapter: Signal<LibraryChapter | null> = computed(
    () => this.chapters().find((chapter: LibraryChapter): boolean => chapter.id === this.menu()?.id) ?? null,
  );
  private readonly numberFormat: Signal<Intl.NumberFormat> = computed(
    () => new Intl.NumberFormat(this.i18n.language()),
  );
  protected readonly rowHeight: number =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-h')) || 28;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.savedTimer);
      cancelAnimationFrame(this.frame);
    });
    effect(() => {
      this.novelId();
      untracked(() => {
        this.exitOrganize();
        this.query.set('');
      });
    });
    effect(() => {
      const locked: boolean = this.locked();
      untracked(() => {
        if (locked && this.organizing()) this.closeForLock();
      });
    });
    effect(() => {
      const ids: Set<string> = new Set(this.chapters().map((chapter: LibraryChapter): string => chapter.id));
      untracked(() => {
        if (!ids.size && this.organizing()) this.exitOrganize();
      });
    });
    effect(() => {
      const id: string | null = this.current();
      const block: ScrollLogicalPosition = this.listSelection === id ? 'nearest' : 'center';
      this.listSelection = null;
      if (id) requestAnimationFrame(() => this.scrollToRow(id, block));
    });
    effect(() => {
      const element: HTMLInputElement | undefined = this.renameInput()?.nativeElement;
      if (element) {
        element.focus();
        element.select();
      }
    });
    effect(() => {
      this.menuPanel()?.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }

  protected formatCount(value: number): string {
    return this.numberFormat().format(value);
  }
  protected translationCountLabel(language: TargetLanguage): string {
    const item = this.translation?.status()?.languages.find((entry) => entry.language === language);
    return this.i18n.t('library.translation.status.language', {
      language: this.translation?.languageLabel(language) ?? language.toUpperCase(),
      translated: this.formatCount(item?.translated ?? 0),
      total: this.formatCount(item?.total ?? this.chapters().length),
    });
  }
  protected chapterStatus(position: number): ChapterTranslationSummary | null {
    return this.translation?.chapterStatus(position) ?? null;
  }
  protected chapterRunning(position: number): boolean {
    const run = this.translation?.run();
    return run?.kind === 'content' && run.runningChapter === position;
  }
  protected rowTitle(chapter: LibraryChapter): string {
    return this.showTranslatedTitle() && this.translation
      ? this.translation.chapterTitle(chapter.position, chapter.title)
      : chapter.title;
  }
  protected rowLanguage(chapter: LibraryChapter): string {
    return this.showTranslatedTitle() && this.translation?.chapterTitleTranslated(chapter.position)
      ? (this.translation.language() ?? this.novel().language)
      : this.novel().language;
  }
  protected numberLabel(chapter: LibraryChapter): string {
    return chapterNumber(chapter);
  }
  private lockKey(lock: DetailLock): string {
    return `library.chapters.locked.${lockKind(lock)}`;
  }
  protected mark(text: string, kind: 'number' | 'title'): TextParts {
    const query: string = this.query().trim();
    const index: number =
      query && this.numberMode() === (kind === 'number') ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    return index < 0
      ? { pre: text, hit: '', post: '' }
      : {
          pre: text.slice(0, index),
          hit: text.slice(index, index + query.length),
          post: text.slice(index + query.length),
        };
  }
  protected dialogChapters(kind: ChapterDialogKind): LibraryChapter[] {
    const dialog: ChapterDialogState | null = this.dialog();
    return dialog?.kind === kind ? dialog.chapters : [];
  }
  protected setQuery(event: Event): void {
    const value: string = (event.target as HTMLInputElement).value;
    if (!value) {
      this.clearSearch();
      return;
    }
    this.query.set(value);
    this.closeMenu(false);
    this.viewport()?.scrollToIndex(0);
  }
  protected clearSearch(): void {
    this.query.set('');
    this.searchInput()?.nativeElement.focus();
    requestAnimationFrame(() => {
      const id: string | null = this.current();
      if (id) this.scrollToRow(id, 'center');
      else this.viewport()?.scrollToIndex(0);
    });
  }
  protected onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.query()) {
      event.preventDefault();
      event.stopPropagation();
      this.clearSearch();
    } else if (event.key === 'Enter') {
      const target: LibraryChapter | null = this.jumpTarget();
      if (!target) return;
      event.preventDefault();
      if (!this.organizing()) this.current.set(target.id);
      this.focusRow(target.id);
    } else if (event.key === 'ArrowDown' && this.shown().length) {
      event.preventDefault();
      this.focusRow(this.focusId() ?? this.shown()[0].id);
    }
  }
  protected openChapter(chapter: LibraryChapter): void {
    if (this.current() === chapter.id) {
      if (this.deselectable()) {
        this.current.set(null);
        return;
      }
      requestAnimationFrame(() => this.scrollToRow(chapter.id, 'nearest'));
      return;
    }
    this.listSelection = chapter.id;
    this.current.set(chapter.id);
  }
  protected onRowKey(event: KeyboardEvent, chapter: LibraryChapter): void {
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
    if (this.organizing()) {
      if (event.key === 'F2' && !this.renaming() && !this.drag()) {
        event.preventDefault();
        this.startRename(chapter);
      }
      return;
    }
    const index: number = this.shown().findIndex((item: LibraryChapter): boolean => item.id === chapter.id);
    const last: number = this.shown().length - 1;
    const next: Record<string, number> = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: last };
    if (!(event.key in next)) return;
    event.preventDefault();
    this.focusRow(this.shown()[Math.max(0, Math.min(last, next[event.key]))].id);
  }
  protected toggleOrganize(): void {
    if (this.organizing()) this.exitOrganize();
    else if (this.canOrganize()) this.organizing.set(true);
  }
  protected exitOrganize(): void {
    this.stopDrag();
    this.closeMenu(false);
    this.renaming.set(null);
    this.selected.set(new Set());
    this.organizing.set(false);
  }
  protected toggleSelected(id: string, checked: boolean): void {
    this.updateSelection([id], checked);
  }
  protected selectShown(checked: boolean): void {
    this.updateSelection(
      this.shown().map((chapter: LibraryChapter): string => chapter.id),
      checked,
    );
  }
  protected openDialog(kind: ChapterDialogKind, chapters: LibraryChapter[]): void {
    if (this.store.changing()) return;
    this.closeMenu(false);
    this.dialog.set({ kind, chapters });
  }
  protected openSplit(chapter: LibraryChapter): void {
    if (chapter.paragraphCount >= 2) this.openDialog('split', [chapter]);
  }
  protected onDialogDone(): void {
    this.dialog.set(null);
    this.selected.set(new Set());
    this.flashSaved();
  }
  protected onDialogInvalidated(): void {
    this.dialog.set(null);
    this.selected.set(new Set());
  }
  protected startRename(chapter: LibraryChapter): void {
    if (this.store.changing()) return;
    this.closeMenu(false);
    this.renaming.set({ id: chapter.id, value: chapter.title, error: false });
  }
  protected editRename(event: Event): void {
    const value: string = (event.target as HTMLInputElement).value;
    this.renaming.update((edit: RenameState | null) => edit && { ...edit, value, error: edit.error && !value.trim() });
  }
  protected onRenameKey(event: KeyboardEvent, chapter: LibraryChapter): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename(chapter);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.renaming.set(null);
      this.focusInRow(chapter.id, 'novel-chapters-row-more');
    }
  }
  protected onRenameBlur(chapter: LibraryChapter): void {
    const edit: RenameState | null = this.renaming();
    if (edit?.id !== chapter.id) return;
    if (edit.value.trim()) this.commitRename(chapter, false);
    else this.renaming.set(null);
  }
  protected toggleMenu(event: MouseEvent, chapter: LibraryChapter): void {
    this.clickingMore = false;
    if (this.drag() && !this.drag()!.pointer) this.cancelDrag();
    if (this.menu()?.id === chapter.id) {
      this.closeMenu(false);
      return;
    }
    const rect: DOMRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const view: HTMLElement = document.documentElement;
    const upward: boolean = rect.top > view.clientHeight / 2;
    this.menu.set({
      id: chapter.id,
      top: upward ? null : rect.bottom,
      bottom: upward ? view.clientHeight - rect.top : null,
      right: view.clientWidth - rect.right,
    });
  }
  protected closeMenu(focusTrigger: boolean): void {
    const id: string | undefined = this.menu()?.id;
    if (!id) return;
    this.menu.set(null);
    if (focusTrigger) this.focusInRow(id, 'novel-chapters-row-more');
  }
  protected onMenuKey(event: KeyboardEvent): void {
    const items: HTMLElement[] = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const index: number = items.indexOf(document.activeElement as HTMLElement);
    const next: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in next) {
      event.preventDefault();
      items[next[event.key]].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(true);
    }
  }
  protected onDocumentPointer(event: PointerEvent): void {
    this.focusRequest++;
    this.movingHandleFocus = false;
    const target: Element | null = event.target as Element | null;
    this.clickingMore = !!target?.closest('.library-chapters-more');
    if (!this.menu() || target?.closest('.library-chapters-menu, .library-chapters-more')) return;
    this.closeMenu(false);
  }
  protected onDocumentPointerMove(event: PointerEvent): void {
    this.movePointer(event);
  }
  protected onDocumentPointerUp(): void {
    if (this.drag()?.pointer) this.drop();
  }
  protected onDocumentPointerCancel(): void {
    this.clickingMore = false;
    if (this.drag()?.pointer) this.cancelDrag();
  }
  protected onListFocus(event: FocusEvent): void {
    if (event.target === event.currentTarget && this.focusId()) this.focusRow(this.focusId()!);
  }
  protected trackChapter(index: number, chapter: LibraryChapter): string {
    return chapter.id;
  }
  protected onHandleKey(event: KeyboardEvent, chapter: LibraryChapter): void {
    if (this.store.changing()) return;
    const drag: DragState | null = this.drag();
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (drag) this.drop();
      else this.grab(chapter, false);
    } else if (event.key === 'Escape' && drag) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelDrag();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step: number = event.key === 'ArrowUp' ? -1 : 1;
      if (drag) this.stepTarget(step);
      else this.focusSibling(chapter, step, 'novel-chapters-handle');
    }
  }
  protected onHandleBlur(): void {
    if (this.drag() && !this.drag()!.pointer && !this.movingHandleFocus && !this.clickingMore) this.cancelDrag();
  }
  protected startPointerDrag(event: PointerEvent, chapter: LibraryChapter): void {
    if (this.store.changing()) return;
    if (event.button !== 0) return;
    event.preventDefault();
    const handle: HTMLElement = event.currentTarget as HTMLElement;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    this.pointerY = event.clientY;
    this.grab(chapter, true);
    this.autoScroll();
  }
  protected movePointer(event: PointerEvent): void {
    if (!this.drag()?.pointer) return;
    this.pointerY = event.clientY;
    this.updatePointerTarget();
  }
  protected drop(): void {
    if (this.store.changing()) {
      this.stopDrag();
      return;
    }
    const drag: DragState | null = this.drag();
    if (!drag) return;
    this.stopDrag();
    const chapters: LibraryChapter[] = this.chapters();
    const ids: string[] = chapters
      .filter((chapter: LibraryChapter): boolean => drag.ids.includes(chapter.id))
      .map((chapter: LibraryChapter): string => chapter.id);
    const toIndex: number = this.toIndex(drag.ids, drag.target);
    const first: number = chapters.findIndex((chapter: LibraryChapter): boolean => chapter.id === ids[0]);
    if (isConsecutive(this.selectedOf(ids)) && first === toIndex) {
      if (!drag.pointer) this.announce(this.i18n.t('library.chapters.drag.cancelled'));
      return;
    }
    void this.move(ids, toIndex, drag.pointer);
  }
  private async move(ids: string[], toIndex: number, pointer: boolean): Promise<void> {
    const focusRequest: number = this.focusRequest;
    const error: ChapterChangeError | null = await this.store.change({
      kind: 'move',
      chapters: this.selectedOf(ids).map(chapterRef),
      toIndex,
    });
    if (error) {
      this.showError(error);
      return;
    }
    this.flashSaved();
    this.selected.set(new Set());
    this.announce(
      this.i18n.t('library.chapters.drag.dropped', { position: toIndex + 1, total: this.chapters().length }),
    );
    if (!pointer && focusRequest === this.focusRequest) this.focusInRow(String(toIndex + 1), 'novel-chapters-handle');
  }
  protected cancelDrag(): void {
    const drag: DragState | null = this.drag();
    if (!drag) return;
    this.stopDrag();
    this.announce(this.i18n.t('library.chapters.drag.cancelled'));
  }
  private grab(chapter: LibraryChapter, pointer: boolean): void {
    const ids: string[] = this.selected().has(chapter.id)
      ? this.selectedChapters().map((item: LibraryChapter): string => item.id)
      : [chapter.id];
    const target: number = this.chapters().findIndex((item: LibraryChapter): boolean => item.id === ids[0]);
    this.closeMenu(false);
    this.drag.set({ ids, target, pointer });
    if (pointer) return;
    const params = { position: target + 1, total: this.chapters().length };
    this.announce(
      ids.length > 1
        ? this.i18n.t('library.chapters.drag.grabbedMany', { ...params, count: ids.length })
        : this.i18n.t('library.chapters.drag.grabbed', { ...params, number: chapter.position, title: chapter.title }),
    );
  }
  private stepTarget(step: number): void {
    const drag: DragState = this.drag()!;
    const total: number = this.chapters().length;
    const position: number = this.toIndex(drag.ids, drag.target);
    let target: number = drag.target;
    while (target + step >= 0 && target + step <= total) {
      target += step;
      if (this.toIndex(drag.ids, target) !== position) break;
    }
    if (this.toIndex(drag.ids, target) !== position) {
      this.drag.set({ ...drag, target });
      const row: LibraryChapter | undefined = this.chapters()[Math.min(target, total - 1)];
      if (row) {
        this.movingHandleFocus = true;
        this.focusInRow(row.id, 'novel-chapters-handle', () => (this.movingHandleFocus = false));
      }
    }
    this.announce(
      this.i18n.t('library.chapters.drag.position', {
        position: this.toIndex(drag.ids, this.drag()!.target) + 1,
        total,
      }),
    );
  }
  private toIndex(ids: string[], target: number): number {
    return (
      target -
      this.chapters()
        .slice(0, target)
        .filter((chapter: LibraryChapter): boolean => ids.includes(chapter.id)).length
    );
  }
  private selectedOf(ids: string[]): LibraryChapter[] {
    return this.chapters().filter((chapter: LibraryChapter): boolean => ids.includes(chapter.id));
  }
  private updatePointerTarget(): void {
    const viewport: CdkVirtualScrollViewport | undefined = this.viewport();
    if (!viewport) return;
    const rect: DOMRect = viewport.elementRef.nativeElement.getBoundingClientRect();
    const index: number = Math.floor((this.pointerY - rect.top + viewport.measureScrollOffset()) / this.rowHeight);
    const target: number = Math.max(0, Math.min(this.shown().length, index));
    const drag: DragState | null = this.drag();
    if (drag && drag.target !== target) this.drag.set({ ...drag, target });
  }
  private autoScroll(): void {
    const list: HTMLElement | undefined = this.viewport()?.elementRef.nativeElement;
    if (!list || !this.drag()?.pointer) return;
    const rect: DOMRect = list.getBoundingClientRect();
    const edge: number = this.rowHeight * 2;
    const direction: number = this.pointerY < rect.top + edge ? -1 : this.pointerY > rect.bottom - edge ? 1 : 0;
    if (direction) {
      list.scrollTop += (direction * this.rowHeight) / 2;
      this.updatePointerTarget();
    }
    this.frame = requestAnimationFrame(() => this.autoScroll());
  }
  private stopDrag(): void {
    cancelAnimationFrame(this.frame);
    this.drag.set(null);
    this.movingHandleFocus = false;
  }
  private async commitRename(chapter: LibraryChapter, refocus: boolean = true): Promise<void> {
    if (this.store.changing()) return;
    const edit: RenameState | null = this.renaming();
    if (!edit) return;
    const title: string = edit.value.trim();
    if (!title) {
      this.renaming.set({ ...edit, error: true });
      this.announce(this.i18n.t('library.chapters.error.titleRequired'));
      return;
    }
    this.renaming.set(null);
    if (title !== chapter.title) {
      const error: ChapterChangeError | null = await this.store.change({
        kind: 'rename',
        chapter: chapterRef(chapter),
        title,
      });
      if (error) this.showError(error);
      else {
        this.flashSaved();
        this.announce(this.i18n.t('library.chapters.renamed', { number: chapter.position }));
      }
    }
    if (refocus) this.focusInRow(chapter.id, 'novel-chapters-row-more');
  }
  private closeForLock(): void {
    this.exitOrganize();
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('library.chapters.lockClosed.title'),
      message: this.i18n.t('library.chapters.lockClosed.message'),
    });
  }
  private updateSelection(ids: string[], checked: boolean): void {
    this.selected.update((current: Set<string>): Set<string> => {
      const next: Set<string> = new Set(current);
      ids.forEach((id: string) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  private showError(error: ChapterChangeError): void {
    this.toast.show({
      kind: 'danger',
      title: this.i18n.t('library.chapters.error.title'),
      message: this.i18n.t(CHAPTER_ERROR_KEYS[error]),
    });
  }
  private flashSaved(): void {
    clearTimeout(this.savedTimer);
    this.saved.set(true);
    this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_MS);
  }
  private announce(text: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(text));
  }
  private row(id: string): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(`[data-chapter-id="${id}"]`);
  }
  private scrollToRow(id: string, block: ScrollLogicalPosition): void {
    const viewport: CdkVirtualScrollViewport | undefined = this.viewport();
    const index: number = this.shown().findIndex((chapter: LibraryChapter): boolean => chapter.id === id);
    if (!viewport || index < 0) return;
    const top: number = index * this.rowHeight;
    const scrollTop: number = viewport.measureScrollOffset();
    const size: number = viewport.getViewportSize();
    if (block === 'center') {
      viewport.scrollToOffset(Math.max(0, top - (size - this.rowHeight) / 2));
    } else if (top < scrollTop) {
      viewport.scrollToIndex(index);
    } else if (top + this.rowHeight > scrollTop + size) {
      viewport.scrollToOffset(top + this.rowHeight - size);
    }
  }
  private focusRow(id: string): void {
    this.focusInRow(id, this.organizing() ? 'novel-chapters-row-more' : 'novel-chapters-row-open');
  }
  private focusInRow(id: string, testId: string, onComplete?: () => void): void {
    this.scrollToRow(id, 'nearest');
    const request: number = ++this.focusRequest;
    const tryFocus: (attempt: number) => void = (attempt: number): void => {
      if (request !== this.focusRequest) return;
      const element: HTMLElement | null | undefined = this.row(id)?.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (element) {
        element.focus();
        onComplete?.();
      } else if (attempt < 8) {
        requestAnimationFrame(() => tryFocus(attempt + 1));
      } else {
        onComplete?.();
      }
    };
    requestAnimationFrame(() => tryFocus(0));
  }
  private focusSibling(chapter: LibraryChapter, step: number, testId: string): void {
    const index: number = this.shown().findIndex((item: LibraryChapter): boolean => item.id === chapter.id);
    const sibling: LibraryChapter | undefined = this.shown()[index + step];
    if (sibling) this.focusInRow(sibling.id, testId);
  }
}
