import { Injectable, signal, type WritableSignal } from '@angular/core';
import type { LlmCliId } from '@dreamer/shared/models/llm';

export type LlmFeatureId = 'worldAnalysis' | 'glossaryTranslation' | 'contentTranslation';

export interface LlmChoice {
  cli: LlmCliId;
  model: string | null;
}

export interface LlmFeatureChoice {
  feature: LlmFeatureId;
  choice: LlmChoice | null;
}

export interface LlmStoryState {
  defaultChoice: LlmChoice | null;
  features: LlmFeatureChoice[];
}

export const LLM_FEATURE_IDS: LlmFeatureId[] = ['worldAnalysis', 'glossaryTranslation', 'contentTranslation'];

export const LLM_MODEL_SUGGESTIONS: Record<LlmCliId, string[]> = {
  claude: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  codex: ['gpt-5.5', 'gpt-5.5-mini'],
  antigravity: ['gemini-3-pro', 'gemini-3-flash'],
};

export const LLM_STATE_MIXED: LlmStoryState = {
  defaultChoice: { cli: 'claude', model: 'claude-sonnet-5-5' },
  features: [
    { feature: 'worldAnalysis', choice: { cli: 'claude', model: 'claude-opus-5-5' } },
    { feature: 'glossaryTranslation', choice: null },
    { feature: 'contentTranslation', choice: { cli: 'codex', model: null } },
  ],
};

export const LLM_STATE_NONE: LlmStoryState = {
  defaultChoice: null,
  features: LLM_FEATURE_IDS.map((feature: LlmFeatureId): LlmFeatureChoice => ({ feature, choice: null })),
};

@Injectable()
export class LlmStoryStore {
  readonly state: WritableSignal<LlmStoryState> = signal<LlmStoryState>(LLM_STATE_MIXED);
}
