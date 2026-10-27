import { describe, expect, it } from 'vitest';
import { AppSettings, DEFAULT_READING_SETTINGS, defaultSettings } from './settings';
import { sanitizeSettings, validateSettingsPatch } from './settings';

const defaultDir: string = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

describe('sanitizeSettings', () => {
  it('keeps valid values and reports nothing', () => {
    const valid: AppSettings = {
      version: 1,
      language: 'vi',
      theme: 'dark',
      rail: 'minimal',
      appDataDir: 'D:\\studio',
      pipelines: { maxConcurrent: 3, maxChapters: 4 },
      reading: { font: 'sans', size: 22, leading: 1.8, width: 80 },
      llm: { paths: {}, default: null, features: {} },
    };
    expect(sanitizeSettings(valid, defaultDir)).toEqual({ settings: valid, invalid: [] });
  });

  it.each([
    ['language', { language: 'fr' }],
    ['theme', { theme: 'blue' }],
    ['appDataDir', { appDataDir: 'relative\\folder' }],
    ['appDataDir', { appDataDir: '' }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 0 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 6 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 2.5 } }],
  ])('resets an invalid %s to its default', (name: string, patch: object) => {
    const raw: object = { ...defaultSettings('D:\\studio'), language: 'vi', theme: 'dark', ...patch };
    const result = sanitizeSettings(raw, defaultDir);
    expect(result.invalid).toEqual([name]);
    const expected: AppSettings = defaultSettings(defaultDir);
    const actual: Record<string, unknown> = result.settings as unknown as Record<string, unknown>;
    const field: string = name.split('.')[0];
    expect(actual[field]).toEqual((expected as unknown as Record<string, unknown>)[field]);
  });

  it('keeps the valid fields when another one is invalid', () => {
    const result = sanitizeSettings({ language: 'vi', theme: 'blue' }, defaultDir);
    expect(result.settings.language).toBe('vi');
    expect(result.settings.theme).toBe('light');
    expect(result.invalid).toEqual(['theme', 'appDataDir', 'pipelines.maxConcurrent']);
  });

  it('drops unknown keys and always outputs version 1', () => {
    const raw: object = { ...defaultSettings('D:\\studio'), version: 7, extra: true };
    const result = sanitizeSettings(raw, defaultDir);
    expect(result.settings).toEqual({ ...defaultSettings('D:\\studio'), version: 1 });
    expect(result.invalid).toEqual([]);
  });

  it('loads an older settings file without a reading notice', () => {
    const raw: Record<string, unknown> = { ...defaultSettings(defaultDir) };
    delete raw.reading;
    const result = sanitizeSettings(raw, defaultDir);
    expect(result.settings.reading).toEqual(DEFAULT_READING_SETTINGS);
    expect(result.invalid).toEqual([]);
  });

  it('loads a REQ-027 LLM block with only paths without a notice', () => {
    const raw: AppSettings = {
      ...defaultSettings(defaultDir),
      llm: { paths: { claude: 'C:\\cli.exe' }, default: null, features: {} },
    };
    const old: Record<string, unknown> = { ...raw, llm: { paths: raw.llm.paths } };
    const result = sanitizeSettings(old, defaultDir);
    expect(result.settings).toEqual(raw);
    expect(result.invalid).toEqual([]);
  });

  it('snaps and clamps reading values while preserving valid fields', () => {
    const raw: object = {
      ...defaultSettings(defaultDir),
      reading: { font: 'sans', size: 29, leading: 1.76, width: 47 },
    };
    const result = sanitizeSettings(raw, defaultDir);
    expect(result.settings.reading).toEqual({ font: 'sans', size: 28, leading: 1.75, width: 48 });
    expect(result.invalid).toEqual(['reading.size', 'reading.leading', 'reading.width']);
  });

  it('normalizes a near-step number without storing floating-point noise', () => {
    const result = sanitizeSettings(
      { ...defaultSettings(defaultDir), reading: { ...DEFAULT_READING_SETTINGS, leading: 1.7500000001 } },
      defaultDir,
    );
    expect(result.settings.reading.leading).toBe(1.75);
    expect(result.invalid).toEqual(['reading.leading']);
    expect(validateSettingsPatch({ reading: { ...DEFAULT_READING_SETTINGS, leading: 1.7500000001 } })).toBe(
      'reading.leading',
    );
  });

  it('defaults a malformed reading object without reporting a missing one', () => {
    const result = sanitizeSettings({ ...defaultSettings(defaultDir), reading: null }, defaultDir);
    expect(result.settings.reading).toEqual(DEFAULT_READING_SETTINGS);
    expect(result.invalid).toEqual(['reading']);
  });

  it('defaults reading fields with an invalid font or nonfinite numbers', () => {
    const result = sanitizeSettings(
      { ...defaultSettings(defaultDir), reading: { font: 'mono', size: '20', leading: NaN, width: Infinity } },
      defaultDir,
    );
    expect(result.settings.reading).toEqual(DEFAULT_READING_SETTINGS);
    expect(result.invalid).toEqual(['reading.font', 'reading.size', 'reading.leading', 'reading.width']);
  });

  it.each([[null], [undefined], ['text'], [42], [[]]])('returns all defaults for %s', (raw: unknown) => {
    expect(sanitizeSettings(raw, defaultDir).settings).toEqual(defaultSettings(defaultDir));
  });
});

describe('validateSettingsPatch', () => {
  it.each([
    [{ language: 'vi' }],
    [{ theme: 'dark' }],
    [{ pipelines: { maxConcurrent: 1 } }],
    [{ pipelines: { maxConcurrent: 5 } }],
    [{ language: 'en', theme: 'light', pipelines: { maxConcurrent: 3 } }],
    [{ reading: DEFAULT_READING_SETTINGS }],
    [{ reading: { font: 'sans', size: 28, leading: 2.2, width: 96 } }],
    [{ llm: { default: null } }],
    [{ llm: { features: { worldAnalysis: { cli: 'claude', model: null } } } }],
  ])('accepts %j', (patch: unknown) => {
    expect(validateSettingsPatch(patch)).toBeNull();
  });

  it.each([
    ['patch', null],
    ['patch', undefined],
    ['patch', 'text'],
    ['patch', 42],
    ['patch', []],
    ['patch', {}],
    ['patch', { unknown: 1 }],
    ['patch', { appDataDir: 'D:\\studio' }],
    ['patch', { language: 'vi', appDataDir: 'D:\\studio' }],
    ['pipelines.maxConcurrent', { pipelines: null }],
    ['pipelines.maxConcurrent', { pipelines: 3 }],
    ['pipelines.maxConcurrent', { pipelines: {} }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 2, extra: 1 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 0 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 6 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: 2.5 } }],
    ['pipelines.maxConcurrent', { pipelines: { maxConcurrent: '3' } }],
    ['language', { language: 'fr' }],
    ['language', { language: 1 }],
    ['theme', { theme: 'blue' }],
    ['theme', { theme: null }],
    ['reading', { reading: null }],
    ['reading', { reading: { font: 'serif', size: 18, leading: 1.75 } }],
    ['reading', { reading: { ...DEFAULT_READING_SETTINGS, extra: 1 } }],
    ['reading.font', { reading: { ...DEFAULT_READING_SETTINGS, font: 'mono' } }],
    ['reading.size', { reading: { ...DEFAULT_READING_SETTINGS, size: 18.5 } }],
    ['reading.leading', { reading: { ...DEFAULT_READING_SETTINGS, leading: 1.76 } }],
    ['reading.width', { reading: { ...DEFAULT_READING_SETTINGS, width: 49 } }],
    ['patch', { llm: { paths: {} } }],
    ['llm.model', { llm: { default: { cli: 'claude', model: 'bad model' } } }],
  ])('reports %s for %j', (field: string, patch: unknown) => {
    expect(validateSettingsPatch(patch)).toBe(field);
  });
});
