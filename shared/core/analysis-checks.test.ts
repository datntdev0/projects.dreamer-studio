import { describe, expect, it } from 'vitest';
import type { AnalysisEntity, AnalysisFact, CandidateOutput } from '../models/analysis';
import type { Ontology, PredicateOutput } from '../models/analysis';
import { chapterCounts, checkCandidates, checkPredicates, mergeStageEntities } from './analysis-checks';

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
  return { id: `${type}:${name.toLowerCase()}`, type, name, aliases };
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

describe('[TH04-01] checkCandidates', () => {
  it('verifies an entity found by name', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Location', name: 'Hanoi', aliases: [] }));
    expect(errors).toEqual([]);
    expect(entities.get(1)).toEqual([{ id: 'Location:hanoi', type: 'Location', name: 'Hanoi', aliases: [] }]);
  });

  it('counts an alias-only match', () => {
    const { entities } = runCandidates(candidates({ type: 'Persona', name: 'Linh Mai', aliases: ['Lan'] }));
    expect(entities.get(1)![0]).toMatchObject({ name: 'Linh Mai', aliases: ['Lan'] });
  });

  it('matches case-insensitively and in NFC', () => {
    const chapters = [{ index: 1, paragraphs: ['Café is open.'] }];
    const output = candidates({ type: 'Location', name: 'CAFÉ', aliases: [] });
    const { entities } = checkCandidates({ chapters, output, ontology: ONTOLOGY, stage: 'all' });
    expect(entities.get(1)).toHaveLength(1);
  });

  it('assigns the entity to every chapter containing it and to no other', () => {
    const { entities } = runCandidates(candidates({ type: 'Persona', name: 'Mai', aliases: [] }));
    expect(entities.get(1)).toHaveLength(1);
    expect(entities.get(2)).toHaveLength(0);
    expect(entities.get(3)).toHaveLength(1);
  });

  it('fails an entity found nowhere in the first chapter with an error line', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Persona', name: 'Ghost', aliases: [] }));
    expect(entities.get(1)).toEqual([expect.objectContaining({ name: 'Ghost' })]);
    expect(entities.get(2)).toHaveLength(0);
    expect(entities.get(3)).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('fails a type that is not in the ontology', () => {
    const { entities, errors } = runCandidates(candidates({ type: 'Organization', name: 'Hanoi', aliases: [] }));
    expect(entities.get(1)).toEqual([expect.objectContaining({ type: 'Organization' })]);
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
      expect.objectContaining({ name: 'Hanoi' }),
      expect.objectContaining({ name: 'Lan' }),
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

describe('[TH04-01] checkPredicates', () => {
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
    });
  });

  it('resolves subject and object by alias', () => {
    const { facts } = runPredicates(ENTITIES, fact({ subject: 'mai linh' }));
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:mai', subjectName: 'Mai' });
  });

  it('fails an unknown subject and keeps subjectName', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ subject: 'Nobody' }));
    expect(facts[0]).toMatchObject({ subjectId: '', subjectName: 'Nobody' });
    expect(errors).toHaveLength(1);
  });

  it('fails an unknown object', () => {
    const { errors } = runPredicates(ENTITIES, fact({ object: 'Nobody' }));
    expect(errors).toHaveLength(1);
  });

  it('fails an unknown predicate', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ predicate: 'loves' }));
    expect(facts[0]).toMatchObject({ predicate: 'loves' });
    expect(errors).toHaveLength(1);
  });

  it('drops aliases for a type outside the alias domain', () => {
    const { entities } = runCandidates(candidates({ type: 'Character', name: 'Mai', aliases: ['Mai Linh'] }));
    expect(entities.get(1)?.[0]).toMatchObject({ name: 'Mai', aliases: [] });
  });

  it('orders a symmetric connection by entity id', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'friend_of', subject: 'Mai', object: 'Lan' }));
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:lan', objectId: 'Persona:mai' });
  });

  it('stores the label of a labeled connection', () => {
    const { facts } = runPredicates(ENTITIES, fact({ predicate: 'other_relation', label: 'rival' }));
    expect(facts[0]).toMatchObject({ label: 'rival' });
  });

  it('fails a labeled connection without a label', () => {
    const { errors } = runPredicates(ENTITIES, fact({ predicate: 'other_relation' }));
    expect(errors[0]).toContain('label');
  });

  it('fails a wrong subject type', () => {
    const { errors } = runPredicates(ENTITIES, fact({ subject: 'Hung', predicate: 'has_persona', object: 'Hung' }));
    expect(errors).toHaveLength(1);
  });

  it('fails a wrong object type', () => {
    const { errors } = runPredicates(ENTITIES, fact({ predicate: 'has_persona', object: 'Lan' }));
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
    expect(facts[0]).toMatchObject({ subjectId: 'Persona:mai' });
    expect(facts[1]).toMatchObject({ subjectId: 'Character:mai', objectId: 'Persona:mai' });
  });

  it('keeps two scalar facts of one predicate with different quotes', () => {
    const { facts } = runPredicates(
      ENTITIES,
      fact({ predicate: 'mood', object: null, quote: 'Mai Linh hated Lan' }),
      fact({ predicate: 'mood', object: null, quote: 'She is a woman' }),
    );
    expect(facts).toHaveLength(2);
  });

  it('reports a quote that is not in the text but keeps the fact', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({ quote: 'Mai loved Lan' }));
    expect(facts).toHaveLength(1);
    expect(errors).toEqual(['Fact "Mai / enemy_of": the quote is not in the chapter text.']);
  });

  it('reports an empty quote', () => {
    const { errors } = runPredicates(ENTITIES, fact({ quote: '  ' }));
    expect(errors).toHaveLength(1);
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

  it('adds one error line per failure', () => {
    const { facts, errors } = runPredicates(ENTITIES, fact({}), fact({ subject: 'Nobody' }), fact({ predicate: 'x' }));
    expect(facts).toHaveLength(3);
    expect(errors).toHaveLength(2);
  });
});

describe('[TH04-01] mergeStageEntities', () => {
  const previous = [entity('Persona', 'Mai'), entity('Location', 'Hanoi')];
  const next = [entity('Persona', 'Lan')];

  it('replaces all entities for stage all', () => {
    expect(mergeStageEntities(previous, next, 'all')).toEqual(next);
  });

  it('keeps previous entities of other types for one type', () => {
    expect(mergeStageEntities(previous, next, 'Persona')).toEqual([previous[1], ...next]);
  });
});

describe('[TH04-01] chapterCounts', () => {
  it('counts entities and facts', () => {
    const facts: AnalysisFact[] = [{ id: 'f-1', kind: 'scalar', predicate: 'gender', subjectId: 'x', quote: null }];
    expect(chapterCounts([entity('Persona', 'A'), entity('Persona', 'B')], facts)).toEqual({ entities: 2, facts: 1 });
  });
});
