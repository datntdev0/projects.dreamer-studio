import { inject, Injectable } from '@angular/core';
import { ConfirmService } from '@components/dialog/confirm.service';
import { ToastService } from '@components/toast/toast.service';
import type { SettingsSection } from '@dreamer/shared/models/settings';
import { I18nService } from '../../core/i18n/i18n.service';
import { SettingsStore } from '../../core/settings-store';

@Injectable({ providedIn: 'root' })
export class SettingsReset {
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly store: SettingsStore = inject(SettingsStore);

  async run(section: SettingsSection): Promise<void> {
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t(`settings.${section}.resetTitle`),
      message: this.i18n.t(`settings.${section}.resetMessage`),
      confirmLabel: this.i18n.t('settings.page.resetConfirm'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed) return;
    if (await this.store.reset(section)) {
      this.toast.show({ kind: 'success', title: this.i18n.t(`settings.${section}.resetDone`) });
    }
  }
}
