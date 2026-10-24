import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { input } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { NovelLock } from '@dreamer/shared/models/novel';
import type { ChapterChangeError } from '../library.models';
import { DIALOG_ERROR_KEYS } from './chapter-change-dialog';

@Component({
  selector: 'ds-chapter-dialog-alerts',
  imports: [BannerComponent, TranslatePipe],
  templateUrl: './chapter-dialog-alerts.component.html',
})
export class ChapterDialogAlertsComponent {
  readonly lock = input<NovelLock | null>(null);
  readonly error = input<ChapterChangeError | null>(null);
  readonly failedKey = input.required<string>();
  readonly lockLabel = input<string>('');

  protected readonly shownError: Signal<ChapterChangeError | null> = computed(() =>
    this.error() === 'locked' && this.lock() ? null : this.error(),
  );

  protected errorKey(error: ChapterChangeError): string {
    return DIALOG_ERROR_KEYS[error];
  }
}
