import { Component, computed, inject } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { SegmentedComponent, type SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService, type Language } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { SettingsStore } from '@core/stores/settings-store';
import type { RailMode } from '@dreamer/shared/models/settings';
import { ThemeService, type Theme } from '@core/theme/theme.service';
import { SettingsReset } from '../settings-reset';

@Component({
  selector: 'ds-settings-general',
  imports: [ButtonDirective, IconComponent, SegmentedComponent, TranslatePipe],
  templateUrl: './general-section.component.html',
})
export class GeneralSectionComponent {
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly resetHelper: SettingsReset = inject(SettingsReset);

  protected readonly i18n: I18nService = inject(I18nService);
  protected readonly theme: ThemeService = inject(ThemeService);
  protected readonly languageOptions = computed<SegmentedOption[]>(() => [
    { value: 'en', label: this.i18n.t('settings.general.languageEn') },
    { value: 'vi', label: this.i18n.t('settings.general.languageVi') },
  ]);
  protected readonly themeOptions = computed<SegmentedOption[]>(() => [
    { value: 'light', label: this.i18n.t('settings.general.themeLight'), icon: 'sun' },
    { value: 'dark', label: this.i18n.t('settings.general.themeDark'), icon: 'moon' },
  ]);
  protected readonly railOptions = computed<SegmentedOption[]>(() => [
    { value: 'full', label: this.i18n.t('settings.general.railFull'), icon: 'panel-left' },
    { value: 'minimal', label: this.i18n.t('settings.general.railMinimal'), icon: 'columns' },
  ]);
  protected readonly rail = computed<RailMode>(() => this.store.settings()?.rail ?? 'full');

  protected setLanguage(language: string): void {
    void this.store.update({ language: language as Language });
  }

  protected setTheme(theme: string): void {
    void this.store.update({ theme: theme as Theme });
  }

  protected setRail(rail: string): void {
    void this.store.update({ rail: rail as RailMode });
  }

  protected reset(): void {
    void this.resetHelper.run('general');
  }
}
