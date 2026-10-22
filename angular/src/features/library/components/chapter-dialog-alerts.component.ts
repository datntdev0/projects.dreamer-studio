import { Component, computed, input, type Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { ChapterChangeError, NovelLock } from '../library.models';

@Component({
  selector: 'ds-chapter-dialog-alerts',
  imports: [BannerComponent, TranslatePipe],
  templateUrl: './chapter-dialog-alerts.component.html',
})
export class ChapterDialogAlertsComponent {
  readonly lock = input<NovelLock | null>(null);
  readonly error = input<ChapterChangeError | null>(null);
  readonly failedKey = input.required<string>();

  protected readonly shownError: Signal<ChapterChangeError | null> = computed(() =>
    this.error() === 'locked' && this.lock() ? null : this.error(),
  );

  protected errorKey(error: ChapterChangeError): string {
    return `library.chapterDialog.error.${error}`;
  }
}
