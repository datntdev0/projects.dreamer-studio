import { describe, expect, it } from 'vitest';
import { checkLlmChoice, defaultLlmSettings, formatLlmChoice, isLlmChoice } from './llm';
import { isLlmFeatureId, resolveLlm, sanitizeLlmSettings, validateLlmPatch } from './llm';
import type { LlmChoice, LlmCliId, LlmCliState, LlmCliStatus, LlmSettings } from './llm';

const claude: LlmChoice = { cli: 'claude', model: 'claude-sonnet-5-5' };
const codex: LlmChoice = { cli: 'codex', model: null };

function status(id: LlmCliId, state: LlmCliState): LlmCliStatus {
  return { id, state, version: null, path: state === 'installed' ? 'C:\\cli.exe' : null, customPath: false };
}

describe('LLM choices', () => {
  it('recognizes only known feature IDs and exact valid choices', () => {
    expect(isLlmFeatureId('worldAnalysis')).toBe(true);
    expect(isLlmFeatureId('unknown')).toBe(false);
    expect(isLlmChoice(claude)).toBe(true);
    expect(isLlmChoice(codex)).toBe(true);
    expect(isLlmChoice({ ...claude, extra: true })).toBe(false);
    expect(isLlmChoice({ cli: 'other', model: null })).toBe(false);
    expect(isLlmChoice({ cli: 'claude', model: 'bad model' })).toBe(false);
  });

  it('formats a selected model or the CLI default label', () => {
    expect(formatLlmChoice(claude, 'CLI default')).toBe('Claude Code · claude-sonnet-5-5');
    expect(formatLlmChoice(codex, 'CLI default')).toBe('Codex · CLI default');
  });
});

describe('resolveLlm', () => {
  const settings: LlmSettings = { paths: {}, default: claude, features: { worldAnalysis: codex } };

  it.each([
    ['own choice installed', 'worldAnalysis', [status('codex', 'installed')], codex, 'feature', null],
    ['own choice not installed', 'worldAnalysis', [status('codex', 'notInstalled')], codex, 'feature', 'notInstalled'],
    ['own choice invalid path', 'worldAnalysis', [status('codex', 'invalidPath')], codex, 'feature', 'invalidPath'],
    [
      'own CLI absent from statuses',
      'worldAnalysis',
      [status('claude', 'installed')],
      codex,
      'feature',
      'notInstalled',
    ],
    ['default installed', 'glossaryTranslation', [status('claude', 'installed')], claude, 'default', null],
    [
      'default unavailable',
      'glossaryTranslation',
      [status('claude', 'invalidPath')],
      claude,
      'default',
      'defaultUnavailable',
    ],
  ] as const)('%s', (_name, feature, statuses, choice, source, problem) => {
    expect(resolveLlm(settings, feature, [...statuses])).toEqual({ choice, source, problem });
  });

  it('reports no default when the feature has no choice', () => {
    expect(resolveLlm(defaultLlmSettings(), 'contentTranslation', [])).toEqual({
      choice: null,
      source: 'default',
      problem: 'noDefault',
    });
  });

  it('maps a missing default CLI to defaultUnavailable', () => {
    expect(resolveLlm(settings, 'contentTranslation', [])).toEqual({
      choice: claude,
      source: 'default',
      problem: 'defaultUnavailable',
    });
    expect(checkLlmChoice(claude, [])).toBe('notInstalled');
  });
});

describe('sanitizeLlmSettings', () => {
  it('loads a REQ-027 paths-only block without invalid fields', () => {
    const invalid: string[] = [];
    const paths: object = { claude: 'C:\\cli.exe' };
    expect(sanitizeLlmSettings({ paths }, invalid)).toEqual({ paths, default: null, features: {} });
    expect(invalid).toEqual([]);
  });

  it('drops a bad default while keeping valid feature choices', () => {
    const invalid: string[] = [];
    expect(
      sanitizeLlmSettings(
        { paths: {}, default: { cli: 'other', model: null }, features: { worldAnalysis: codex } },
        invalid,
      ),
    ).toEqual({
      paths: {},
      default: null,
      features: { worldAnalysis: codex },
    });
    expect(invalid).toEqual(['llm.default']);
  });

  it('drops unknown feature keys and bad model IDs', () => {
    const invalid: string[] = [];
    expect(
      sanitizeLlmSettings(
        { paths: {}, features: { unknown: claude, worldAnalysis: { cli: 'claude', model: 'bad model' } } },
        invalid,
      ),
    ).toEqual({
      paths: {},
      default: null,
      features: {},
    });
    expect(invalid).toEqual(['llm.features.unknown', 'llm.features.worldAnalysis']);
  });

  it('drops non-object features and reports the block', () => {
    const invalid: string[] = [];
    expect(sanitizeLlmSettings({ paths: {}, features: [] }, invalid)).toEqual(defaultLlmSettings());
    expect(invalid).toEqual(['llm.features']);
  });

  it('reports a non-object LLM block once', () => {
    const invalid: string[] = [];
    expect(sanitizeLlmSettings(null, invalid)).toEqual(defaultLlmSettings());
    expect(invalid).toEqual(['llm']);
  });

  it('creates distinct default maps', () => {
    const first: LlmSettings = defaultLlmSettings();
    const second: LlmSettings = defaultLlmSettings();
    expect(first.paths).not.toBe(second.paths);
    expect(first.features).not.toBe(second.features);
  });
});

describe('validateLlmPatch', () => {
  it.each([
    ['patch', null],
    ['patch', {}],
    ['patch', { paths: {} }],
    ['patch', { default: null, extra: true }],
    ['llm.model', { default: { cli: 'claude', model: 'bad model' } }],
    ['llm.model', { features: { worldAnalysis: { cli: 'codex', model: 'bad model' } } }],
    ['llm.default', { default: { cli: 'unknown', model: null } }],
    ['llm.features', { features: null }],
    ['llm.features', { features: { unknown: claude } }],
  ])('reports %s for %j', (error: string, patch: unknown) => {
    expect(validateLlmPatch(patch)).toBe(error);
  });

  it.each([
    { default: null },
    { default: claude },
    { features: {} },
    { features: { worldAnalysis: codex } },
    { default: null, features: {} },
  ])('accepts %j', (patch: unknown) => {
    expect(validateLlmPatch(patch)).toBeNull();
  });
});
