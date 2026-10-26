import type { AppError } from '../errors/app-error';
import { isAbsolutePath, isPlainObject } from './validation';

export type LlmCliId = 'claude' | 'codex' | 'antigravity';

export const LLM_CLI_IDS: LlmCliId[] = ['claude', 'codex', 'antigravity'];

export type LlmFeatureId = 'worldAnalysis' | 'glossaryTranslation' | 'contentTranslation';

export const LLM_FEATURE_IDS: LlmFeatureId[] = ['worldAnalysis', 'glossaryTranslation', 'contentTranslation'];

export function isLlmFeatureId(value: unknown): value is LlmFeatureId {
  return typeof value === 'string' && LLM_FEATURE_IDS.includes(value as LlmFeatureId);
}

export function isLlmCliId(value: unknown): value is LlmCliId {
  return typeof value === 'string' && LLM_CLI_IDS.includes(value as LlmCliId);
}

export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,100}$/.test(value);
}

export interface LlmCliInfo {
  id: LlmCliId;
  name: string;
  executable: string;
  versionPattern: RegExp;
  signIn: string;
  example: string;
}

export const LLM_CLIS: Record<LlmCliId, LlmCliInfo> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    executable: 'claude',
    versionPattern: /^(\d+\.\d+\.\d+) \(Claude Code\)/,
    signIn: 'claude auth login',
    example: 'C:\\Users\\<you>\\.local\\bin\\claude.exe',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    executable: 'codex',
    versionPattern: /^codex-cli (\d+\.\d+\.\d+)/,
    signIn: 'codex login',
    example: 'C:\\Users\\<you>\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
  },
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    executable: 'agy',
    versionPattern: /^(\d+\.\d+\.\d+)\s*$/,
    signIn: 'agy',
    example: 'C:\\Users\\<you>\\AppData\\Local\\agy\\bin\\agy.exe',
  },
};

export const LLM_MODEL_SUGGESTIONS: Record<LlmCliId, string[]> = {
  claude: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  codex: ['gpt-5.5', 'gpt-5.5-mini'],
  antigravity: ['gemini-3-pro', 'gemini-3-flash'],
};

export interface LlmChoice {
  cli: LlmCliId;
  model: string | null;
}

export function isLlmChoice(value: unknown): value is LlmChoice {
  if (!isPlainObject(value) || Object.keys(value).length !== 2) return false;
  return isLlmCliId(value.cli) && (value.model === null || isModelId(value.model));
}

export type LlmCliState = 'installed' | 'notInstalled' | 'invalidPath';

export interface LlmCliStatus {
  id: LlmCliId;
  state: LlmCliState;
  version: string | null;
  path: string | null;
  customPath: boolean;
}

export interface LlmTestResult {
  ok: boolean;
  durationMs: number;
  error: AppError | null;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmFeatureRunRequest {
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
}

export interface LlmRunRequest extends LlmFeatureRunRequest {
  cli: LlmCliId;
  model: string | null;
}

export interface LlmRunResult {
  value: unknown;
  usage: LlmUsage | null;
  durationMs: number;
}

export interface LlmPathRequest {
  cli: LlmCliId;
  path: string | null;
}

export function isLlmPathRequest(value: unknown): value is LlmPathRequest {
  if (!isPlainObject(value)) return false;
  return isLlmCliId(value.cli) && (value.path === null || typeof value.path === 'string');
}

export interface LlmSettings {
  paths: Partial<Record<LlmCliId, string>>;
  default: LlmChoice | null;
  features: Partial<Record<LlmFeatureId, LlmChoice>>;
}

export interface LlmSettingsPatch {
  default?: LlmChoice | null;
  features?: Partial<Record<LlmFeatureId, LlmChoice>>;
}

export type LlmProblem = 'noDefault' | 'defaultUnavailable' | 'notInstalled' | 'invalidPath';

export interface LlmResolution {
  choice: LlmChoice | null;
  source: 'feature' | 'default';
  problem: LlmProblem | null;
}

export function defaultLlmSettings(): LlmSettings {
  return { paths: {}, default: null, features: {} };
}

export function sanitizeLlmSettings(raw: unknown, invalid: string[]): LlmSettings {
  if (!isPlainObject(raw)) {
    invalid.push('llm');
    return defaultLlmSettings();
  }
  const paths: Partial<Record<LlmCliId, string>> = {};
  if ('paths' in raw && !isPlainObject(raw.paths)) {
    invalid.push('llm.paths');
  } else if (isPlainObject(raw.paths)) {
    for (const [key, value] of Object.entries(raw.paths)) {
      if (!isLlmCliId(key) || !isAbsolutePath(value)) {
        invalid.push(`llm.paths.${key}`);
        continue;
      }
      paths[key] = value;
    }
  }
  let defaultChoice: LlmChoice | null = null;
  if ('default' in raw) {
    if (raw.default === null || isLlmChoice(raw.default)) defaultChoice = raw.default;
    else invalid.push('llm.default');
  }
  const features: Partial<Record<LlmFeatureId, LlmChoice>> = {};
  if ('features' in raw) {
    if (!isPlainObject(raw.features)) {
      invalid.push('llm.features');
    } else {
      for (const [key, value] of Object.entries(raw.features)) {
        if (!isLlmFeatureId(key) || !isLlmChoice(value)) {
          invalid.push(`llm.features.${key}`);
          continue;
        }
        features[key] = value;
      }
    }
  }
  return { paths, default: defaultChoice, features };
}

export function validateLlmPatch(value: unknown): string | null {
  if (!isPlainObject(value)) return 'patch';
  const keys: string[] = Object.keys(value);
  if (keys.length === 0 || keys.some((key: string): boolean => key !== 'default' && key !== 'features')) return 'patch';
  const choices: unknown[] = [];
  if ('default' in value && value.default !== null) choices.push(value.default);
  if (isPlainObject(value.features)) choices.push(...Object.values(value.features));
  if (
    choices.some(
      (choice: unknown): boolean =>
        isPlainObject(choice) && 'model' in choice && choice.model !== null && !isModelId(choice.model),
    )
  ) {
    return 'llm.model';
  }
  if ('default' in value && value.default !== null && !isLlmChoice(value.default)) return 'llm.default';
  if ('features' in value) {
    if (!isPlainObject(value.features)) return 'llm.features';
    for (const [key, choice] of Object.entries(value.features)) {
      if (!isLlmFeatureId(key) || !isLlmChoice(choice)) return 'llm.features';
    }
  }
  return null;
}

export function checkLlmChoice(choice: LlmChoice, statuses: LlmCliStatus[]): 'notInstalled' | 'invalidPath' | null {
  const status: LlmCliStatus | undefined = statuses.find((item: LlmCliStatus): boolean => item.id === choice.cli);
  if (status?.state === 'installed') return null;
  return status?.state === 'invalidPath' ? 'invalidPath' : 'notInstalled';
}

export function resolveLlm(settings: LlmSettings, feature: LlmFeatureId, statuses: LlmCliStatus[]): LlmResolution {
  const ownChoice: LlmChoice | undefined = settings.features[feature];
  if (ownChoice) return { choice: ownChoice, source: 'feature', problem: checkLlmChoice(ownChoice, statuses) };
  const choice: LlmChoice | null = settings.default;
  if (choice === null) return { choice: null, source: 'default', problem: 'noDefault' };
  const problem: LlmProblem | null = checkLlmChoice(choice, statuses) === null ? null : 'defaultUnavailable';
  return { choice, source: 'default', problem };
}

export function formatLlmChoice(choice: LlmChoice, cliDefaultLabel: string): string {
  return `${LLM_CLIS[choice.cli].name} · ${choice.model ?? cliDefaultLabel}`;
}

export const LLM_TEST_TIMEOUT_MS: number = 30000;
export const LLM_VERSION_TIMEOUT_MS: number = 5000;
