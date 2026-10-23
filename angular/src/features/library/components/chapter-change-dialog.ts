import { computed, Directive, effect, inject, input, output, signal, untracked, type Signal } from '@angular/core';
import { ToastService } from '@components/toast/toast.service';
import type { ToastOptions } from '@components/toast/toast.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CHANGE_MS } from '../library-format';
import type { ChapterChangeError, NovelLock } from '../library.models';
import { LibraryMockStore } from '../library.store';

@Directive()
export abstract class ChapterChangeDialog {
  readonly open = input<boolean>(false);
  readonly novelId = input.required<string>();
  readonly done = output<void>();
  readonly closed = output<void>();

  protected readonly store: LibraryMockStore = inject(LibraryMockStore);
  protected readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  protected readonly busy = signal<boolean>(false);
  protected readonly error = signal<ChapterChangeError | null>(null);
  protected readonly lock: Signal<NovelLock | null> = computed(() => this.store.novel(this.novelId())?.lock ?? null);

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

  protected apply(failedKey: string, change: () => ChapterChangeError | null, success: ToastOptions): void {
    this.error.set(null);
    this.busy.set(true);
    setTimeout(() => {
      this.busy.set(false);
      const error: ChapterChangeError | null = change();
      if (error) {
        this.error.set(error);
        this.toast.show({
          kind: 'danger',
          title: this.i18n.t(failedKey),
          message: this.i18n.t(`library.chapterDialog.error.${error}`),
        });
        return;
      }
      this.toast.show(success);
      this.done.emit();
    }, CHANGE_MS);
  }
}
