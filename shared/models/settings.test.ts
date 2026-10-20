import { describe, expect, it } from 'vitest';
import { AppSettings, defaultSettings, sanitizeSettings, validateSettingsPatch } from './settings';

const defaultDir: string = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';

describe('sanitizeSettings', () => {
  it('keeps valid values and reports nothing', () => {
    const valid: AppSettings = {
      version: 1,
      language: 'vi',
      theme: 'dark',
      appDataDir: 'D:\\studio',
      pipelines: { maxConcurrent: 3 },
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
  ])('reports %s for %j', (field: string, patch: unknown) => {
    expect(validateSettingsPatch(patch)).toBe(field);
  });
});
