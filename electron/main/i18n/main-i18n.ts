import en from '@dreamer/shared/i18n/en.json';
import vi from '@dreamer/shared/i18n/vi.json';
import { DEFAULT_LANGUAGE, Dictionaries, Language, translate, TranslateParams } from '@dreamer/shared/i18n/translate';
import { createLogger, Logger } from '../logging/logger';

const logger: Logger = createLogger('i18n');

const dictionaries: Dictionaries = { en, vi };
const reportedKeys: Set<string> = new Set();

let currentLanguage: Language = DEFAULT_LANGUAGE;

function reportMissing(key: string): void {
  if (reportedKeys.has(key)) {
    return;
  }
  reportedKeys.add(key);
  logger.warn(`Missing translation for "${key}" in ${currentLanguage}`);
}

export function setLanguage(language: Language): void {
  currentLanguage = language;
}

export function t(key: string, params?: TranslateParams): string {
  return translate(dictionaries, currentLanguage, key, params, reportMissing);
}
