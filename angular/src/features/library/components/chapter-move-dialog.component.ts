import { Component, computed, input, signal, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ToastOptions } from '@components/toast/toast.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { byPosition, isConsecutive, LIST_LIMIT } from '../library-format';
import type { LibraryChapter, MoveMode } from '../library.models';
import { ChapterChangeDialog } from './chapter-change-dialog';
import { ChapterDialogAlertsComponent } from './chapter-dialog-alerts.component';
import { ChapterDialogListComponent } from './chapter-dialog-list.component';

const END_OF_LIST = '';

@Component({
  selector: 'ds-chapter-move-dialog',
  imports: [
    ButtonDirective,
    ChapterDialogAlertsComponent,
    ChapterDialogListComponent,
    DialogComponent,
    FieldComponent,
    IconComponent,
    SegmentedComponent,
    TranslatePipe,
  ],
  templateUrl: './chapter-move-dialog.component.html',
})
export class ChapterMoveDialogComponent extends ChapterChangeDialog {
  readonly chapters = input.required<LibraryChapter[]>();

  protected readonly listLimit: number = LIST_LIMIT;
  protected readonly endOfList: string = END_OF_LIST;
  protected readonly mode = signal<MoveMode>('position');
  protected readonly positionText = signal<string>('');
  protected readonly beforeId = signal<string>(END_OF_LIST);
  protected readonly items: Signal<LibraryChapter[]> = computed(() => byPosition(this.chapters()));
  protected readonly rest: Signal<LibraryChapter[]> = computed(() => {
    const ids: string[] = this.items().map((chapter: LibraryChapter): string => chapter.id);
    return this.store.chapters(this.novelId()).filter((chapter: LibraryChapter): boolean => !ids.includes(chapter.id));
  });
  protected readonly maxPosition: Signal<number> = computed(() => this.rest().length + 1);
  protected readonly modeOptions: Signal<SegmentedOption[]> = computed(() => [
    { value: 'position', label: this.i18n.t('library.chapterDialog.move.modePosition'), icon: 'hash' },
    { value: 'before', label: this.i18n.t('library.chapterDialog.move.modeBefore'), icon: 'arrow-up' },
  ]);
  protected readonly toIndex: Signal<number | null> = computed(() => {
    if (this.mode() === 'before') {
      const index: number = this.rest().findIndex((chapter: LibraryChapter): boolean => chapter.id === this.beforeId());
      return index < 0 ? this.rest().length : index;
    }
    const position: number = Number(this.positionText());
    const valid: boolean = Number.isInteger(position) && position >= 1 && position <= this.maxPosition();
    return this.positionText() && valid ? position - 1 : null;
  });
  protected readonly positionInvalid: Signal<boolean> = computed(
    () => this.mode() === 'position' && !!this.positionText() && this.toIndex() === null,
  );
  protected readonly target: Signal<{ start: number; end: number } | null> = computed(() => {
    const index: number | null = this.toIndex();
    return index === null ? null : { start: index + 1, end: index + this.items().length };
  });
  protected readonly unchanged: Signal<boolean> = computed(() => {
    const target: { start: number; end: number } | null = this.target();
    return !!target && isConsecutive(this.items()) && this.items()[0]?.position === target.start;
  });
  protected readonly heading: Signal<string> = computed(() =>
    this.items().length === 1
      ? this.i18n.t('library.chapterDialog.move.headingOne', { title: this.items()[0].title })
      : this.i18n.t('library.chapterDialog.move.headingMany', { count: this.items().length }),
  );
  protected readonly canApply: Signal<boolean> = computed(
    () => this.items().length > 0 && this.target() !== null && !this.unchanged() && !this.lock() && !this.busy(),
  );

  protected reset(): void {
    this.mode.set('position');
    this.positionText.set('');
    this.beforeId.set(this.rest()[0]?.id ?? END_OF_LIST);
  }

  protected setMode(value: string): void {
    this.mode.set(value === 'before' ? 'before' : 'position');
  }

  protected setPosition(event: Event): void {
    this.positionText.set((event.target as HTMLInputElement).value.trim());
  }

  protected setBefore(event: Event): void {
    this.beforeId.set((event.target as HTMLSelectElement).value);
  }

  protected resultText(range: { start: number; end: number }): string {
    return range.start === range.end
      ? this.i18n.t('library.chapterDialog.move.resultOne', range)
      : this.i18n.t('library.chapterDialog.move.resultMany', range);
  }

  protected move(): void {
    const index: number | null = this.toIndex();
    const range: { start: number; end: number } | null = this.target();
    if (index === null || !range || !this.canApply()) {
      return;
    }
    const ids: string[] = this.items().map((chapter: LibraryChapter): string => chapter.id);
    const success: ToastOptions = {
      kind: 'success',
      title:
        ids.length === 1
          ? this.i18n.t('library.chapterDialog.move.doneOne', { title: this.items()[0].title, start: range.start })
          : this.i18n.t('library.chapterDialog.move.doneMany', { count: ids.length, ...range }),
    };
    this.apply('library.chapterDialog.move.failed', () => this.store.moveChapters(this.novelId(), ids, index), success);
  }
}
