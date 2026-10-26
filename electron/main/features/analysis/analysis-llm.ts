import { checkCandidates, checkPredicates } from '@dreamer/shared/core/analysis-checks';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AnalysisEntity, AnalysisFact, CandidateOutput, EntityType } from '@dreamer/shared/models/analysis';
import type { Ontology, OntologyPredicate, PredicateOutput } from '@dreamer/shared/models/analysis';
import type { LlmFeatureRunRequest, LlmRunResult } from '@dreamer/shared/models/llm';
import type { Logger } from '../../logging/logger';

export type AskLlm = (request: LlmFeatureRunRequest, name: string) => Promise<LlmRunResult>;
export interface LlmChapter {
  index: number;
  title: string;
  paragraphs: string[];
}
export const ANALYSIS_TIMEOUT_MS: number = 10 * 60 * 1000;

const candidateSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'name', 'aliases'],
        additionalProperties: false,
      },
    },
  },
  required: ['entities'],
  additionalProperties: false,
};

const predicateSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          predicate: { type: 'string' },
          subject: { type: 'string' },
          object: { type: ['string', 'null'] },
          value: { type: ['string', 'null'] },
          quote: { type: 'string' },
        },
        required: ['predicate', 'subject', 'object', 'value', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['facts'],
  additionalProperties: false,
};

function chapterText(chapter: LlmChapter): string {
  return `## Chapter ${chapter.index}: ${chapter.title}\n${chapter.paragraphs.join('\n\n')}`;
}

function candidatePrompt(chapters: LlmChapter[], ontology: Ontology, stage: EntityType | 'all'): string {
  const types: EntityType[] =
    stage === 'all' ? ontology.entityTypes : ontology.entityTypes.filter((type) => type === stage);
  const descriptions: string = types
    .map((type: EntityType): string => `- ${type}: ${ontology.entityTypeDescriptions[type] ?? ''}`)
    .join('\n');
  return [
    'Extract named entities from these chapters. Return JSON: {"entities":[{"type":"...","name":"...","aliases":[]}]}',
    '## Entity types to use',
    descriptions,
    '## Rules',
    '- Copy each name exactly as written in the text.',
    '- Aliases are other names the text uses for the same entity.',
    '- Include no entity that is not in the text.',
    '- Use one entry per entity across these chapters.',
    ...chapters.map(chapterText),
  ].join('\n\n');
}

function predicateLine(predicate: OntologyPredicate): string {
  const objectTypes: string = predicate.objectTypes?.join(', ') ?? 'none';
  const values: string = predicate.allowedValues?.join(', ') ?? 'any';
  return `- ${predicate.name}: ${predicate.kind}; subjects: ${predicate.subjectTypes.join(', ')}; objects: ${objectTypes}; allowed values: ${values}; ${predicate.description ?? ''}`;
}

function predicatePrompt(chapter: LlmChapter, entities: AnalysisEntity[], ontology: Ontology): string {
  const names: string = entities
    .filter((entity: AnalysisEntity): boolean => entity.status !== 'rejected')
    .map(
      (entity: AnalysisEntity): string =>
        `- ${entity.type}: ${entity.name}; aliases: ${entity.aliases.join(', ') || 'none'}`,
    )
    .join('\n');
  return [
    'Extract facts from this chapter. Return JSON: {"facts":[{"predicate":"...","subject":"...","object":null,"value":null,"quote":"..."}]}',
    '## Entities',
    names || 'None',
    '## Predicates',
    ontology.predicates.map(predicateLine).join('\n') || 'None',
    '## Rules',
    '- Subject and object must be names from the entity list.',
    '- Quote must be a sentence copied exactly from the chapter that states the fact.',
    '- For a relationship, set value to null.',
    '- For a scalar, set object to null and use an allowed value when listed.',
    chapterText(chapter),
  ].join('\n\n');
}

function retryPrompt(prompt: string, problems: string[]): string {
  return `${prompt}\n\n## Your previous answer had these problems\n${problems.map((problem: string): string => `- ${problem}`).join('\n')}\nReturn the full corrected answer.`;
}

async function askChecked<TOutput, TResult>(input: {
  label: string;
  slug: string;
  prompt: string;
  schema: Record<string, unknown>;
  ask: AskLlm;
  log: Logger;
  check: (output: TOutput) => { result: TResult; errors: string[] };
}): Promise<TResult> {
  let lastResult: TResult | undefined;
  let problems: string[] = [];
  for (let attempt: number = 1; attempt <= 3; attempt++) {
    const prompt: string = attempt === 1 ? input.prompt : retryPrompt(input.prompt, problems);
    let answer: LlmRunResult;
    try {
      answer = await input.ask(
        { prompt, schema: input.schema, timeoutMs: ANALYSIS_TIMEOUT_MS },
        `${input.slug}-a${attempt}`,
      );
    } catch (error) {
      if (!(error instanceof CodedError) || error.code !== ErrorCode.LlmBadOutput) throw error;
      input.log.warn(`${input.label} attempt ${attempt}/3: invalid JSON`);
      problems = ['Your previous answer was not valid JSON for the schema.'];
      continue;
    }
    const checked: { result: TResult; errors: string[] } = input.check(answer.value as TOutput);
    lastResult = checked.result;
    input.log.info(`${input.label} attempt ${attempt}/3: ${checked.errors.length} rule errors`);
    checked.errors.slice(0, 5).forEach((error: string): void => input.log.info(`  ${error}`));
    if (checked.errors.length === 0) return checked.result;
    problems = checked.errors;
  }
  if (lastResult !== undefined) return lastResult;
  throw new CodedError(ErrorCode.AnalysisLlmOutputInvalid, `${input.label}: no valid LLM answer after 3 attempts`);
}

export function askCandidates(input: {
  chapters: LlmChapter[];
  ontology: Ontology;
  stage: EntityType | 'all';
  ask: AskLlm;
  log: Logger;
}): Promise<Map<number, AnalysisEntity[]>> {
  const first: number = input.chapters[0]?.index ?? 0;
  const last: number = input.chapters.at(-1)?.index ?? first;
  return askChecked<CandidateOutput, Map<number, AnalysisEntity[]>>({
    label: `Candidates ${first}–${last}`,
    slug: `candidates-ch${String(first).padStart(3, '0')}-${String(last).padStart(3, '0')}`,
    prompt: candidatePrompt(input.chapters, input.ontology, input.stage),
    schema: candidateSchema,
    ask: input.ask,
    log: input.log,
    check: (output: CandidateOutput): { result: Map<number, AnalysisEntity[]>; errors: string[] } => {
      const checked: { entities: Map<number, AnalysisEntity[]>; errors: string[] } = checkCandidates({
        chapters: input.chapters,
        output,
        ontology: input.ontology,
        stage: input.stage,
      });
      return { result: checked.entities, errors: checked.errors };
    },
  });
}

export function askPredicates(input: {
  chapter: LlmChapter;
  entities: AnalysisEntity[];
  ontology: Ontology;
  ask: AskLlm;
  log: Logger;
}): Promise<AnalysisFact[]> {
  return askChecked<PredicateOutput, AnalysisFact[]>({
    label: `Predicates chapter ${input.chapter.index}`,
    slug: `predicates-ch${String(input.chapter.index).padStart(3, '0')}`,
    prompt: predicatePrompt(input.chapter, input.entities, input.ontology),
    schema: predicateSchema,
    ask: input.ask,
    log: input.log,
    check: (output: PredicateOutput): { result: AnalysisFact[]; errors: string[] } => {
      const checked: { facts: AnalysisFact[]; errors: string[] } = checkPredicates({
        chapter: input.chapter,
        entities: input.entities,
        output,
        ontology: input.ontology,
      });
      return { result: checked.facts, errors: checked.errors };
    },
  });
}
