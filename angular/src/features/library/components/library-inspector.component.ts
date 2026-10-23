import { Component, effect, inject, input, output, signal, type WritableSignal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import { formatCompact, formatCount, formatDateTime } from '../../../core/format';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LibraryStore } from '../../../core/stores/library-store';
import { coverPalette, coverUrl, languageName } from '../library-format';
import { LibraryCoverComponent } from './library-cover.component';

@Component({
  selector: 'ds-library-inspector',
  imports: [ButtonDirective, IconComponent, LibraryCoverComponent, TooltipDirective, TranslatePipe],
  host: { 'data-testid': 'library-inspector' },
  templateUrl: './library-inspector.component.html',
})
export class LibraryInspectorComponent {
  readonly novel = input.required<NovelSummary>();
  readonly open = output<string>();
  protected readonly coverUrl = coverUrl;
  protected readonly coverPalette = coverPalette;
  protected readonly detail: WritableSignal<NovelDetail | null> = signal(null);
  private readonly store: LibraryStore = inject(LibraryStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);

  constructor() {
    effect((onCleanup: (cleanup: () => void) => void) => {
      const { id } = this.novel();
      let stale = false;
      onCleanup(() => (stale = true));
      void this.store.detail(id).then((detail: NovelDetail | null) => {
        if (!stale) this.detail.set(detail);
      });
    });
  }

  protected synopsis(): string {
    const detail: NovelDetail | null = this.detail();
    return detail?.id === this.novel().id ? detail.description : '';
  }

  protected count(value: number): string {
    return formatCount(value, this.i18n.language());
  }

  protected compact(value: number): string {
    return formatCompact(value, this.i18n.language());
  }

  protected language(code: string): string {
    return languageName(code, this.i18n.language());
  }

  protected date(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }

  protected publicationKey(): string {
    return `library.browse.publication.${this.novel().publication}`;
  }

  protected async openFolder(): Promise<void> {
    try {
      await this.store.openFolder(this.novel().id);
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('library.inspector.openFolderFailed') });
    }
  }
}
