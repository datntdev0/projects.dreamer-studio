import type { AppError } from '../errors/app-error';
import { isAbsolutePath, isPlainObject } from './validation';

export type LlmCliId = 'claude' | 'codex' | 'antigravity';

export const LLM_CLI_IDS: LlmCliId[] = ['claude', 'codex', 'antigravity'];

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

export interface LlmRunRequest {
  cli: LlmCliId;
  model: string | null;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
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
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = { paths: {} };

export function sanitizeLlmSettings(raw: unknown, invalid: string[]): LlmSettings {
  if (!isPlainObject(raw)) {
    invalid.push('llm');
    return { paths: {} };
  }
  if (!isPlainObject(raw.paths)) {
    invalid.push('llm.paths');
    return { paths: {} };
  }
  const paths: Partial<Record<LlmCliId, string>> = {};
  for (const [key, value] of Object.entries(raw.paths)) {
    if (!isLlmCliId(key) || !isAbsolutePath(value)) {
      invalid.push(`llm.paths.${key}`);
      continue;
    }
    paths[key] = value;
  }
  return { paths };
}

export const LLM_TEST_TIMEOUT_MS: number = 30000;
export const LLM_VERSION_TIMEOUT_MS: number = 5000;
