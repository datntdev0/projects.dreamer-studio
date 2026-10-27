import { DEFAULT_LANGUAGE, isLanguage, Language } from '../i18n/translate';
import { defaultLlmSettings, LlmSettings, LlmSettingsPatch, sanitizeLlmSettings, validateLlmPatch } from './llm';
import { isAbsolutePath, isPlainObject } from './validation';

export { isAbsolutePath, isPlainObject } from './validation';

export type Theme = 'light' | 'dark';

export type RailMode = 'full' | 'minimal';

export type SettingsNotice = 'none' | 'invalidFields' | 'unreadable';

export type SettingsSection = 'general' | 'pipeline' | 'reading' | 'llm';

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
  maxChapters: number;
}

export interface PipelineLimit {
  min: number;
  max: number;
}

export const PIPELINE_LIMITS: Record<keyof PipelineSettings, PipelineLimit> = {
  maxConcurrent: { min: 1, max: 5 },
  maxChapters: { min: 1, max: 10 },
};

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = { maxConcurrent: 1, maxChapters: 1 };

export interface AppSettings {
  version: 1;
  language: Language;
  theme: Theme;
  rail: RailMode;
  appDataDir: string;
  pipelines: PipelineSettings;
  reading: ReadingSettings;
  llm: LlmSettings;
}

export interface SettingsPatch {
  language?: Language;
  theme?: Theme;
  rail?: RailMode;
  pipelines?: Partial<PipelineSettings>;
  reading?: ReadingSettings;
  llm?: LlmSettingsPatch;
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

export function defaultSettings(appDataDir: string): AppSettings {
  return {
    version: 1,
    language: DEFAULT_LANGUAGE,
    theme: 'light',
    rail: 'full',
    appDataDir,
    pipelines: { ...DEFAULT_PIPELINE_SETTINGS },
    reading: { ...DEFAULT_READING_SETTINGS },
    llm: defaultLlmSettings(),
  };
}

const THEMES: Theme[] = ['light', 'dark'];
const RAIL_MODES: RailMode[] = ['full', 'minimal'];

const PATCH_KEYS: string[] = ['language', 'theme', 'rail', 'pipelines', 'reading', 'llm'];
const PIPELINE_KEYS: (keyof PipelineSettings)[] = ['maxConcurrent', 'maxChapters'];
const READING_KEYS: (keyof ReadingSettings)[] = ['font', 'size', 'leading', 'width'];

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

function isRailMode(value: unknown): value is RailMode {
  return RAIL_MODES.includes(value as RailMode);
}

export function isReadingFont(value: unknown): value is ReadingFont {
  return value === 'serif' || value === 'sans';
}

export function sameReading(a: ReadingSettings, b: ReadingSettings): boolean {
  return READING_KEYS.every((key: keyof ReadingSettings): boolean => a[key] === b[key]);
}

function isPipelineNumber(name: keyof PipelineSettings, value: unknown): value is number {
  const limit: PipelineLimit = PIPELINE_LIMITS[name];
  return Number.isInteger(value) && (value as number) >= limit.min && (value as number) <= limit.max;
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
  const pipelines: Record<string, unknown> = isPlainObject(raw.pipelines) ? raw.pipelines : {};
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
  const pickPipeline = (name: keyof PipelineSettings): number =>
    pick(
      `pipelines.${name}`,
      pipelines[name],
      (value: unknown): boolean => isPipelineNumber(name, value),
      defaults.pipelines[name],
    );
  const settings: AppSettings = {
    version: 1,
    language: pick('language', raw.language, isLanguage, defaults.language),
    theme: pick('theme', raw.theme, isTheme, defaults.theme),
    rail: 'rail' in raw ? pick('rail', raw.rail, isRailMode, defaults.rail) : defaults.rail,
    appDataDir: pick('appDataDir', raw.appDataDir, isAbsolutePath, defaults.appDataDir),
    pipelines: {
      maxConcurrent: pickPipeline('maxConcurrent'),
      maxChapters: 'maxChapters' in pipelines ? pickPipeline('maxChapters') : defaults.pipelines.maxChapters,
    },
    reading,
    llm: 'llm' in raw ? sanitizeLlmSettings(raw.llm, invalid) : defaultLlmSettings(),
  };
  return { settings, invalid };
}

export function validateSettingsPatch(patch: unknown): string | null {
  if (!isPlainObject(patch)) return 'patch';
  const keys: string[] = Object.keys(patch);
  if (keys.length === 0 || keys.some((key: string): boolean => !PATCH_KEYS.includes(key))) return 'patch';
  const { pipelines } = patch;
  if (pipelines !== undefined) {
    const pipelineKeys: string[] = isPlainObject(pipelines) ? Object.keys(pipelines) : [];
    if (
      pipelineKeys.length === 0 ||
      pipelineKeys.some((key: string): boolean => !PIPELINE_KEYS.includes(key as keyof PipelineSettings))
    ) {
      return 'pipelines.maxConcurrent';
    }
  }
  if ('language' in patch && !isLanguage(patch.language)) return 'language';
  if ('theme' in patch && !isTheme(patch.theme)) return 'theme';
  if ('rail' in patch && !isRailMode(patch.rail)) return 'rail';
  if ('llm' in patch) {
    const error: string | null = validateLlmPatch(patch.llm);
    if (error !== null) return error;
  }
  if (isPlainObject(pipelines)) {
    for (const name of PIPELINE_KEYS) {
      if (name in pipelines && !isPipelineNumber(name, pipelines[name])) return `pipelines.${name}`;
    }
  }
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
