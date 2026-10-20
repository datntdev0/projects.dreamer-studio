import { DEFAULT_LANGUAGE, isLanguage, Language } from '../i18n/translate';

export type Theme = 'light' | 'dark';

export type SettingsNotice = 'none' | 'invalidFields' | 'unreadable';

export interface PipelineSettings {
  maxConcurrent: number;
}

export interface AppSettings {
  version: 1;
  language: Language;
  theme: Theme;
  appDataDir: string;
  pipelines: PipelineSettings;
}

export interface SettingsState {
  settings: AppSettings;
  defaultAppDataDir: string;
  notice: SettingsNotice;
}

export interface SanitizedSettings {
  settings: AppSettings;
  invalid: string[];
}

export const MAX_CONCURRENT_MIN: number = 1;

export const MAX_CONCURRENT_MAX: number = 5;

export function defaultSettings(appDataDir: string): AppSettings {
  return {
    version: 1,
    language: DEFAULT_LANGUAGE,
    theme: 'light',
    appDataDir,
    pipelines: { maxConcurrent: MAX_CONCURRENT_MIN },
  };
}

const THEMES: Theme[] = ['light', 'dark'];

const WINDOWS_ABSOLUTE_PATH: RegExp = /^([a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && WINDOWS_ABSOLUTE_PATH.test(value);
}

function isMaxConcurrent(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MAX_CONCURRENT_MIN && (value as number) <= MAX_CONCURRENT_MAX;
}

export function sanitizeSettings(raw: unknown, defaultDir: string): SanitizedSettings {
  const defaults: AppSettings = defaultSettings(defaultDir);
  if (!isPlainObject(raw)) return { settings: defaults, invalid: [] };
  const pipelines: unknown = isPlainObject(raw.pipelines) ? raw.pipelines.maxConcurrent : undefined;
  const invalid: string[] = [];
  const pick = <T>(name: string, value: unknown, isValid: (value: unknown) => boolean, fallback: T): T => {
    if (isValid(value)) return value as T;
    invalid.push(name);
    return fallback;
  };
  const settings: AppSettings = {
    version: 1,
    language: pick('language', raw.language, isLanguage, defaults.language),
    theme: pick('theme', raw.theme, (v) => THEMES.includes(v as Theme), defaults.theme),
    appDataDir: pick('appDataDir', raw.appDataDir, isAbsolutePath, defaults.appDataDir),
    pipelines: {
      maxConcurrent: pick('pipelines.maxConcurrent', pipelines, isMaxConcurrent, defaults.pipelines.maxConcurrent),
    },
  };
  return { settings, invalid };
}
