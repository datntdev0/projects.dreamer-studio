import { computed } from '@angular/core';
import { Directive } from '@angular/core';
import { effect } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import type { ChapterChange } from '@dreamer/shared/models/novel';
import type { NovelLock } from '@dreamer/shared/models/novel';
import { ToastService } from '@components/toast/toast.service';
import type { ToastOptions } from '@components/toast/toast.service';
import { I18nService } from '@core/i18n/i18n.service';
import type { ChapterChangeError } from '../library.models';
import { NovelStore } from '../novel.store';

export const DIALOG_ERROR_KEYS: Record<ChapterChangeError, string> = {
  locked: 'library.chapterDialog.error.locked',
  stale: 'library.chapterDialog.error.stale',
  missing: 'library.chapterDialog.error.missing',
  failed: 'library.chapterDialog.error.failed',
};

@Directive()
export abstract class ChapterChangeDialog {
  readonly open = input<boolean>(false);
  readonly novelId = input.required<string>();
  readonly done = output<void>();
  readonly closed = output<void>();
  readonly invalidated = output<void>();

  protected readonly store: NovelStore = inject(NovelStore);
  protected readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  protected readonly busy = signal<boolean>(false);
  protected readonly error = signal<ChapterChangeError | null>(null);
  protected readonly lock: Signal<NovelLock | null> = computed(() => this.store.novel()?.lock ?? null);
  protected readonly lockLabel: Signal<string> = computed(() => this.lock()?.label ?? this.store.novel()?.title ?? '');

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.busy.set(false);
          this.error.set(null);
          this.reset();
        });
      }
    });
  }

  protected abstract reset(): void;

  protected format(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected async apply(failedKey: string, change: ChapterChange, success: ToastOptions): Promise<void> {
    if (this.busy() || this.store.changing()) return;
    this.error.set(null);
    this.busy.set(true);
    const error: ChapterChangeError | null = await this.store.change(change);
    this.busy.set(false);
    if (error) {
      this.error.set(error);
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t(failedKey),
        message: `${this.i18n.t(DIALOG_ERROR_KEYS[error])} ${this.i18n.t('library.chapterDialog.unchanged')}`,
      });
      if (error === 'stale' || error === 'missing') this.invalidated.emit();
      return;
    }
    this.toast.show(success);
    this.done.emit();
  }
}
