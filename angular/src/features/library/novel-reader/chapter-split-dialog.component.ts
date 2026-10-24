import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { input } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ToastOptions } from '@components/toast/toast.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CHAPTER_TITLE_MAX } from '@dreamer/shared/models/novel';
import { chapterRef } from '../library-format';
import type { LibraryChapter } from '../library.models';
import type { ChapterTextState } from '../novel.store';
import { ChapterChangeDialog } from './chapter-change-dialog';
import { ChapterDialogAlertsComponent } from './chapter-dialog-alerts.component';

@Component({
  selector: 'ds-chapter-split-dialog',
  imports: [
    BannerComponent,
    ButtonDirective,
    ChapterDialogAlertsComponent,
    DialogComponent,
    FieldComponent,
    IconComponent,
    TranslatePipe,
  ],
  templateUrl: './chapter-split-dialog.component.html',
})
export class ChapterSplitDialogComponent extends ChapterChangeDialog {
  readonly chapter = input.required<LibraryChapter | null>();
  protected readonly titleMax: number = CHAPTER_TITLE_MAX;

  protected readonly point = signal<number | null>(null);
  protected readonly title = signal<string>('');
  protected readonly paragraphs: Signal<string[]> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    const text: ChapterTextState | null = chapter ? this.store.text(chapter) : null;
    return text?.status === 'ready' ? text.paragraphs : [];
  });
  protected readonly textStatus: Signal<ChapterTextState['status']> = computed(() => {
    const chapter: LibraryChapter | null = this.chapter();
    return chapter ? this.store.text(chapter).status : 'loading';
  });
  protected readonly splittable: Signal<boolean> = computed(() => this.paragraphs().length >= 2);
  protected readonly paragraphsLabel: Signal<string> = computed(() =>
    this.paragraphs().length === 1
      ? this.i18n.t('library.chapterDialog.split.paragraphsOne')
      : this.i18n.t('library.chapterDialog.split.paragraphs', { count: this.paragraphs().length }),
  );
  protected readonly titleValid: Signal<boolean> = computed(() => !!this.title().trim());
  protected readonly canApply: Signal<boolean> = computed(
    () => this.splittable() && this.point() !== null && this.titleValid() && !this.lock() && !this.busy(),
  );

  constructor() {
    super();
    effect(() => {
      const chapter: LibraryChapter | null = this.chapter();
      if (this.open() && chapter) untracked(() => this.store.ensure(chapter));
    });
  }

  protected reset(): void {
    this.point.set(null);
    this.title.set(this.i18n.t('library.chapterDialog.split.defaultTitle', { title: this.chapter()?.title ?? '' }));
  }

  protected isSecondPart(index: number): boolean {
    const point: number | null = this.point();
    return point !== null && index >= point;
  }

  protected isTabbable(gap: number): boolean {
    return (this.point() ?? 1) === gap;
  }

  protected pick(gap: number): void {
    this.point.set(gap);
  }

  protected setTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected onGapKeydown(event: KeyboardEvent, gap: number): void {
    const last: number = this.paragraphs().length - 1;
    const next: number | null = this.nextGap(event.key, gap, last);
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.point.set(next);
    const group: Element | null = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]');
    group?.querySelectorAll<HTMLButtonElement>('.chapter-dlg-gap')[next - 1]?.focus();
  }

  protected split(): void {
    const chapter: LibraryChapter | null = this.chapter();
    const point: number | null = this.point();
    if (!chapter || point === null || !this.canApply()) {
      return;
    }
    const newTitle: string = this.title().trim();
    const success: ToastOptions = {
      kind: 'success',
      title: this.i18n.t('library.chapterDialog.split.done', { title: chapter.title }),
      message: this.i18n.t('library.chapterDialog.split.doneMessage', { newTitle, start: point + 1 }),
    };
    void this.apply(
      'library.chapterDialog.split.failed',
      {
        kind: 'split',
        chapter: chapterRef(chapter),
        atParagraph: point,
        title: newTitle,
      },
      success,
    );
  }

  private nextGap(key: string, gap: number, last: number): number | null {
    if (key === 'ArrowDown' || key === 'ArrowRight') {
      return Math.min(gap + 1, last);
    }
    if (key === 'ArrowUp' || key === 'ArrowLeft') {
      return Math.max(gap - 1, 1);
    }
    if (key === 'Home') {
      return 1;
    }
    return key === 'End' ? last : null;
  }
}
