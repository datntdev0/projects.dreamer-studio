import { describe, expect, it } from 'vitest';
import type { AnalysisEntity, AnalysisFact, CandidateOutput, ChapterAnalysisCounts } from '../models/analysis';
import type { Ontology, PredicateOutput } from '../models/analysis';
import { chapterCounts, checkCandidates, checkPredicates, hasIssues, mergeStageEntities } from './analysis-checks';

const ONTOLOGY: Ontology = {
  name: 'test',
  task: 'Extract facts.',
  rules: [],
  entityTypes: ['Character', 'Persona', 'Location'],
  entityTypeDescriptions: {},
  entityTypeExamples: {},
  predicates: [
    { name: 'name', kind: 'scalar', subjectTypes: ['Character', 'Persona', 'Location'] },
    { name: 'alias', kind: 'scalar', subjectTypes: ['Persona', 'Location'], multiple: true },
    { name: 'has_persona', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Persona'] },
    { name: 'enemy_of', kind: 'relationship', subjectTypes: ['Persona'], objectTypes: ['Persona'] },
    {
      name: 'friend_of',
      kind: 'relationship',
      subjectTypes: ['Persona'],
      objectTypes: ['Persona'],
      symmetric: true,
    },
    {
      name: 'other_relation',
      kind: 'relationship',
      subjectTypes: ['Persona'],
      objectTypes: ['Persona'],
      symmetric: true,
      labeled: true,
    },
    { name: 'gender', kind: 'scalar', subjectTypes: ['Persona'], allowedValues: ['female', 'male', 'unknown'] },
  ],
};

const CHAPTERS = [
  { index: 1, paragraphs: ['Mai Linh walked into Hanoi.', 'She met Lan there.'] },
  { index: 2, paragraphs: ['Nothing happens here.'] },
  { index: 3, paragraphs: ['MAI came back to the city.'] },
];

function entity(type: AnalysisEntity['type'], name: string, aliases: string[] = []): AnalysisEntity {
  return { id: `${type}:${name.toLowerCase()}`, type, name, aliases, wordsFound: [name], status: 'verified' };
}

function candidates(...items: CandidateOutput['entities']): CandidateOutput {
  return { entities: items };
}

function runCandidates(output: CandidateOutput, stage: 'all' | 'Persona' = 'all') {
  return checkCandidates({ chapters: CHAPTERS, output, ontology: ONTOLOGY, stage });
}

const ENTITIES: AnalysisEntity[] = [
  entity('Persona', 'Mai', ['Mai Linh']),
  entity('Persona', 'Lan'),
  entity('Character', 'Hung'),
  entity('Location', 'Hanoi'),
];
const TEXT = { index: 1, paragraphs: ['Mai Linh hated Lan. She is a woman.', 'Hung was her real self.'] };

function fact(over: Partial<PredicateOutput['facts'][number]>): PredicateOutput['facts'][number] {
  return {
    predicate: 'enemy_of',
    subject: 'Mai',
    object: 'Lan',
    value: null,
    label: null,
    quote: 'Mai Linh hated Lan',
    ...over,
  };
}

function runPredicates(entities: AnalysisEntity[], ...facts: PredicateOutput['facts']) {
  return checkPredicates({ chapter: TEXT, entities, output: { facts }, ontology: ONTOLOGY });
}

describe('checkCandidates', () => {
  it('verifies an entity found by name', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Location', name: 'Hanoi', aliases: [] }));
    expect(errors).toEqual([]);
    expect(entities.get(1)).toEqual([
      { id: 'Location:hanoi', type: 'Location', name: 'Hanoi', aliases: [], wordsFound: ['Hanoi'], status: 'verified' },
    ]);
  });

  it('counts an alias-only match', () => {
    const { entities } = runCandidates(candidates({ type: 'Persona', name: 'Linh Mai', aliases: ['Lan'] }));
    expect(entities.get(1)![0]).toMatchObject({ status: 'verified', wordsFound: ['Lan'] });
  });

  it('matches case-insensitively and in NFC', () => {
    const chapters = [{ index: 1, paragraphs: ['Café is open.'] }];
    const output = candidates({ type: 'Location', name: 'CAFÉ', aliases: [] });
    const { entities } = checkCandidates({ chapters, output, ontology: ONTOLOGY, stage: 'all' });
    expect(entities.get(1)![0].status).toBe('verified');
  });

  it('assigns the entity to every chapter containing it and to no other', () => {
    const { entities } = runCandidates(candidates({ type: 'Persona', name: 'Mai', aliases: [] }));
    expect(entities.get(1)).toHaveLength(1);
    expect(entities.get(2)).toHaveLength(0);
    expect(entities.get(3)).toHaveLength(1);
  });

  it('fails an entity found nowhere in the first chapter with an error line', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Persona', name: 'Ghost', aliases: [] }));
    expect(entities.get(1)).toEqual([
      expect.objectContaining({ name: 'Ghost', status: 'failed', reason: 'words-not-found', wordsFound: [] }),
    ]);
    expect(entities.get(2)).toHaveLength(0);
    expect(entities.get(3)).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('fails a type that is not in the ontology', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Organization', name: 'Hanoi', aliases: [] }));
    expect(entities.get(1)).toEqual([expect.objectContaining({ status: 'failed', reason: 'type-not-in-ontology' })]);
    expect(entities.get(3)).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('fails a candidate whose type differs from a single-type stage', () => {
    const output = candidates(
      { type: 'Location', name: 'Hanoi', aliases: [] },
      { type: 'Persona', name: 'Lan', aliases: [] },
    );
    const { entities, errors } = runCandidates(output, 'Persona');
    expect(entities.get(1)).toEqual([
      expect.objectContaining({ name: 'Hanoi', status: 'failed', reason: 'type-not-in-ontology' }),
      expect.objectContaining({ name: 'Lan', status: 'verified' }),
    ]);
    expect(errors).toHaveLength(1);
  });

  it('merges duplicates with different case and joins their aliases', () => {
    const output = candidates(
      { type: 'Persona', name: 'Mai', aliases: ['Mai Linh'] },
      { type: 'Persona', name: 'MAI', aliases: ['mai linh', 'Lan'] },
    );
    const { entities } = runCandidates(output);
    expect(entities.get(1)).toHaveLength(1);
    expect(entities.get(1)![0]).toMatchObject({ name: 'Mai', aliases: ['Mai Linh', 'Lan'] });
  });

  it('drops empty names', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Persona', name: '   ', aliases: [] }));
    expect([...entities.values()].flat()).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('has a key for every chapter index', () => {
    const { entities } = runCandidates(candidates());
    expect([...entities.keys()]).toEqual([1, 2, 3]);
  });
});

describe('checkPredicates', () => {
  it('verifies a relationship fact', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({}));
    expect(errors).toEqual([]);
    expect(facts).toEqual([
      {
        id: 'f-1',
        kind: 'relationship',
        predicate: 'enemy_of',
        subjectId: 'Persona:mai',
        objectId: 'Persona:lan',
        subjectName: 'Mai',
        objectName: 'Lan',
        quote: 'Mai Linh hated Lan',
        status: 'verified',
      },
    ]);
  });

  it('verifies a scalar fact', () => {
    const { facts } = runPredicates(
      ENTITIES,
      fact({ predicate: 'gender', object: null, value: 'female', quote: 'She is a woman' }),
    );
    expect(facts[0]).toMatchObject({ kind: 'scalar', value: 'female', status: 'verified' });
  });

  it('resolves subject and object by alias', () => {
    const { facts } = runPredicates(ENTITIES, fact({ subject: 'mai linh' }));
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:mai', subjectName: 'Mai', status: 'verified' });
  });

  it('fails an unknown subject and keeps subjectName', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ subject: 'Nobody' }));
    expect(facts[0]).toMatchObject({
      status: 'failed',
      reason: 'entity-not-found',
      subjectId: '',
      subjectName: 'Nobody',
    });
    expect(errors).toHaveLength(1);
  });

  it('fails an unknown object', () => {
    const { facts } = runPredicates(ENTITIES, fact({ object: 'Nobody' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'entity-not-found' });
  });

  it('fails an unknown predicate', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ predicate: 'loves' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'predicate-not-in-ontology', predicate: 'loves' });
    expect(errors).toHaveLength(1);
  });

  it('drops aliases for a type outside the alias domain', () => {
    const { entities } = runCandidates(candidates({ type: 'Character', name: 'Mai', aliases: ['Mai Linh'] }));
    expect(entities.get(1)?.[0]).toMatchObject({ name: 'Mai', aliases: [], status: 'verified' });
  });

  it('does not accept name or alias as a fact predicate', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'alias', object: null, value: 'Linh' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'predicate-not-in-ontology' });
  });

  it('orders a symmetric connection by entity id', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'friend_of', subject: 'Mai', object: 'Lan' }));
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:lan', objectId: 'Persona:mai', status: 'verified' });
  });

  it('stores the label of a labeled connection', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'other_relation', label: 'rival' }));
    expect(facts[0]).toMatchObject({ label: 'rival', status: 'verified' });
  });

  it('fails a labeled connection without a label', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ predicate: 'other_relation' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'label-missing' });
    expect(errors[0]).toContain('label');
  });

  it('fails a wrong subject type', () => {
    const { facts } = runPredicates(ENTITIES, fact({ subject: 'Hung', predicate: 'has_persona', object: 'Hung' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'type-not-allowed' });
  });

  it('fails a wrong object type', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ predicate: 'has_persona', object: 'Lan' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'type-not-allowed' });
    expect(errors[0]).toBe('Fact "Mai / has_persona": "Mai" is a Persona; has_persona subjects must be: Character.');
  });

  it('picks the entity whose type fits when a character and a persona share a name', () => {
    const shared = [entity('Character', 'Mai'), entity('Persona', 'Mai'), entity('Persona', 'Lan')];
    const { facts, errors } = runPredicates(
      shared,
      fact({ predicate: 'gender', object: null, value: 'female', quote: 'She is a woman' }),
      fact({ predicate: 'has_persona', object: 'Mai', quote: 'Hung was her real self' }),
    );
    expect(errors).toEqual([]);
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:mai', status: 'verified' });
    expect(facts[1]).toMatchObject({ subjectId: 'Character:mai', objectId: 'Persona:mai', status: 'verified' });
  });

  it('fails a scalar value that is not allowed', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'gender', object: null, value: 'other' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'value-not-allowed' });
  });

  it('fails an empty scalar value', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'gender', object: null, value: null }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'value-not-allowed' });
  });

  it('stores an allowed value with the ontology spelling', () => {
    const { facts } = runPredicates(
      ENTITIES,
      fact({ predicate: 'gender', object: null, value: ' FEMALE ', quote: 'She is a woman' }),
    );
    expect(facts[0]).toMatchObject({ value: 'female', status: 'verified' });
  });

  it('fails a quote that is not in the text', () => {
    const { facts } = runPredicates(ENTITIES, fact({ quote: 'Mai loved Lan' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'quote-not-found' });
  });

  it('fails an empty quote', () => {
    const { facts } = runPredicates(ENTITIES, fact({ quote: '  ' }));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'quote-not-found' });
  });

  it('drops duplicates and numbers ids f-1, f-2', () => {
    const { facts } = runPredicates(
      ENTITIES,
      fact({}),
      fact({ subject: 'MAI LINH', object: 'lan' }),
      fact({ predicate: 'gender', object: null, value: 'female', quote: 'She is a woman' }),
    );
    expect(facts.map((item: AnalysisFact) => item.id)).toEqual(['f-1', 'f-2']);
  });

  it('does not resolve rejected entities', () => {
    const rejected = ENTITIES.map((item) => (item.name === 'Lan' ? { ...item, status: 'rejected' as const } : item));
    const { facts } = runPredicates(rejected, fact({}));
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'entity-not-found' });
  });

  it('adds one error line per failure', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({}), fact({ subject: 'Nobody' }), fact({ predicate: 'x' }));
    expect(facts).toHaveLength(3);
    expect(errors).toHaveLength(2);
  });
});

describe('mergeStageEntities', () => {
  const previous = [entity('Persona', 'Mai'), entity('Location', 'Hanoi')];
  const next = [entity('Persona', 'Lan')];

  it('replaces all entities for stage all', () => {
    expect(mergeStageEntities(previous, next, 'all')).toEqual(next);
  });

  it('keeps previous entities of other types for one type', () => {
    expect(mergeStageEntities(previous, next, 'Persona')).toEqual([previous[1], ...next]);
  });
});

describe('chapterCounts and hasIssues', () => {
  const entities: AnalysisEntity[] = [
    { ...entity('Persona', 'A'), status: 'verified' },
    { ...entity('Persona', 'B'), status: 'failed' },
    { ...entity('Persona', 'C'), status: 'accepted' },
  ];
  const facts: AnalysisFact[] = [
    { id: 'f-1', kind: 'scalar', predicate: 'gender', subjectId: 'x', quote: null, status: 'rejected' },
    { id: 'f-2', kind: 'scalar', predicate: 'gender', subjectId: 'x', quote: null, status: 'verified' },
  ];

  it('counts items by status', () => {
    expect(chapterCounts(entities, facts)).toEqual({
      entities: 3,
      facts: 2,
      verified: 2,
      failed: 1,
      accepted: 1,
      rejected: 1,
    });
  });

  it('reports issues only when something failed', () => {
    const counts: ChapterAnalysisCounts = chapterCounts(entities, facts);
    expect(hasIssues(counts)).toBe(true);
    expect(hasIssues({ ...counts, failed: 0 })).toBe(false);
  });
});
