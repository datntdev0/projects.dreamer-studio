import { DOCUMENT } from '@angular/common';
import { InjectionToken, Injectable, effect, inject, signal } from '@angular/core';
import en from '@dreamer/shared/i18n/en.json';
import vi from '@dreamer/shared/i18n/vi.json';
import { translate, type Dictionaries, type Language, type TranslateParams } from '@dreamer/shared/i18n/translate';
import { DesktopApi } from '../desktop-api';

export type { Language };

export const I18N_DICTIONARIES = new InjectionToken<Dictionaries>('I18N_DICTIONARIES', {
  factory: (): Dictionaries => ({ en, vi }),
});

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly desktopApi = inject(DesktopApi);
  private readonly dictionaries: Dictionaries = inject(I18N_DICTIONARIES);
  private readonly warnedKeys = new Set<string>();
  readonly language = signal<Language>('en');

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.language();
    });
  }

  t(key: string, params?: TranslateParams): string {
    return translate(this.dictionaries, this.language(), key, params, (missing: string) => this.warnMissing(missing));
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.desktopApi.setLanguage(language);
  }

  toggle(): void {
    this.setLanguage(this.language() === 'en' ? 'vi' : 'en');
  }

  private warnMissing(key: string): void {
    if (this.warnedKeys.has(key)) return;
    this.warnedKeys.add(key);
    this.desktopApi.writeLog({
      level: 'warn',
      module: 'i18n',
      message: `Missing translation: ${key} (${this.language()})`,
    });
  }
}
