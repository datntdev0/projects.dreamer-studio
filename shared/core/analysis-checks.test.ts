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
  entityTypeProperties: {
    Character: [{ name: 'name', required: true, multiple: false }],
    Persona: [
      { name: 'name', required: true, multiple: false },
      { name: 'alias', required: false, multiple: true },
      { name: 'title', required: false, multiple: true },
    ],
    Location: [{ name: 'name', required: true, multiple: false }],
  },
  predicates: [
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
    { name: 'gender', kind: 'scalar', subjectTypes: ['Persona'] },
    { name: 'mood', kind: 'scalar', subjectTypes: ['Persona'] },
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

  it('keeps titles of a persona and drops titles of other types', () => {
    const output = candidates(
      { type: 'Persona', name: 'Mai', aliases: [], titles: ['queen', ' Queen ', 'witch'] },
      { type: 'Location', name: 'Hanoi', aliases: ['capital'], titles: ['old city'] },
    );
    const { entities } = runCandidates(output);
    expect(entities.get(1)).toEqual([
      expect.objectContaining({ name: 'Mai', aliases: [], titles: ['queen', 'witch'] }),
      expect.objectContaining({ name: 'Hanoi', aliases: [] }),
    ]);
    expect(entities.get(1)![1].titles).toBeUndefined();
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

  it('asks for a Persona with the same name as each Character', () => {
    const { errors } = runCandidates(candidates({ type: 'Character', name: 'Mai', aliases: [] }));
    expect(errors).toEqual([
      'Entity "Mai" (Character): add a Persona with the same name; attributes and relations belong to the Persona.',
    ]);
  });

  it('accepts a Character that has a Persona with the same name', () => {
    const output = candidates(
      { type: 'Character', name: 'Mai', aliases: [] },
      { type: 'Persona', name: 'MAI', aliases: [] },
    );
    expect(runCandidates(output).errors).toEqual([]);
  });

  it('does not ask for a Persona in a single-type stage', () => {
    const output = candidates({ type: 'Character', name: 'Mai', aliases: [] });
    const { errors } = checkCandidates({ chapters: CHAPTERS, output, ontology: ONTOLOGY, stage: 'Character' });
    expect(errors).toEqual([]);
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
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'gender', object: null, quote: 'She is a woman' }));
    expect(facts[0]).toEqual({
      id: 'f-1',
      kind: 'scalar',
      predicate: 'gender',
      subjectId: 'Persona:mai',
      subjectName: 'Mai',
      quote: 'She is a woman',
      status: 'verified',
    });
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
      fact({ predicate: 'gender', object: null, quote: 'She is a woman' }),
      fact({ predicate: 'has_persona', object: 'Mai', quote: 'Hung was her real self' }),
    );
    expect(errors).toEqual([]);
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:mai', status: 'verified' });
    expect(facts[1]).toMatchObject({ subjectId: 'Character:mai', objectId: 'Persona:mai', status: 'verified' });
  });

  it('keeps two scalar facts of one predicate with different quotes', () => {
    const { facts } = runPredicates(
      ENTITIES,
      fact({ predicate: 'mood', object: null, quote: 'Mai Linh hated Lan' }),
      fact({ predicate: 'mood', object: null, quote: 'She is a woman' }),
    );
    expect(facts.map((item: AnalysisFact) => item.status)).toEqual(['verified', 'verified']);
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
      fact({ predicate: 'gender', object: null, quote: 'She is a woman' }),
      fact({ predicate: 'gender', subject: 'mai linh', object: null, quote: 'She is a woman' }),
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

function scalar(id: string, predicate: string, quote: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id,
    kind: 'scalar',
    predicate,
    subjectId: 'Persona:mai',
    quote,
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

  it('passes a scalar fact with only a quote', () => {
    expect(checkFact(TEXT, entities, scalar('f', 'gender', 'She is a woman'), ONTOLOGY)).toBeUndefined();
    expect(checkFact(TEXT, entities, scalar('f', 'gender', 'She is a man'), ONTOLOGY)).toBe('quote-not-found');
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
  const run = (entities: AnalysisEntity[], facts: AnalysisFact[] = [], ontology: Ontology = ONTOLOGY) =>
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

  it('does not flag several scalar facts of one predicate', () => {
    const facts = [
      scalar('a', 'mood', 'Mai Linh hated Lan'),
      scalar('b', 'mood', 'She is a woman'),
      scalar('c', 'mood', 'Hung was her real self', { status: 'failed', reason: 'quote-not-found' }),
    ];
    expect(run(ENTITIES, facts).facts.map((f) => [f.status, f.reason])).toEqual([
      ['verified', undefined],
      ['verified', undefined],
      ['failed', 'quote-not-found'],
    ]);
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
    const facts = [relation(), relation({ id: 'f-2', status: 'failed', reason: 'quote-not-found' })];
    const result = checkChapter({ entities: [entity('Persona', 'Mai'), ghost], facts, ontology: ONTOLOGY });
    expect(result.entities.map((e) => e.issue)).toEqual([undefined, 'words-not-found']);
    expect(result.facts.map((f) => f.issue)).toEqual([undefined, 'quote-not-found']);
  });

  it('keeps an existing issue', () => {
    const ghost = item(entity('Persona', 'Ghost'), {
      status: 'failed',
      reason: 'words-not-found',
      issue: 'entity-not-in-ontology',
    });
    const result = checkChapter({ entities: [ghost], facts: [], ontology: ONTOLOGY });
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
      ONTOLOGY,
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
});
