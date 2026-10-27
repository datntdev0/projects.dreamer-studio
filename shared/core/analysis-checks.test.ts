import { describe, expect, it } from 'vitest';
import type { AnalysisEntity, AnalysisFact, CandidateOutput, ChapterAnalysisCounts } from '../models/analysis';
import type { Ontology, PredicateOutput } from '../models/analysis';
import { chapterCounts, checkCandidates, checkChapter, checkConflicts, checkEntity } from './analysis-checks';
import { checkWorld } from './analysis-checks';
import { checkFact, checkPredicates, hasIssues, mergeStageEntities } from './analysis-checks';

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
    expect(entities.get(1)).toEqual([expect.objectContaining({ status: 'failed', reason: 'entity-not-in-ontology' })]);
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
      expect.objectContaining({ name: 'Hanoi', status: 'failed', reason: 'entity-not-in-ontology' }),
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
    expect(facts[0]).toMatchObject({ status: 'failed', reason: 'value-missing' });
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

const MULTI_ONTOLOGY: Ontology = {
  ...ONTOLOGY,
  predicates: [
    ...ONTOLOGY.predicates,
    { name: 'title', kind: 'scalar', subjectTypes: ['Persona'], multiple: true },
    { name: 'mood', kind: 'scalar', subjectTypes: ['Persona'] },
  ],
};

function item<T extends AnalysisEntity | AnalysisFact>(base: T, over: Partial<T>): T {
  return { ...base, ...over };
}

function relation(over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id: 'f-1',
    kind: 'relationship',
    predicate: 'enemy_of',
    subjectId: 'Persona:mai',
    objectId: 'Persona:lan',
    quote: 'Mai Linh hated Lan',
    status: 'verified',
    ...over,
  };
}

function scalar(id: string, predicate: string, value: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id,
    kind: 'scalar',
    predicate,
    subjectId: 'Persona:mai',
    value,
    quote: 'Mai Linh hated Lan',
    status: 'verified',
    ...over,
  };
}

describe('checkEntity', () => {
  it('passes an entity found by name or alias', () => {
    expect(checkEntity(TEXT, entity('Persona', 'Mai', ['Mai Linh']), ONTOLOGY)).toEqual({
      wordsFound: ['Mai', 'Mai Linh'],
    });
    expect(checkEntity(TEXT, entity('Persona', 'Zed', ['Lan']), ONTOLOGY)).toEqual({ wordsFound: ['Lan'] });
  });

  it('reports a type that is not in the ontology first', () => {
    const bad = item(entity('Persona', 'Ghost'), { type: 'Organization' as AnalysisEntity['type'] });
    expect(checkEntity(TEXT, bad, ONTOLOGY)).toEqual({ wordsFound: [], reason: 'entity-not-in-ontology' });
  });

  it('reports words-not-found', () => {
    expect(checkEntity(TEXT, entity('Persona', 'Ghost'), ONTOLOGY)).toEqual({
      wordsFound: [],
      reason: 'words-not-found',
    });
  });

  it('folds quotes and dashes in the name', () => {
    const chapter = { index: 1, paragraphs: ['O’Neil met Anne–Marie.'] };
    expect(checkEntity(chapter, entity('Persona', "O'Neil"), ONTOLOGY).reason).toBeUndefined();
    expect(checkEntity(chapter, entity('Persona', 'Anne-Marie'), ONTOLOGY).reason).toBeUndefined();
  });
});

describe('checkFact', () => {
  const entities: AnalysisEntity[] = ENTITIES;

  it('passes a valid fact', () => {
    expect(checkFact(TEXT, entities, relation(), ONTOLOGY)).toBeUndefined();
  });

  it('fails entity-not-found for a missing, unknown or rejected subject or object', () => {
    expect(checkFact(TEXT, entities, relation({ subjectId: 'x' }), ONTOLOGY)).toBe('entity-not-found');
    expect(checkFact(TEXT, entities, relation({ objectId: 'x' }), ONTOLOGY)).toBe('entity-not-found');
    const rejected = entities.map((e) => (e.id === 'Persona:lan' ? item(e, { status: 'rejected' }) : e));
    expect(checkFact(TEXT, rejected, relation(), ONTOLOGY)).toBe('entity-not-found');
  });

  it('fails predicate-not-in-ontology', () => {
    expect(checkFact(TEXT, entities, relation({ predicate: 'loves' }), ONTOLOGY)).toBe('predicate-not-in-ontology');
  });

  it('fails type-not-allowed', () => {
    expect(checkFact(TEXT, entities, relation({ objectId: 'Location:hanoi' }), ONTOLOGY)).toBe('type-not-allowed');
  });

  it('fails value-missing for an empty scalar and value-not-allowed for an unlisted one', () => {
    expect(checkFact(TEXT, entities, scalar('f', 'gender', 'robot'), ONTOLOGY)).toBe('value-not-allowed');
    expect(checkFact(TEXT, entities, scalar('f', 'gender', ' '), ONTOLOGY)).toBe('value-missing');
    expect(checkFact(TEXT, entities, scalar('f', 'gender', 'FEMALE'), ONTOLOGY)).toBeUndefined();
  });

  it('fails label-missing', () => {
    expect(checkFact(TEXT, entities, relation({ predicate: 'other_relation' }), ONTOLOGY)).toBe('label-missing');
    const labeled = relation({ predicate: 'other_relation', label: 'rival' });
    expect(checkFact(TEXT, entities, labeled, ONTOLOGY)).toBeUndefined();
  });

  it('fails quote-not-found for a missing quote, and folds a curly quote', () => {
    expect(checkFact(TEXT, entities, relation({ quote: 'Never said' }), ONTOLOGY)).toBe('quote-not-found');
    expect(checkFact(TEXT, entities, relation({ quote: null }), ONTOLOGY)).toBe('quote-not-found');
    const chapter = { index: 1, paragraphs: ['She said “hi” — and left.'] };
    expect(checkFact(chapter, entities, relation({ quote: '"hi" - and left' }), ONTOLOGY)).toBeUndefined();
  });

  it('reports the first failing rule in order', () => {
    const missing = relation({ predicate: 'loves', quote: 'nope', subjectId: 'x' });
    expect(checkFact(TEXT, entities, missing, ONTOLOGY)).toBe('entity-not-found');
    expect(checkFact(TEXT, entities, relation({ predicate: 'loves', quote: 'nope' }), ONTOLOGY)).toBe(
      'predicate-not-in-ontology',
    );
    expect(checkFact(TEXT, entities, relation({ objectId: 'Location:hanoi', quote: 'nope' }), ONTOLOGY)).toBe(
      'type-not-allowed',
    );
    expect(checkFact(TEXT, entities, relation({ predicate: 'other_relation', quote: 'nope' }), ONTOLOGY)).toBe(
      'label-missing',
    );
  });
});

describe('checkConflicts', () => {
  const run = (entities: AnalysisEntity[], facts: AnalysisFact[] = [], ontology: Ontology = MULTI_ONTOLOGY) =>
    checkConflicts({ entities, facts, ontology });

  it('flags the same name with different types on both entities', () => {
    const result = run([entity('Persona', 'Mai'), entity('Location', 'MAI')]);
    expect(result.entities.map((e) => [e.status, e.reason])).toEqual([
      ['failed', 'name-conflict'],
      ['failed', 'name-conflict'],
    ]);
  });

  it('flags an alias that is the name of another entity', () => {
    const result = run([entity('Persona', 'Mai', ['Lan']), entity('Persona', 'Lan'), entity('Persona', 'Hung')]);
    expect(result.entities.map((e) => e.reason)).toEqual(['alias-conflict', undefined, undefined]);
  });

  it('prefers a name conflict over an alias conflict', () => {
    const result = run([entity('Persona', 'Mai', ['Lan']), entity('Location', 'Mai'), entity('Persona', 'Lan')]);
    expect(result.entities[0].reason).toBe('name-conflict');
  });

  it('allows a Character and a Persona with the same name', () => {
    const result = run([entity('Persona', 'Mai'), entity('Character', 'Mai')]);
    expect(result.entities.map((e) => e.status)).toEqual(['verified', 'verified']);
  });

  it('flags a Character with a Location of the same name', () => {
    const result = run([entity('Character', 'Mai'), entity('Location', 'Mai')]);
    expect(result.entities.every((e) => e.reason === 'name-conflict')).toBe(true);
  });

  it('flags a Character, a Persona and a Location of the same name', () => {
    const result = run([entity('Character', 'Mai'), entity('Persona', 'Mai'), entity('Location', 'Mai')]);
    expect(result.entities.every((e) => e.reason === 'name-conflict')).toBe(true);
  });

  it('does not flag the same name with the same type', () => {
    const a = entity('Persona', 'Mai');
    const result = run([a, item(a, { id: 'other' })]);
    expect(result.entities.map((e) => e.status)).toEqual(['verified', 'verified']);
  });

  it('flags different values of a non-multiple scalar', () => {
    const result = run(ENTITIES, [scalar('a', 'mood', 'sad'), scalar('b', 'mood', 'happy')]);
    expect(result.facts.map((f) => [f.status, f.reason])).toEqual([
      ['failed', 'value-conflict'],
      ['failed', 'value-conflict'],
    ]);
  });

  it('does not flag equal values, other subjects or other predicates', () => {
    const facts = [
      scalar('a', 'mood', 'sad'),
      scalar('b', 'mood', 'SAD'),
      scalar('c', 'mood', 'happy', { subjectId: 'Persona:lan' }),
      scalar('d', 'gender', 'female'),
    ];
    expect(run(ENTITIES, facts).facts.map((f) => f.status)).toEqual(['verified', 'verified', 'verified', 'verified']);
  });

  it('does not flag different values of a multiple scalar', () => {
    const result = run(ENTITIES, [scalar('a', 'title', 'queen'), scalar('b', 'title', 'witch')]);
    expect(result.facts.map((f) => f.status)).toEqual(['verified', 'verified']);
  });

  it('ignores rejected and other failed items', () => {
    const facts = [
      scalar('a', 'mood', 'sad'),
      scalar('b', 'mood', 'happy', { status: 'rejected' }),
      scalar('c', 'mood', 'angry', { status: 'failed', reason: 'quote-not-found' }),
    ];
    const result = run(ENTITIES, facts);
    expect(result.facts.map((f) => [f.status, f.reason])).toEqual([
      ['verified', undefined],
      ['rejected', undefined],
      ['failed', 'quote-not-found'],
    ]);
  });

  it('counts an accepted item', () => {
    const result = run(ENTITIES, [scalar('a', 'mood', 'sad', { status: 'accepted' }), scalar('b', 'mood', 'happy')]);
    expect(result.facts.map((f) => f.reason)).toEqual(['value-conflict', 'value-conflict']);
  });

  it('clears a conflict after one side is rejected and keeps issue', () => {
    const first = run(ENTITIES, [scalar('a', 'mood', 'sad'), scalar('b', 'mood', 'happy')]);
    const facts = first.facts.map((f) => (f.id === 'b' ? item(f, { status: 'rejected' }) : { ...f, issue: f.reason }));
    const result = run(ENTITIES, facts);
    expect(result.facts[0]).toMatchObject({ status: 'verified', issue: 'value-conflict' });
    expect(result.facts[0].reason).toBeUndefined();
    expect(result.facts[1].status).toBe('rejected');
  });

  it('clears a name conflict after one side is rejected', () => {
    const first = run([entity('Persona', 'Mai'), entity('Location', 'Mai')]);
    const entities = first.entities.map((e, i) => (i === 1 ? item(e, { status: 'rejected' }) : e));
    const result = run(entities);
    expect(result.entities[0]).toMatchObject({ status: 'verified' });
    expect(result.entities[0].reason).toBeUndefined();
  });

  it('returns copies and does not mutate the input', () => {
    const entities = [entity('Persona', 'Mai'), entity('Location', 'Mai')];
    const result = run(entities);
    expect(entities.every((e) => e.status === 'verified')).toBe(true);
    expect(result.entities[0]).not.toBe(entities[0]);
  });
});

describe('checkChapter', () => {
  it('sets issue to the reason on failed items only', () => {
    const ghost = item(entity('Persona', 'Ghost'), { status: 'failed', reason: 'words-not-found' });
    const facts = [relation(), scalar('a', 'mood', 'sad'), scalar('b', 'mood', 'happy')];
    const result = checkChapter({ entities: [entity('Persona', 'Mai'), ghost], facts, ontology: MULTI_ONTOLOGY });
    expect(result.entities.map((e) => e.issue)).toEqual([undefined, 'words-not-found']);
    expect(result.facts.map((f) => f.issue)).toEqual([undefined, 'value-conflict', 'value-conflict']);
  });

  it('keeps an existing issue', () => {
    const ghost = item(entity('Persona', 'Ghost'), {
      status: 'failed',
      reason: 'words-not-found',
      issue: 'entity-not-in-ontology',
    });
    const result = checkChapter({ entities: [ghost], facts: [], ontology: MULTI_ONTOLOGY });
    expect(result.entities[0].issue).toBe('entity-not-in-ontology');
  });
});

describe('checkWorld', () => {
  const chapter = (index: number, entities: AnalysisEntity[], facts: AnalysisFact[] = []) => ({
    index,
    entities,
    facts,
  });

  it('flags a name conflict across chapters and keeps the ids of each chapter', () => {
    const result = checkWorld(
      [chapter(1, [entity('Persona', 'Mai')]), chapter(2, [entity('Location', 'Mai'), entity('Persona', 'Lan')])],
      MULTI_ONTOLOGY,
    );
    expect(result.map((c) => c.entities.map((e) => [e.id, e.reason, e.issue]))).toEqual([
      [['Persona:mai', 'name-conflict', 'name-conflict']],
      [
        ['Location:mai', 'name-conflict', 'name-conflict'],
        ['Persona:lan', undefined, undefined],
      ],
    ]);
  });

  it('does not flag the same entity found in two chapters', () => {
    const result = checkWorld(
      [chapter(1, [entity('Persona', 'Mai')]), chapter(2, [entity('Persona', 'Mai')])],
      ONTOLOGY,
    );
    expect(result.flatMap((c) => c.entities.map((e) => e.status))).toEqual(['verified', 'verified']);
  });

  it('flags two values of a single-value predicate in different chapters', () => {
    const result = checkWorld(
      [chapter(1, [], [scalar('f-1', 'mood', 'sad')]), chapter(2, [], [scalar('f-1', 'mood', 'happy')])],
      MULTI_ONTOLOGY,
    );
    expect(result.map((c) => c.facts.map((f) => [f.id, f.reason]))).toEqual([
      [['f-1', 'value-conflict']],
      [['f-1', 'value-conflict']],
    ]);
  });
});
