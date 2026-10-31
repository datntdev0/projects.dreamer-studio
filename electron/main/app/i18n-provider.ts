import en from '@dreamer/shared/i18n/en.json';
import vi from '@dreamer/shared/i18n/vi.json';
import { DEFAULT_LANGUAGE, Dictionaries, Language, translate, TranslateParams } from '@dreamer/shared/i18n/translate';
import { createLogger, Logger } from '../logging/logger';

const logger: Logger = createLogger('i18n');

const dictionaries: Dictionaries = { en, vi };

export class I18nProvider {
  private readonly reportedKeys: Set<string> = new Set();

  private currentLanguage: Language = DEFAULT_LANGUAGE;

  private reportMissing(key: string): void {
    if (this.reportedKeys.has(key)) {
      return;
    }
    this.reportedKeys.add(key);
    logger.warn(`Missing translation for "${key}" in ${this.currentLanguage}`);
  }

  setLanguage(language: Language): void {
    this.currentLanguage = language;
  }

  t(key: string, params?: TranslateParams): string {
    return translate(dictionaries, this.currentLanguage, key, params, (missing: string): void =>
      this.reportMissing(missing),
    );
  }
}
