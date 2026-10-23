import { Component, computed, input, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import type { ToastOptions } from '@components/toast/toast.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { byPosition, LIST_LIMIT } from '../library-format';
import type { LibraryChapter } from '../library.models';
import { ChapterChangeDialog } from './chapter-change-dialog';
import { ChapterDialogAlertsComponent } from './chapter-dialog-alerts.component';
import { ChapterDialogListComponent } from './chapter-dialog-list.component';

@Component({
  selector: 'ds-chapter-delete-dialog',
  imports: [
    ButtonDirective,
    ChapterDialogAlertsComponent,
    ChapterDialogListComponent,
    DialogComponent,
    IconComponent,
    TranslatePipe,
  ],
  templateUrl: './chapter-delete-dialog.component.html',
})
export class ChapterDeleteDialogComponent extends ChapterChangeDialog {
  readonly chapters = input.required<LibraryChapter[]>();

  protected readonly listLimit: number = LIST_LIMIT;
  protected readonly items: Signal<LibraryChapter[]> = computed(() => byPosition(this.chapters()));
  protected readonly single: Signal<LibraryChapter | null> = computed(() =>
    this.items().length === 1 ? this.items()[0] : null,
  );
  protected readonly deletesAll: Signal<boolean> = computed(
    () => this.items().length > 0 && this.items().length === this.store.chapters(this.novelId()).length,
  );
  protected readonly heading: Signal<string> = computed(() => {
    const single: LibraryChapter | null = this.single();
    return single
      ? this.i18n.t('library.chapterDialog.delete.headingOne', { title: single.title })
      : this.i18n.t('library.chapterDialog.delete.headingMany', { count: this.items().length });
  });
  protected readonly confirmLabel: Signal<string> = computed(() =>
    this.single()
      ? this.i18n.t('library.chapterDialog.delete.confirmOne')
      : this.i18n.t('library.chapterDialog.delete.confirmMany', { count: this.items().length }),
  );
  protected readonly canApply: Signal<boolean> = computed(
    () => this.items().length > 0 && !this.lock() && !this.busy(),
  );

  protected reset(): void {}

  protected remove(): void {
    const single: LibraryChapter | null = this.single();
    const ids: string[] = this.items().map((chapter: LibraryChapter): string => chapter.id);
    const success: ToastOptions = {
      kind: 'success',
      title: single
        ? this.i18n.t('library.chapterDialog.delete.doneOne', { title: single.title })
        : this.i18n.t('library.chapterDialog.delete.doneMany', { count: ids.length }),
    };
    this.apply('library.chapterDialog.delete.failed', () => this.store.deleteChapters(this.novelId(), ids), success);
  }
}
