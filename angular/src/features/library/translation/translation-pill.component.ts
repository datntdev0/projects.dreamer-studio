import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import { ProgressComponent } from '@components/status/progress.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { TranslationStore } from '../translation.store';

@Component({
  selector: 'ds-translation-pill',
  imports: [ButtonDirective, DotComponent, IconComponent, ProgressComponent, RouterLink, TranslatePipe],
  templateUrl: './translation-pill.component.html',
  host: {
    class: 'ds-world-run-pill-wrap',
    '(document:click)': 'closeOutside($event)',
    '(keydown.escape)': 'menuOpen.set(false)',
  },
})
export class TranslationPillComponent {
  protected readonly store = inject(TranslationStore);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly menuOpen = signal(false);
  protected readonly percent = computed(() => {
    const run = this.store.run();
    return run?.total ? (run.done / run.total) * 100 : null;
  });

  protected closeOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  protected async cancel(): Promise<void> {
    this.menuOpen.set(false);
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('library.translation.page.pill.cancelTitle'),
      message: this.i18n.t('library.translation.page.pill.cancelMessage'),
      confirmLabel: this.i18n.t('library.translation.page.pill.cancel'),
      cancelLabel: this.i18n.t('library.translation.page.pill.keepRunning'),
      danger: true,
    });
    if (confirmed) await this.store.cancel();
  }
}
