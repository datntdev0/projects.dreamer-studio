import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { ElementRef } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { model } from '@angular/core';
import { untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { SettingsStore } from '@core/stores/settings-store';
import { findTextMatches } from '@dreamer/shared/core/text-match';
import type { TextMatch } from '@dreamer/shared/core/text-match';
import { chapterNumber } from '../library-format';
import { isTypingTarget } from '../library-format';
import type { LibraryChapter } from '../library.models';
import type { ReaderHighlight } from '../library.models';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import { NovelStore } from '../novel.store';
import type { ChapterTextState } from '../novel.store';

interface ReaderTextPart {
  text: string;
  highlighted: boolean;
  current: boolean;
}

type ReaderState = 'loading' | 'ready' | 'select' | 'empty' | 'error';

@Component({
  selector: 'ds-novel-reader',
  imports: [AreaStateComponent, ButtonDirective, IconComponent, NgTemplateOutlet, TranslatePipe],
  host: {
    class: 'library-reader',
    'data-testid': 'novel-reader',
    '(document:keydown)': 'onKeydown($event)',
  },
  templateUrl: './novel-reader.component.html',
})
export class NovelReaderComponent {
  readonly novel = input.required<NovelDetail>();
  readonly chapters = input.required<LibraryChapter[]>();
  readonly current = model<string | null>(null);
  readonly highlight = input<ReaderHighlight | null>(null);

  private readonly settingsStore: SettingsStore = inject(SettingsStore);
  private readonly novelStore: NovelStore = inject(NovelStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private scrollFrame: number = 0;

  protected readonly skeletonLines: number[] = Array.from({ length: 8 }, (_, index: number): number => index);
  protected readonly chapter: Signal<LibraryChapter | null> = computed(
    () => this.chapters().find((chapter: LibraryChapter): boolean => chapter.id === this.current()) ?? null,
  );
  private readonly text: Signal<ChapterTextState | null> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    return chapter ? this.novelStore.text(chapter) : null;
  });
  protected readonly state: Signal<ReaderState> = computed(() => {
    if (!this.chapters().length) return 'empty';
    const text: ChapterTextState | null = this.text();
    if (!text) return 'select';
    return text.status === 'missing' ? 'error' : text.status;
  });
  protected readonly previous: Signal<LibraryChapter | null> = computed(() => this.adjacent(-1));
  protected readonly next: Signal<LibraryChapter | null> = computed(() => this.adjacent(1));
  protected readonly readerFont = computed(() => `var(--font-${this.settingsStore.reading().font})`);
  protected readonly readerSize = computed(() => `${this.settingsStore.reading().size}px`);
  protected readonly readerLeading = computed(() => String(this.settingsStore.reading().leading));
  protected readonly readerMeasure = computed(() => `${this.settingsStore.reading().width}ch`);
  protected readonly titleParts: Signal<ReaderTextPart[]> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    return chapter ? this.textParts(chapter.title, null) : [];
  });
  protected readonly paragraphParts: Signal<ReaderTextPart[][]> = computed(() => {
    const text: ChapterTextState | null = this.text();
    if (text?.status !== 'ready') return [];
    return text.paragraphs.map((paragraph: string, index: number): ReaderTextPart[] =>
      this.textParts(paragraph, index),
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.scrollFrame));
    effect(() => {
      const chapter: LibraryChapter | null = this.chapter();
      const highlight: ReaderHighlight | null = this.highlight();
      if (!chapter) return;
      untracked(() => this.novelStore.ensure(chapter));
      this.text();
      this.scheduleScroll(
        highlight?.chapterId === chapter.id && highlight.paragraph !== null && !!highlight.query.trim(),
      );
    });
  }

  protected readonly chapterNumber = chapterNumber;

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected open(chapter: LibraryChapter | null): void {
    if (chapter) this.current.set(chapter.id);
  }

  protected retry(): void {
    const chapter: LibraryChapter | null = this.chapter();
    if (!chapter) return;
    this.novelStore.retry(chapter);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      this.open(this.previous());
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowRight') {
      event.preventDefault();
      this.open(this.next());
    }
  }

  private adjacent(direction: -1 | 1): LibraryChapter | null {
    const index: number = this.chapters().findIndex(
      (chapter: LibraryChapter): boolean => chapter.id === this.current(),
    );
    return index < 0 ? null : (this.chapters()[index + direction] ?? null);
  }

  private textParts(text: string, paragraph: number | null): ReaderTextPart[] {
    const highlight: ReaderHighlight | null = this.highlight();
    const chapter: LibraryChapter | null = this.chapter();
    const query: string = highlight && highlight.chapterId === chapter?.id ? highlight.query.trim() : '';
    if (!query) return [{ text, highlighted: false, current: false }];
    const characters: string[] = Array.from(text);
    const matches: TextMatch[] = findTextMatches(text, query);
    const parts: ReaderTextPart[] = [];
    let from: number = 0;
    for (const [index, match] of matches.entries()) {
      if (match.start > from)
        parts.push({ text: characters.slice(from, match.start).join(''), highlighted: false, current: false });
      parts.push({
        text: characters.slice(match.start, match.end).join(''),
        highlighted: true,
        current: highlight?.paragraph === paragraph && highlight.occurrence === index,
      });
      from = match.end;
    }
    if (!parts.length) return [{ text, highlighted: false, current: false }];
    if (from < characters.length)
      parts.push({ text: characters.slice(from).join(''), highlighted: false, current: false });
    return parts;
  }

  private scheduleScroll(toHighlight: boolean): void {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      if (toHighlight) {
        this.host.querySelector<HTMLElement>('mark.current')?.scrollIntoView({ block: 'center' });
      } else {
        this.host.querySelector<HTMLElement>('[data-testid="novel-reader-article"]')?.scrollTo({ top: 0 });
      }
    });
  }
}
