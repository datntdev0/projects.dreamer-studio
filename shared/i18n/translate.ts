export type Language = 'en' | 'vi';

export type Dictionary = Record<string, string>;

export type Dictionaries = Record<Language, Dictionary>;

export type TranslateParams = Record<string, string | number>;

export const DEFAULT_LANGUAGE: Language = 'en';

function fillParams(text: string, params?: TranslateParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match: string, name: string) => (name in params ? String(params[name]) : match));
}

export function translate(
  dictionaries: Dictionaries,
  language: Language,
  key: string,
  params?: TranslateParams,
  onMissing?: (key: string) => void,
): string {
  const text: string | undefined = dictionaries[language][key];
  if (text !== undefined) return fillParams(text, params);
  onMissing?.(key);
  return fillParams(dictionaries[DEFAULT_LANGUAGE][key] ?? key, params);
}
