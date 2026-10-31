import { Language, TranslateParams } from '@dreamer/shared/i18n/translate';
import { I18nProvider } from './i18n-provider';

export const i18nProvider: I18nProvider = new I18nProvider();

export function setLanguage(language: Language): void {
  i18nProvider.setLanguage(language);
}

export function t(key: string, params?: TranslateParams): string {
  return i18nProvider.t(key, params);
}
