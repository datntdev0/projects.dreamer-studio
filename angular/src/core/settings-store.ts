import { computed, inject, Injectable, signal, Signal } from '@angular/core';
import { ToastService } from '@components/toast/toast.service';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { validateSettingsPatch } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from './desktop-api';
import { I18nService } from './i18n/i18n.service';
import { ThemeService } from './theme/theme.service';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly theme: ThemeService = inject(ThemeService);
  private unsubscribe: (() => void) | null = null;

  readonly state = signal<SettingsState | null>(null);
  readonly settings: Signal<AppSettings | null> = computed(() => this.state()?.settings ?? null);

  async load(): Promise<void> {
    try {
      const state: SettingsState | null = await this.desktopApi.settings();
      this.state.set(state);
      if (state) this.apply(state.settings);
      this.unsubscribe ??= this.desktopApi.onSettingsChanged((settings: AppSettings) => this.accept(settings));
      if (state && state.notice !== 'none') this.notifyReset();
    } catch (error) {
      this.desktopApi.writeLog({ level: 'error', module: 'settings', message: errorMessage(error) });
    }
  }

  async update(patch: SettingsPatch): Promise<boolean> {
    const invalidField: string | null = validateSettingsPatch(patch);
    if (invalidField) {
      this.notifyError(ErrorCode.SettingsInvalid, invalidField);
      return false;
    }
    return this.run(() => this.desktopApi.updateSettings(patch));
  }

  async reset(section: SettingsSection): Promise<boolean> {
    return this.run(() => this.desktopApi.resetSettings(section));
  }

  private async run(request: () => Promise<AppSettings | null>): Promise<boolean> {
    try {
      const settings: AppSettings | null = await request();
      if (!settings) return false;
      this.accept(settings);
      return true;
    } catch (error) {
      if (!isAppError(error)) throw error;
      this.notifyError(error.code, error.details);
      return false;
    }
  }

  private accept(settings: AppSettings): void {
    const current: SettingsState | null = this.state();
    if (current) this.state.set({ ...current, settings });
    this.apply(settings);
  }

  private apply(settings: AppSettings): void {
    this.theme.setTheme(settings.theme);
    this.i18n.setLanguage(settings.language);
  }

  private notifyError(code: ErrorCode, details?: string): void {
    const invalid: boolean = code === ErrorCode.SettingsInvalid && !!details;
    this.toast.show({
      kind: 'danger',
      title: this.i18n.t(`errors.${code}.title`),
      message: this.i18n.t(invalid ? `settings.invalid.${details}` : `errors.${code}.message`),
    });
  }

  private notifyReset(): void {
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('settings.page.resetNotice.title'),
      message: this.i18n.t('settings.page.resetNotice.message'),
    });
  }
}
