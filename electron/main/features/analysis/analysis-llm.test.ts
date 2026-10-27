import { describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AnalysisEntity, AnalysisFact, Ontology } from '@dreamer/shared/models/analysis';
import type { LlmFeatureRunRequest, LlmRunResult } from '@dreamer/shared/models/llm';
import type { Logger } from '../../logging/logger';
import { askCandidates, askPredicates, AskLlm, LlmChapter } from './analysis-llm';

vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const ontology: Ontology = {
  name: 'test',
  task: 'Extract the world.',
  rules: ['Only stated facts.'],
  entityTypes: ['Persona', 'Location'],
  entityTypeDescriptions: { Persona: 'A named identity', Location: 'A named place' },
  entityTypeExamples: { Persona: ['Mai'] },
  predicates: [
    { name: 'alias', kind: 'scalar', subjectTypes: ['Persona'], multiple: true },
    { name: 'located_in', kind: 'relationship', subjectTypes: ['Persona'], objectTypes: ['Location'] },
  ],
};
const chapter: LlmChapter = { index: 1, title: 'One', paragraphs: ['Mai walked into Hanoi.'] };
const log: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

const goodCandidates: unknown = { entities: [{ type: 'Persona', name: 'Mai', aliases: [] }] };
const badCandidates: unknown = { entities: [{ type: 'dragon', name: 'Mai', aliases: [] }] };
const mai: AnalysisEntity = {
  id: 'Persona:mai',
  type: 'Persona',
  name: 'Mai',
  aliases: [],
  wordsFound: ['Mai'],
  status: 'verified',
};
const hanoi: AnalysisEntity = { ...mai, id: 'Location:hanoi', type: 'Location', name: 'Hanoi', wordsFound: ['Hanoi'] };
const goodFacts: unknown = {
  facts: [
    {
      predicate: 'located_in',
      subject: 'Mai',
      object: 'Hanoi',
      value: null,
      label: null,
      quote: 'Mai walked into Hanoi.',
    },
  ],
};
const badFacts: unknown = {
  facts: [{ predicate: 'located_in', subject: 'Mai', object: 'Hanoi', value: null, label: null, quote: 'Never said.' }],
};

type Reply = unknown;

function scripted(replies: Reply[]): { ask: AskLlm; prompts: string[]; names: string[] } {
  const prompts: string[] = [];
  const names: string[] = [];
  const ask: AskLlm = (request: LlmFeatureRunRequest, name: string): Promise<LlmRunResult> => {
    prompts.push(request.prompt);
    names.push(name);
    const reply: Reply = replies[prompts.length - 1] ?? replies[replies.length - 1];
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ value: reply, usage: null, durationMs: 1 });
  };
  return { ask, prompts, names };
}

function badOutput(): CodedError {
  return new CodedError(ErrorCode.LlmBadOutput, 'bad json');
}

function candidates(ask: AskLlm, stage: 'all' | 'Location' = 'all'): Promise<Map<number, AnalysisEntity[]>> {
  return askCandidates({ chapters: [chapter], ontology, stage, ask, log });
}

function predicates(ask: AskLlm): Promise<AnalysisFact[]> {
  return askPredicates({ chapter, entities: [mai, hanoi], ontology, ask, log });
}

describe('askCandidates', () => {
  it('returns a valid answer after one call', async () => {
    const { ask, prompts, names } = scripted([goodCandidates]);
    const result: Map<number, AnalysisEntity[]> = await candidates(ask);
    expect(prompts).toHaveLength(1);
    expect(names).toEqual(['candidates-ch001-001-a1']);
    expect(result.get(1)?.map((entity: AnalysisEntity): string => entity.name)).toEqual(['Mai']);
  });

  it('retries on rule errors and feeds the error lines into the next prompt', async () => {
    const { ask, prompts } = scripted([badCandidates, goodCandidates]);
    const result: Map<number, AnalysisEntity[]> = await candidates(ask);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toContain('previous answer had these problems');
    expect(prompts[1]).toContain('previous answer had these problems');
    expect(prompts[1]).toContain('type "dragon" is not allowed');
    expect(result.get(1)?.[0].status).toBe('verified');
  });

  it('returns the last result with failed items after three rule-error attempts', async () => {
    const { ask, prompts } = scripted([badCandidates]);
    const result: Map<number, AnalysisEntity[]> = await candidates(ask);
    expect(prompts).toHaveLength(3);
    expect(result.get(1)?.[0]).toMatchObject({ status: 'failed', reason: 'entity-not-in-ontology' });
  });

  it('retries after LLM_BAD_OUTPUT', async () => {
    const { ask, prompts } = scripted([badOutput(), goodCandidates]);
    const result: Map<number, AnalysisEntity[]> = await candidates(ask);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('not valid JSON');
    expect(result.get(1)).toHaveLength(1);
  });

  it('throws ANALYSIS_LLM_OUTPUT_INVALID after three bad outputs', async () => {
    const { ask, prompts } = scripted([badOutput()]);
    await expect(candidates(ask)).rejects.toMatchObject({ code: ErrorCode.AnalysisLlmOutputInvalid });
    expect(prompts).toHaveLength(3);
  });

  it('returns attempt 1 result when later attempts are bad output', async () => {
    const { ask, prompts } = scripted([badCandidates, badOutput(), badOutput()]);
    const result: Map<number, AnalysisEntity[]> = await candidates(ask);
    expect(prompts).toHaveLength(3);
    expect(result.get(1)?.[0]).toMatchObject({ status: 'failed', reason: 'entity-not-in-ontology' });
  });

  it.each<[string, Error]>([
    ['LLM_TIMEOUT', new CodedError(ErrorCode.LlmTimeout, 'timeout')],
    ['LLM_NOT_SIGNED_IN', new CodedError(ErrorCode.LlmNotSignedIn, 'signed out')],
    ['AbortError', new DOMException('aborted', 'AbortError')],
  ])('rethrows %s at once', async (_name: string, error: Error) => {
    const { ask, prompts } = scripted([error, goodCandidates]);
    await expect(candidates(ask)).rejects.toBe(error);
    expect(prompts).toHaveLength(1);
  });

  it('lists all entity types when stage is all', async () => {
    const { ask, prompts } = scripted([goodCandidates]);
    await candidates(ask, 'all');
    expect(prompts[0]).toContain('- Persona:');
    expect(prompts[0]).toContain('- Location:');
  });

  it('adds the task, rules, examples and alias limits from the ontology', async () => {
    const { ask, prompts } = scripted([goodCandidates]);
    await candidates(ask);
    expect(prompts[0]).toContain('Extract the world.');
    expect(prompts[0]).toContain('- Only stated facts.');
    expect(prompts[0]).toContain('- Persona: A named identity Examples: Mai.');
    expect(prompts[0]).toContain('- Location: A named place No aliases.');
  });

  it('lists only the stage type when stage is one type', async () => {
    const { ask, prompts } = scripted([{ entities: [] }]);
    await candidates(ask, 'Location');
    expect(prompts[0]).toContain('- Location:');
    expect(prompts[0]).not.toContain('- Persona:');
  });
});

describe('askPredicates', () => {
  it('returns facts after one call', async () => {
    const { ask, prompts } = scripted([goodFacts]);
    const facts: AnalysisFact[] = await predicates(ask);
    expect(prompts).toHaveLength(1);
    expect(facts).toHaveLength(1);
    expect(facts[0].status).toBe('verified');
  });

  it('retries with the rule errors and keeps the last result after three attempts', async () => {
    const { ask, prompts } = scripted([badFacts]);
    const facts: AnalysisFact[] = await predicates(ask);
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('the quote is not in the chapter text');
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'quote-not-found' });
  });

  it('throws ANALYSIS_LLM_OUTPUT_INVALID after three bad outputs', async () => {
    const { ask, prompts } = scripted([badOutput()]);
    await expect(predicates(ask)).rejects.toMatchObject({ code: ErrorCode.AnalysisLlmOutputInvalid });
    expect(prompts).toHaveLength(3);
  });
});
