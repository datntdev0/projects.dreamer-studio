import { Injectable, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

export type LlmCliId = 'claude' | 'codex' | 'antigravity';

export type LlmCliState = 'installed' | 'notInstalled' | 'invalidPath';

export type LlmTestState = 'idle' | 'running' | 'ok' | 'error';

export type LlmFeatureId = 'worldAnalysis' | 'glossaryTranslation' | 'contentTranslation';

export interface LlmTestResult {
  state: LlmTestState;
  durationMs: number | null;
  errorCode: string | null;
}

export interface LlmCliStatus {
  id: LlmCliId;
  name: string;
  state: LlmCliState;
  version: string | null;
  path: string | null;
  customPath: boolean;
  test: LlmTestResult;
}

export interface LlmChoice {
  cli: LlmCliId;
  model: string | null;
}

export interface LlmFeatureChoice {
  feature: LlmFeatureId;
  choice: LlmChoice | null;
}

export interface LlmStoryState {
  detecting: boolean;
  clis: LlmCliStatus[];
  defaultChoice: LlmChoice | null;
  features: LlmFeatureChoice[];
}

export const LLM_CLI_IDS: LlmCliId[] = ['claude', 'codex', 'antigravity'];

export const LLM_FEATURE_IDS: LlmFeatureId[] = ['worldAnalysis', 'glossaryTranslation', 'contentTranslation'];

export const LLM_CLOUD_PROVIDERS: string[] = ['OpenAI', 'Anthropic', 'Google'];

export const LLM_MODEL_SUGGESTIONS: Record<LlmCliId, string[]> = {
  claude: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  codex: ['gpt-5.5', 'gpt-5.5-mini'],
  antigravity: ['gemini-3-pro', 'gemini-3-flash'],
};

const IDLE_TEST: LlmTestResult = { state: 'idle', durationMs: null, errorCode: null };

export const LLM_CLIS_MIXED: LlmCliStatus[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    state: 'installed',
    version: '2.4.1',
    path: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd',
    customPath: false,
    test: { state: 'ok', durationMs: 4200, errorCode: null },
  },
  {
    id: 'codex',
    name: 'Codex',
    state: 'notInstalled',
    version: null,
    path: null,
    customPath: false,
    test: IDLE_TEST,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    state: 'installed',
    version: '1.1.8',
    path: 'D:\\Tools\\antigravity\\agy.exe',
    customPath: true,
    test: { state: 'error', durationMs: 900, errorCode: 'LLM_NOT_SIGNED_IN' },
  },
];

export const LLM_CLIS_NONE: LlmCliStatus[] = LLM_CLIS_MIXED.map((cli) => ({
  ...cli,
  state: 'notInstalled',
  version: null,
  path: null,
  customPath: false,
  test: IDLE_TEST,
}));

export const LLM_STATE_MIXED: LlmStoryState = {
  detecting: false,
  clis: LLM_CLIS_MIXED,
  defaultChoice: { cli: 'claude', model: 'claude-sonnet-5-5' },
  features: [
    { feature: 'worldAnalysis', choice: { cli: 'claude', model: 'claude-opus-5-5' } },
    { feature: 'glossaryTranslation', choice: null },
    { feature: 'contentTranslation', choice: { cli: 'codex', model: null } },
  ],
};

export const LLM_STATE_NONE: LlmStoryState = {
  detecting: false,
  clis: LLM_CLIS_NONE,
  defaultChoice: null,
  features: LLM_FEATURE_IDS.map((feature) => ({ feature, choice: null })),
};

@Injectable()
export class LlmStoryStore {
  readonly state: WritableSignal<LlmStoryState> = signal<LlmStoryState>(LLM_STATE_MIXED);
}
