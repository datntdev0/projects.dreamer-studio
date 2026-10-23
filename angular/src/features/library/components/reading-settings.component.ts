import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { inject } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DEFAULT_READING_SETTINGS } from '../library-format';
import type { ReadingSettings } from '../library.models';
import { LibraryMockStore } from '../library.store';

@Component({
  selector: 'ds-reading-settings',
  imports: [ButtonDirective, IconComponent, TranslatePipe],
  host: { class: 'library-reading-settings', 'data-testid': 'reading-settings' },
  templateUrl: './reading-settings.component.html',
})
export class ReadingSettingsComponent {
  private readonly store: LibraryMockStore = inject(LibraryMockStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly settings: Signal<ReadingSettings> = this.store.readingSettings;
  protected readonly canReset: Signal<boolean> = computed(
    () => JSON.stringify(this.settings()) !== JSON.stringify(DEFAULT_READING_SETTINGS),
  );

  protected setFont(event: Event): void {
    const font: ReadingSettings['font'] = (event.target as HTMLSelectElement).value as ReadingSettings['font'];
    this.store.readingSettings.update((settings: ReadingSettings): ReadingSettings => ({ ...settings, font }));
  }

  protected setNumber(key: 'size' | 'leading' | 'width', event: Event): void {
    const value: number = Number((event.target as HTMLInputElement).value);
    this.store.readingSettings.update((settings: ReadingSettings): ReadingSettings => ({ ...settings, [key]: value }));
  }

  protected reset(): void {
    this.store.readingSettings.set({ ...DEFAULT_READING_SETTINGS });
  }

  protected number(value: number): string {
    return new Intl.NumberFormat(this.i18n.language(), { maximumFractionDigits: 2 }).format(value);
  }
}
