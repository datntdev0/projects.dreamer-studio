import { describe, expect, it } from 'vitest';
import { defaultSettings, sanitizeSettings, validateSettingsPatch } from './settings';

describe('[TH02-01] settings contracts', () => {
  it('keeps valid preferences and defaults invalid fields independently', () => {
    const result = sanitizeSettings({ ...defaultSettings('C:\\data'), theme: 'dark', pipelines: { maxConcurrent: 99 } }, 'C:\\default');
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.pipelines.maxConcurrent).toBe(1);
    expect(result.invalid).toContain('pipelines.maxConcurrent');
  });

  it('accepts only non-empty patches with supported fields and values', () => {
    expect(validateSettingsPatch({ theme: 'dark' })).toBeNull();
    expect(validateSettingsPatch({})).toBe('patch');
    expect(validateSettingsPatch({ theme: 'sepia' })).toBe('theme');
  });
});
