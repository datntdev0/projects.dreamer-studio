import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { input } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ToastOptions } from '@components/toast/toast.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { byPosition } from '../library-format';
import { chapterRef } from '../library-format';
import { isConsecutive } from '../library-format';
import { totalChars } from '../library-format';
import type { LibraryChapter } from '../library.models';
import { ChapterChangeDialog } from './chapter-change-dialog';
import { ChapterDialogAlertsComponent } from './chapter-dialog-alerts.component';
import { ChapterDialogListComponent } from './chapter-dialog-list.component';

@Component({
  selector: 'ds-chapter-merge-dialog',
  imports: [
    ButtonDirective,
    ChapterDialogAlertsComponent,
    ChapterDialogListComponent,
    DialogComponent,
    IconComponent,
    TranslatePipe,
  ],
  templateUrl: './chapter-merge-dialog.component.html',
})
export class ChapterMergeDialogComponent extends ChapterChangeDialog {
  readonly chapters = input.required<LibraryChapter[]>();

  protected readonly items: Signal<LibraryChapter[]> = computed(() => byPosition(this.chapters()));
  protected readonly first: Signal<LibraryChapter | null> = computed(() => this.items()[0] ?? null);
  protected readonly chars: Signal<number> = computed(() => totalChars(this.items()));
  protected readonly mergeable: Signal<boolean> = computed(
    () => this.items().length >= 2 && isConsecutive(this.items()),
  );
  protected readonly canApply: Signal<boolean> = computed(() => this.mergeable() && !this.lock() && !this.busy());

  protected reset(): void {}

  protected merge(): void {
    const ids: string[] = this.items().map((chapter: LibraryChapter): string => chapter.id);
    const success: ToastOptions = {
      kind: 'success',
      title: this.i18n.t('library.chapterDialog.merge.done', { count: ids.length, title: this.first()?.title ?? '' }),
    };
    void this.apply(
      'library.chapterDialog.merge.failed',
      { kind: 'merge', chapters: this.items().map(chapterRef) },
      success,
    );
  }
}
