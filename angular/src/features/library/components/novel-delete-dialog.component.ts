import { booleanAttribute, Component, computed, inject, input, output, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { chapterLabel } from '../library-format';
import type { DeleteMode, DeleteNovelsResult, LibraryNovel } from '../library.models';
import { LibraryStore } from '../library.store';
import { NovelDialogSummaryComponent } from './novel-dialog-summary.component';

const DELETE_LIST_LIMIT = 5;

@Component({
  selector: 'ds-novel-delete-dialog',
  imports: [
    ButtonDirective,
    DialogComponent,
    IconComponent,
    NovelDialogSummaryComponent,
    PillComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './novel-delete-dialog.component.html',
})
export class NovelDeleteDialogComponent {
  readonly open = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly novels = input.required<LibraryNovel[]>();
  readonly deleted = output<string[]>();
  readonly closed = output<void>();

  private readonly store: LibraryStore = inject(LibraryStore);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly deletable: Signal<LibraryNovel[]> = computed(() => this.novels().filter((novel) => !novel.lock));
  protected readonly busy: Signal<LibraryNovel[]> = computed(() => this.novels().filter((novel) => !!novel.lock));
  protected readonly shown: Signal<LibraryNovel[]> = computed(() => this.deletable().slice(0, DELETE_LIST_LIMIT));
  protected readonly hiddenCount: Signal<number> = computed(() => this.deletable().length - this.shown().length);
  protected readonly mode: Signal<DeleteMode> = computed(() => {
    if (this.deletable().length === 0) return 'blocked';
    return this.novels().length === 1 ? 'one' : 'many';
  });
  protected readonly heading: Signal<string> = computed(() => {
    const count: number = this.deletable().length;
    switch (this.mode()) {
      case 'one':
        return this.i18n.t('library.novelDialog.delete.heading.one', { title: this.deletable()[0].title });
      case 'many':
        return this.busy().length > 0
          ? this.i18n.t('library.novelDialog.delete.heading.partial', { count, total: this.novels().length })
          : this.i18n.t('library.novelDialog.delete.heading.many', { count });
      default:
        return this.i18n.t('library.novelDialog.delete.heading.blocked');
    }
  });
  protected readonly blockedMessage: Signal<string> = computed(() => {
    const busy: LibraryNovel[] = this.busy();
    return busy.length === 1
      ? this.i18n.t('library.novelDialog.delete.blocked.one', { title: busy[0].title })
      : this.i18n.t('library.novelDialog.delete.blocked.many', { count: busy.length });
  });
  protected readonly confirmLabel: Signal<string> = computed(() => {
    const count: number = this.deletable().length;
    return count === 1
      ? this.i18n.t('library.novelDialog.delete.confirm.one')
      : this.i18n.t('library.novelDialog.delete.confirm.many', { count });
  });

  protected chapterLabel(novel: LibraryNovel): string {
    return chapterLabel(this.i18n, novel.chapterCount);
  }

  protected lockLabel(novel: LibraryNovel): string {
    return this.i18n.t(`library.novelDialog.lock.${novel.lock?.kind ?? 'export'}`);
  }

  protected dismiss(): void {
    if (this.open()) this.closed.emit();
  }

  protected confirm(): void {
    const targets: LibraryNovel[] = this.deletable();
    const result: DeleteNovelsResult = this.store.deleteNovels(targets.map((novel) => novel.id));
    this.notify(targets, result);
    if (result.deleted.length > 0) this.deleted.emit(result.deleted);
    this.closed.emit();
  }

  private notify(targets: LibraryNovel[], result: DeleteNovelsResult): void {
    const count: number = result.deleted.length;
    if (count === 0) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('library.novelDialog.delete.failed'),
        message: this.i18n.t('library.novelDialog.delete.failed.message'),
      });
      return;
    }
    const skipped: number = this.busy().length + result.skipped.length;
    const title: string =
      count === 1
        ? this.i18n.t('library.novelDialog.delete.done.one', {
            title: targets.find((novel) => novel.id === result.deleted[0])?.title ?? '',
          })
        : this.i18n.t('library.novelDialog.delete.done.many', { count });
    const message: string | undefined =
      skipped > 0 ? this.i18n.t('library.novelDialog.delete.done.skipped', { count: skipped }) : undefined;
    this.toast.show({ kind: 'success', title, message });
  }
}
