import { Component, computed, inject, input, type Signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { LibraryChapter } from '../library.models';

@Component({
  selector: 'ds-chapter-dialog-list',
  imports: [TranslatePipe],
  templateUrl: './chapter-dialog-list.component.html',
})
export class ChapterDialogListComponent {
  readonly chapters = input.required<LibraryChapter[]>();
  readonly label = input.required<string>();
  readonly limit = input<number>(Number.POSITIVE_INFINITY);
  readonly showChars = input<boolean>(false);

  private readonly i18n: I18nService = inject(I18nService);
  protected readonly shown: Signal<LibraryChapter[]> = computed(() => this.chapters().slice(0, this.limit()));
  protected readonly hiddenCount: Signal<number> = computed(() => this.chapters().length - this.shown().length);

  protected format(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }
}
