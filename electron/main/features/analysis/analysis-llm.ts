import { checkCandidates, checkPredicates } from '@dreamer/shared/core/analysis-checks';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AnalysisEntity, AnalysisFact, CandidateOutput, EntityProperty } from '@dreamer/shared/models/analysis';
import type { EntityType } from '@dreamer/shared/models/analysis';
import type { Ontology, OntologyPredicate, PredicateOutput } from '@dreamer/shared/models/analysis';
import type { Logger } from '../../logging/logger';
import { askChecked } from '../llm/llm-checked';
import type { AskLlm } from '../llm/llm-checked';

export type { AskLlm } from '../llm/llm-checked';
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
          titles: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'name', 'aliases', 'titles'],
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
          label: { type: ['string', 'null'] },
          quote: { type: 'string' },
        },
        required: ['predicate', 'subject', 'object', 'label', 'quote'],
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

function ontologyRules(ontology: Ontology): string[] {
  return ontology.rules.map((rule: string): string => `- ${rule}`);
}

function propertyText(property: EntityProperty): string {
  const traits: string = [
    property.required ? 'required' : 'optional',
    ...(property.multiple ? ['many values'] : []),
  ].join(', ');
  return `${property.name} (${traits})${property.description ? `: ${property.description}` : ''}`;
}

function entityTypeLine(ontology: Ontology, type: EntityType): string {
  const examples: string[] = ontology.entityTypeExamples[type] ?? [];
  const properties: EntityProperty[] = ontology.entityTypeProperties[type] ?? [];
  return [
    `- ${type}: ${ontology.entityTypeDescriptions[type] ?? ''}`,
    examples.length > 0 ? ` Examples: ${examples.join(', ')}.` : '',
    ` Properties: ${properties.map(propertyText).join('; ')}.`,
  ].join('');
}

function candidatePrompt(chapters: LlmChapter[], ontology: Ontology, stage: EntityType | 'all'): string {
  const types: EntityType[] =
    stage === 'all' ? ontology.entityTypes : ontology.entityTypes.filter((type) => type === stage);
  return [
    'Extract named entities from these chapters. Return JSON: {"entities":[{"type":"...","name":"...","aliases":[],"titles":[]}]}',
    '## Task',
    ontology.task,
    '## Entity types to use',
    types.map((type: EntityType): string => entityTypeLine(ontology, type)).join('\n'),
    '## Rules',
    [
      ...ontologyRules(ontology),
      '- Aliases are other names the text uses for the same entity. Titles are positions or honorifics.',
      '- Leave aliases or titles empty when the entity type does not have that property.',
      '- Include no entity that is not in the text.',
    ].join('\n'),
    ...chapters.map(chapterText),
  ].join('\n\n');
}

function predicateLine(predicate: OntologyPredicate): string {
  const subjects: string = `subjects: ${predicate.subjectTypes.join(', ')}`;
  const description: string = predicate.description ?? '';
  if (predicate.kind === 'relationship') {
    const objects: string = `objects: ${predicate.objectTypes?.join(', ') ?? 'none'}`;
    const traits: string[] = [
      ...(predicate.symmetric ? ['symmetric'] : []),
      ...(predicate.labeled ? ['needs a label'] : []),
    ];
    return `- ${predicate.name}: connection; ${subjects}; ${objects}; ${[...traits, description].join('; ')}`;
  }
  return `- ${predicate.name}: scalar; ${subjects}; ${description}`;
}

function predicatePrompt(chapter: LlmChapter, entities: AnalysisEntity[], ontology: Ontology): string {
  const names: string = entities
    .map(
      (entity: AnalysisEntity): string =>
        `- ${entity.type}: ${entity.name}; aliases: ${entity.aliases.join(', ') || 'none'}`,
    )
    .join('\n');
  return [
    'Extract facts from this chapter. Return JSON: {"facts":[{"predicate":"...","subject":"...","object":null,"label":null,"quote":"..."}]}',
    '## Task',
    ontology.task,
    '## Entities',
    names || 'None',
    '## Predicates',
    ontology.predicates.map(predicateLine).join('\n') || 'None',
    '## Rules',
    [
      ...ontologyRules(ontology),
      '- Subject and object must be names from the entity list.',
      '- For a connection, set label only when the predicate needs a label; otherwise null.',
      '- For a scalar, set object and label to null. Its quote is the sentence that describes the attribute.',
    ].join('\n'),
    chapterText(chapter),
  ].join('\n\n');
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
    timeoutMs: ANALYSIS_TIMEOUT_MS,
    failureCode: ErrorCode.AnalysisLlmOutputInvalid,
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
    timeoutMs: ANALYSIS_TIMEOUT_MS,
    failureCode: ErrorCode.AnalysisLlmOutputInvalid,
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
