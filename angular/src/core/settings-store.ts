import { inject, Injectable, signal } from '@angular/core';
import { ToastService } from '@components/toast/toast.service';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from './desktop-api';
import { I18nService } from './i18n/i18n.service';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);

  readonly state = signal<SettingsState | null>(null);

  async load(): Promise<void> {
    try {
      const state: SettingsState | null = await this.desktopApi.settings();
      this.state.set(state);
      if (state && state.notice !== 'none') this.notifyReset();
    } catch (error) {
      this.desktopApi.writeLog({ level: 'error', module: 'settings', message: errorMessage(error) });
    }
  }

  private notifyReset(): void {
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('settings.page.resetNotice.title'),
      message: this.i18n.t('settings.page.resetNotice.message'),
    });
  }
}
