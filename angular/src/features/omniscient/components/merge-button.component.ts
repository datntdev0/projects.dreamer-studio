import { Component, computed, inject, input } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import type { ButtonVariant } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { OmniscientStore } from '../omniscient.store';

@Component({
  selector: 'ds-merge-button',
  imports: [ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './merge-button.component.html',
  host: { class: 'ds-world-merge' },
})
export class MergeButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly testId = input('world-merge');

  protected readonly store = inject(OmniscientStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly pending = computed(() => this.store.merge()?.pending ?? 0);
  protected readonly reason = computed(() => {
    const block = this.store.mergeBlock();
    return block ? this.i18n.t(block.key, { count: block.count }) : '';
  });

  protected async merge(): Promise<void> {
    const chapters = this.store.analysedChapters().length;
    const pending = this.pending();
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.merge.confirmTitle', { count: chapters }),
      message: this.i18n.t('analysis.merge.confirmMessage', { count: pending }),
      confirmLabel: this.i18n.t('analysis.merge.action'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed || !(await this.store.mergeWorld())) return;
    this.toast.show({
      kind: 'success',
      title: this.i18n.t('analysis.merge.doneTitle'),
      message: this.i18n.t('analysis.merge.doneMessage', { count: chapters }),
    });
  }
}
