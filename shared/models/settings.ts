import { DEFAULT_LANGUAGE, isLanguage, Language } from '../i18n/translate';
import { DEFAULT_LLM_SETTINGS, LlmSettings, sanitizeLlmSettings } from './llm';
import { isAbsolutePath, isPlainObject } from './validation';

export { isAbsolutePath, isPlainObject } from './validation';

export type Theme = 'light' | 'dark';

export type SettingsNotice = 'none' | 'invalidFields' | 'unreadable';

export type SettingsSection = 'general' | 'pipeline' | 'reading';

export type ReadingFont = 'serif' | 'sans';

export interface ReadingSettings {
  font: ReadingFont;
  size: number;
  leading: number;
  width: number;
}

export interface ReadingLimit {
  min: number;
  max: number;
  step: number;
}

export const READING_LIMITS: Record<'size' | 'leading' | 'width', ReadingLimit> = {
  size: { min: 14, max: 28, step: 1 },
  leading: { min: 1.4, max: 2.2, step: 0.05 },
  width: { min: 48, max: 96, step: 2 },
};

export const DEFAULT_READING_SETTINGS: ReadingSettings = { font: 'serif', size: 18, leading: 1.75, width: 72 };

export interface PipelineSettings {
  maxConcurrent: number;
}

export interface AppSettings {
  version: 1;
  language: Language;
  theme: Theme;
  appDataDir: string;
  pipelines: PipelineSettings;
  reading: ReadingSettings;
  llm: LlmSettings;
}

export interface SettingsPatch {
  language?: Language;
  theme?: Theme;
  pipelines?: PipelineSettings;
  reading?: ReadingSettings;
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
    reading: { ...DEFAULT_READING_SETTINGS },
    llm: { paths: { ...DEFAULT_LLM_SETTINGS.paths } },
  };
}

const THEMES: Theme[] = ['light', 'dark'];

const PATCH_KEYS: string[] = ['language', 'theme', 'pipelines', 'reading'];
const READING_KEYS: (keyof ReadingSettings)[] = ['font', 'size', 'leading', 'width'];

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

export function isReadingFont(value: unknown): value is ReadingFont {
  return value === 'serif' || value === 'sans';
}

export function sameReading(a: ReadingSettings, b: ReadingSettings): boolean {
  return READING_KEYS.every((key: keyof ReadingSettings): boolean => a[key] === b[key]);
}

function isMaxConcurrent(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MAX_CONCURRENT_MIN && (value as number) <= MAX_CONCURRENT_MAX;
}

function isReadingNumber(value: unknown, limit: ReadingLimit): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < limit.min || value > limit.max) return false;
  return value === snapReadingNumber(value, limit);
}

function snapReadingNumber(value: number, limit: ReadingLimit): number {
  const clamped: number = Math.min(limit.max, Math.max(limit.min, value));
  const snapped: number = limit.min + Math.round((clamped - limit.min) / limit.step) * limit.step;
  const decimals: number = String(limit.step).split('.')[1]?.length ?? 0;
  return Number(snapped.toFixed(decimals));
}

function sanitizeReadingNumber(name: 'size' | 'leading' | 'width', value: unknown, invalid: string[]): number {
  const limit: ReadingLimit = READING_LIMITS[name];
  if (isReadingNumber(value, limit)) return value;
  invalid.push(`reading.${name}`);
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_READING_SETTINGS[name];
  return snapReadingNumber(value, limit);
}

export function sanitizeSettings(raw: unknown, defaultDir: string): SanitizedSettings {
  const defaults: AppSettings = defaultSettings(defaultDir);
  if (!isPlainObject(raw)) return { settings: defaults, invalid: [] };
  const pipelines: unknown = isPlainObject(raw.pipelines) ? raw.pipelines.maxConcurrent : undefined;
  const invalid: string[] = [];
  let reading: ReadingSettings = { ...DEFAULT_READING_SETTINGS };
  if ('reading' in raw) {
    if (!isPlainObject(raw.reading)) {
      invalid.push('reading');
    } else {
      const value: Record<string, unknown> = raw.reading;
      const font: ReadingFont = isReadingFont(value.font) ? value.font : DEFAULT_READING_SETTINGS.font;
      if (font !== value.font) invalid.push('reading.font');
      reading = {
        font,
        size: sanitizeReadingNumber('size', value.size, invalid),
        leading: sanitizeReadingNumber('leading', value.leading, invalid),
        width: sanitizeReadingNumber('width', value.width, invalid),
      };
    }
  }
  const pick = <T>(name: string, value: unknown, isValid: (value: unknown) => boolean, fallback: T): T => {
    if (isValid(value)) return value as T;
    invalid.push(name);
    return fallback;
  };
  const settings: AppSettings = {
    version: 1,
    language: pick('language', raw.language, isLanguage, defaults.language),
    theme: pick('theme', raw.theme, isTheme, defaults.theme),
    appDataDir: pick('appDataDir', raw.appDataDir, isAbsolutePath, defaults.appDataDir),
    pipelines: {
      maxConcurrent: pick('pipelines.maxConcurrent', pipelines, isMaxConcurrent, defaults.pipelines.maxConcurrent),
    },
    reading,
    llm: 'llm' in raw ? sanitizeLlmSettings(raw.llm, invalid) : { paths: {} },
  };
  return { settings, invalid };
}

export function validateSettingsPatch(patch: unknown): string | null {
  if (!isPlainObject(patch)) return 'patch';
  const keys: string[] = Object.keys(patch);
  if (keys.length === 0 || keys.some((key: string): boolean => !PATCH_KEYS.includes(key))) return 'patch';
  const { pipelines } = patch;
  if (pipelines !== undefined) {
    if (!isPlainObject(pipelines) || Object.keys(pipelines).some((key: string): boolean => key !== 'maxConcurrent')) {
      return 'pipelines.maxConcurrent';
    }
  }
  if ('language' in patch && !isLanguage(patch.language)) return 'language';
  if ('theme' in patch && !isTheme(patch.theme)) return 'theme';
  if (isPlainObject(pipelines) && !isMaxConcurrent(pipelines.maxConcurrent)) return 'pipelines.maxConcurrent';
  if ('reading' in patch) {
    if (!isPlainObject(patch.reading)) return 'reading';
    const reading: Record<string, unknown> = patch.reading;
    const readingKeys: string[] = Object.keys(reading);
    if (
      readingKeys.length !== READING_KEYS.length ||
      readingKeys.some((key: string): boolean => !READING_KEYS.includes(key as keyof ReadingSettings))
    )
      return 'reading';
    if (!isReadingFont(reading.font)) return 'reading.font';
    for (const name of ['size', 'leading', 'width'] as const) {
      if (!isReadingNumber(reading[name], READING_LIMITS[name])) return `reading.${name}`;
    }
  }
  return null;
}
