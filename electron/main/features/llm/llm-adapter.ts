import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { LlmCliId, LlmUsage } from '@dreamer/shared/models/llm';
import { antigravityAdapter } from './adapters/antigravity';
import { claudeAdapter } from './adapters/claude';
import { codexAdapter } from './adapters/codex';

export interface LlmAdapter {
  id: LlmCliId;
  versionArgs: string[];
  runCommand(input: {
    model: string | null;
    prompt: string;
    schema: Record<string, unknown>;
    schemaFile: string;
    timeoutMs: number;
  }): {
    args: string[];
    stdin: string | null;
  };
  parseOutput(stdout: string): { value: unknown; usage: LlmUsage | null };
  classifyError(exitCode: number | null, stdout: string, stderr: string): ErrorCode;
}

export const ADAPTERS: Record<LlmCliId, LlmAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  antigravity: antigravityAdapter,
};

const signInPattern: RegExp = /\b(not logged in|log ?in|sign ?in|unauthori[sz]ed|401|authenticat\w*)\b/i;

export function classifyCliError(exitCode: number | null, stdout: string, stderr: string): ErrorCode {
  const message: string = exitCode === 0 ? stdout : `${stdout}\n${stderr}`;
  return signInPattern.test(message) ? ErrorCode.LlmNotSignedIn : ErrorCode.LlmCliFailed;
}

export function badOutput(message: string): CodedError {
  return new CodedError(ErrorCode.LlmBadOutput, message);
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badOutput('LLM answer is not valid JSON');
  }
}

export function outputObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badOutput('LLM envelope is not an object');
  }
  return value as Record<string, unknown>;
}

export function parseUsage(value: unknown): LlmUsage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const usage: Record<string, unknown> = value as Record<string, unknown>;
  return typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
    ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
    : null;
}
