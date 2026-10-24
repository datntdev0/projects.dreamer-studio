import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { inject } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { SettingsStore } from '@core/stores/settings-store';
import { DEFAULT_READING_SETTINGS, READING_LIMITS, sameReading } from '@dreamer/shared/models/settings';
import type { ReadingSettings } from '@dreamer/shared/models/settings';

@Component({
  selector: 'ds-reading-settings',
  imports: [ButtonDirective, IconComponent, TranslatePipe],
  host: { class: 'library-reading-settings', 'data-testid': 'reading-settings' },
  templateUrl: './reading-settings.component.html',
})
export class ReadingSettingsComponent {
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly limits: typeof READING_LIMITS = READING_LIMITS;
  protected readonly settings: Signal<ReadingSettings> = this.store.reading;
  protected readonly canReset: Signal<boolean> = computed(
    () => !sameReading(this.settings(), DEFAULT_READING_SETTINGS),
  );

  protected setFont(event: Event): void {
    const font: ReadingSettings['font'] = (event.target as HTMLSelectElement).value as ReadingSettings['font'];
    this.store.updateReading({ font });
  }

  protected setNumber(key: 'size' | 'leading' | 'width', event: Event): void {
    const value: number = Number((event.target as HTMLInputElement).value);
    this.store.updateReading({ [key]: value });
  }

  protected reset(): void {
    void this.store.reset('reading');
  }

  protected number(value: number): string {
    return new Intl.NumberFormat(this.i18n.language(), { maximumFractionDigits: 2 }).format(value);
  }
}
