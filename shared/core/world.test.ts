import { describe, expect, it } from 'vitest';
import type { AnalysisEntity, AnalysisFact, Ontology, World, WorldDraftEdit, WorldEntity } from '../models/analysis';
import { buildModel, entityOccurrences, findQuoteMatches, invalidEdits, mergeChapters, toGraph } from './world';
import type { OccurrenceChapter, WorldModel, WorldScope, WorldSource } from './world';

const ontology: Ontology = {
  name: 'test',
  task: '',
  rules: [],
  entityTypes: [],
  entityTypeDescriptions: {},
  entityTypeExamples: {},
  entityTypeProperties: {},
  predicates: [],
};
const all: WorldScope = { chapter: null, only: false };

function entity(id: string, name: string, over: Partial<AnalysisEntity> = {}): AnalysisEntity {
  return { id, type: 'Persona', name, aliases: [], ...over };
}

function fact(id: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return { id, kind: 'relationship', predicate: 'located_in', subjectId: 'a', objectId: 'b', quote: 'quote', ...over };
}

function source(index: number, entities: AnalysisEntity[], facts: AnalysisFact[] = [], stale = false): WorldSource {
  return { index, title: `Chapter ${index}`, stale, entities, facts };
}

function model(sources: WorldSource[], edits: WorldDraftEdit[] = []): WorldModel {
  return buildModel({ sources, edits, ontology, texts: [] });
}

function graph(sources: WorldSource[], scope: WorldScope = all, edits: WorldDraftEdit[] = []): World {
  return toGraph(model(sources, edits), scope);
}

describe('mergeChapters', () => {
  it('merges the same name and type across chapters, ignoring case', () => {
    const { entities } = mergeChapters([source(1, [entity('a', 'Mai Linh')]), source(2, [entity('b', 'mai LINH')])]);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ id: 'a', chapters: [1, 2] });
  });

  it('merges NFC and NFD spellings', () => {
    const composed: string = 'Tiêu Viêm'.normalize('NFC');
    const decomposed: string = 'Tiêu Viêm'.normalize('NFD');
    const { entities } = mergeChapters([
      source(1, [entity('a', composed)]),
      source(2, [entity('b', ` ${decomposed} `)]),
    ]);
    expect(entities).toHaveLength(1);
  });

  it('keeps the same name with different types as two entities', () => {
    const { entities } = mergeChapters([source(1, [entity('a', 'Hanoi'), entity('b', 'Hanoi', { type: 'Location' })])]);
    expect(entities).toHaveLength(2);
  });

  it('keeps every item and turns a type outside the ontology list into unknown', () => {
    const { entities } = mergeChapters([source(1, [entity('a', 'Odd', { type: 'Robot' as never })])]);
    expect(entities[0].type).toBe('unknown');
  });

  it('merges aliases and titles', () => {
    const { entities } = mergeChapters([
      source(1, [entity('a', 'Lan', { aliases: ['L'], titles: ['Miss'] })]),
      source(2, [entity('b', 'Lan', { aliases: ['Lanny'] })]),
    ]);
    expect(entities[0]).toMatchObject({ aliases: ['L', 'Lanny'], titles: ['Miss'] });
  });

  it('remaps fact entity ids to world ids and keeps unknown ones empty', () => {
    const places: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];
    const again: AnalysisEntity[] = [entity('c', 'Lan'), entity('d', 'Hanoi', { type: 'Location' })];
    const { facts } = mergeChapters([
      source(1, places, [fact('f1')]),
      source(2, again, [fact('f2', { subjectId: 'c', objectId: 'd' })]),
      source(3, [], [fact('f3', { subjectName: 'Ghost' })]),
    ]);
    expect(facts.map((item) => [item.id, item.chapterIndex, item.subjectId, item.objectId])).toEqual([
      ['f1', 1, 'a', 'b'],
      ['f2', 2, 'a', 'b'],
      ['f3', 3, '', ''],
    ]);
    expect(facts[2].subjectName).toBe('Ghost');
  });
});

describe('toGraph', () => {
  const people: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];

  it('filters chapters by scope', () => {
    const sources: WorldSource[] = [1, 2, 3].map((index: number) => source(index, [entity(`e${index}`, `N${index}`)]));
    const names = (scope: WorldScope): string[] =>
      graph(sources, scope).entities.map((item: WorldEntity): string => item.name);
    expect(names({ chapter: 2, only: false })).toEqual(['N1', 'N2']);
    expect(names({ chapter: 2, only: true })).toEqual(['N2']);
    expect(names(all)).toEqual(['N1', 'N2', 'N3']);
  });

  it('builds one link per relationship with chapters, quotes, fact refs and degree', () => {
    const world: World = graph([
      source(1, people, [fact('f1', { quote: 'q1' })]),
      source(2, people, [fact('f2', { quote: 'q2' })]),
    ]);
    expect(world.links).toHaveLength(1);
    expect(world.links[0]).toMatchObject({ chapters: [1, 2], quotes: ['q1', 'q2'] });
    expect(world.links[0].factRefs).toEqual([
      { factId: 'f1', chapterIndex: 1 },
      { factId: 'f2', chapterIndex: 2 },
    ]);
    expect(world.entities.map((item: WorldEntity): number => item.degree)).toEqual([1, 1]);
  });

  it('puts scalars on the subject, newest chapter first', () => {
    const scalar = (id: string): AnalysisFact => fact(id, { kind: 'scalar', predicate: 'gender', objectId: undefined });
    const world: World = graph([source(1, people, [scalar('s1')]), source(2, people, [scalar('s2')])]);
    expect(world.entities[0].scalars.map((item) => item.chapterIndex)).toEqual([2, 1]);
  });

  it('draws no link for a fact whose object does not exist', () => {
    expect(graph([source(1, [entity('a', 'Lan')], [fact('f1')])]).links).toEqual([]);
  });

  it('marks stale chapters', () => {
    const world: World = graph([source(1, people, [fact('f1')], true), source(2, people)]);
    expect(world.entities[0]).toMatchObject({ stale: true, staleChapters: [1] });
    expect(world.links[0]).toMatchObject({ stale: true, staleChapters: [1] });
  });
});

describe('entityOccurrences', () => {
  const chapters: OccurrenceChapter[] = [
    { index: 1, title: 'One', paragraphs: ['Mai Linh walked.'] },
    { index: 2, title: 'Two', paragraphs: ['Nothing here.'] },
    { index: 3, title: 'Three', paragraphs: ['The young master left.'] },
  ];

  function subject(over: Partial<WorldEntity>): WorldEntity {
    return { ...graph([source(1, [entity('a', 'Mai Linh')])]).entities[0], ...over };
  }

  it('returns one occurrence per chapter in ascending order, with the title', () => {
    const result = entityOccurrences(subject({ chapters: [1, 2, 3] }), chapters);
    expect(result.map((item) => item.chapterIndex)).toEqual([1, 2, 3]);
    expect(result.map((item) => item.chapterTitle)).toEqual(['One', 'Two', 'Three']);
  });

  it('finds the name with a fold and gives null when nothing matches', () => {
    const result = entityOccurrences(subject({ name: 'MAI  linh', chapters: [1, 2] }), chapters);
    expect(result[0].context?.match).toBe('Mai Linh');
    expect(result[1].context).toBeNull();
  });

  it('falls back to the aliases after the name', () => {
    const result = entityOccurrences(subject({ name: 'Nobody', aliases: ['young master'], chapters: [3] }), chapters);
    expect(result[0].context?.match).toBe('young master');
  });

  it('gives an empty title and null context for a missing chapter', () => {
    const result = entityOccurrences(subject({ chapters: [9] }), chapters);
    expect(result).toEqual([{ chapterIndex: 9, chapterTitle: '', context: null }]);
  });
});

describe('overlay', () => {
  const people: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];
  const sources: WorldSource[] = [
    source(1, people, [fact('f1', { quote: 'q1' })]),
    source(2, people, [fact('f2', { quote: 'q2' })]),
  ];
  const added: WorldDraftEdit = {
    kind: 'entity-add',
    entity: { id: 'n1', type: 'Persona', name: 'New', aliases: ['N'], titles: [], chapters: [] },
  };

  function build(edits: WorldDraftEdit[]): World {
    return graph(sources, all, edits);
  }

  function find(world: World, id: string): WorldEntity | undefined {
    return world.entities.find((item: WorldEntity): boolean => item.id === id);
  }

  it('adds an entity marked as overlay', () => {
    expect(find(build([added]), 'n1')).toMatchObject({ name: 'New', aliases: ['N'], overlay: true, chapters: [] });
  });

  it('edits an entity', () => {
    const world: World = build([
      { kind: 'entity-edit', entityId: 'a', patch: { name: 'Lan Anh', aliases: ['Lanny'] } },
    ]);
    expect(find(world, 'a')).toMatchObject({ name: 'Lan Anh', aliases: ['Lanny'], overlay: true });
    expect(find(world, 'b')?.overlay).toBeUndefined();
  });

  it('deletes an entity and its links', () => {
    const world: World = build([{ kind: 'entity-delete', entityId: 'b' }]);
    expect(find(world, 'b')).toBeUndefined();
    expect(world.links).toEqual([]);
  });

  it('merges sources into the target as aliases and relinks the facts', () => {
    const extra: WorldSource[] = [
      source(1, [...people, entity('c', 'Tiny')], [fact('f3', { subjectId: 'c', objectId: 'b' })]),
    ];
    const world: World = graph(extra, all, [{ kind: 'entity-merge', sourceIds: ['c'], targetId: 'a' }]);
    expect(find(world, 'c')).toBeUndefined();
    expect(find(world, 'a')).toMatchObject({ aliases: ['Tiny'], overlay: true });
    expect(world.links[0]).toMatchObject({ source: 'a', overlay: true });
  });

  it('splits an entity and moves only the ticked facts', () => {
    const scalar: AnalysisFact = fact('f-2', { kind: 'scalar', predicate: 'gender', objectId: undefined });
    const chapters: WorldSource[] = [
      source(1, people, [fact('f-1'), scalar]),
      source(2, people, [fact('f-1', { predicate: 'knows' })]),
    ];
    const world: World = graph(chapters, all, [
      {
        kind: 'entity-split',
        entityId: 'a',
        newEntity: { id: 'n2', type: 'Persona', name: 'Other', aliases: [], titles: [], chapters: [] },
        aliases: [],
        facts: [
          { factId: 'f-1', chapterIndex: 1 },
          { factId: 'f-2', chapterIndex: 1 },
        ],
      },
    ]);
    const linkOf = (predicate: string): World['links'][number] | undefined =>
      world.links.find((item) => item.predicate === predicate);
    expect(linkOf('located_in')).toMatchObject({ source: 'n2', overlay: true });
    expect(linkOf('knows')?.source).toBe('a');
    expect(find(world, 'n2')?.scalars.map((item) => item.chapterIndex)).toEqual([1]);
    expect(find(world, 'n2')?.chapters).toEqual([1]);
  });

  it('adds, edits and deletes facts', () => {
    const userFact = { ...fact('u1', { subjectId: 'n1', objectId: 'b', quote: null }), chapterIndex: 2 };
    const world: World = build([added, { kind: 'fact-add', fact: userFact }]);
    expect(world.links.find((item) => item.source === 'n1')).toMatchObject({
      target: 'b',
      overlay: true,
      chapters: [2],
    });
    const edited: World = build([{ kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'new' } }]);
    expect(edited.links[0]).toMatchObject({ quotes: ['new', 'q2'], overlay: true });
    const removed: World = build([{ kind: 'fact-delete', factId: 'f1', chapterIndex: 1 }]);
    expect(removed.links[0]).toMatchObject({ chapters: [2], quotes: ['q2'] });
  });

  it('marks only the edited fact of its own chapter when fact ids repeat', () => {
    const scalar = (): AnalysisFact => fact('f-1', { kind: 'scalar', predicate: 'gender', objectId: undefined });
    const world: World = graph([source(1, people, [scalar()]), source(2, people, [scalar()])], all, [
      { kind: 'fact-edit', factId: 'f-1', chapterIndex: 2, patch: { quote: 'new' } },
    ]);
    expect(find(world, 'a')?.scalars.map((item) => item.overlay)).toEqual([true, undefined]);
  });

  it('reports an edit whose target is missing as an orphan and skips it', () => {
    const missing: WorldDraftEdit[] = [
      { kind: 'entity-edit', entityId: 'zz', patch: { name: 'X' } },
      { kind: 'fact-edit', factId: 'nope', chapterIndex: 1, patch: { quote: 'x' } },
    ];
    const world: World = build(missing);
    expect(world.orphans).toEqual(missing);
    expect(world.entities.map((item: WorldEntity): string => item.name)).toEqual(['Lan', 'Hanoi']);
  });

  it('reports orphans for merges, adds and facts without their ends', () => {
    const edits: WorldDraftEdit[] = [
      { kind: 'entity-merge', sourceIds: ['a'], targetId: 'zz' },
      { kind: 'entity-add', entity: { id: 'a', type: 'Persona', name: 'Dup', aliases: [], titles: [], chapters: [] } },
      { kind: 'fact-add', fact: { ...fact('u1', { subjectId: 'zz' }), chapterIndex: 1 } },
      { kind: 'fact-add', fact: { ...fact('u2', { objectId: 'zz' }), chapterIndex: 1 } },
    ];
    expect(model(sources, edits).orphans).toEqual(edits);
  });
});

describe('invalidEdits', () => {
  const base: WorldModel = model([source(1, [entity('a', 'Lan')])]);

  it('accepts valid edits', () => {
    const edit: WorldDraftEdit = { kind: 'entity-edit', entityId: 'a', patch: { name: 'X', type: 'Location' } };
    expect(invalidEdits(base, [edit])).toBeNull();
  });

  it('rejects orphans, empty names and unknown types', () => {
    expect(invalidEdits(base, [{ kind: 'entity-delete', entityId: 'zz' }])).not.toBeNull();
    expect(invalidEdits(base, [{ kind: 'entity-edit', entityId: 'a', patch: { name: ' ' } }])).not.toBeNull();
    expect(invalidEdits(base, [{ kind: 'entity-edit', entityId: 'a', patch: { type: 'unknown' } }])).not.toBeNull();
  });
});

describe('findQuoteMatches', () => {
  const book = [
    { index: 1, title: 'One', paragraphs: ['He said “Hello  there” — and left.'] },
    { index: 2, title: 'Two', paragraphs: ['Nothing.'] },
    { index: 3, title: 'Three', paragraphs: ['First hello there, then hello there again.'] },
  ];

  it('gives one match per chapter containing the quote, with a fold', () => {
    const result = findQuoteMatches(book, ' "hello there" - and ');
    expect(result.map((item) => item.chapterIndex)).toEqual([1]);
    expect(result[0].chapterTitle).toBe('One');
    expect(result[0].context.match.toLowerCase()).toContain('hello');
  });

  it('gives one match for a chapter with several hits', () => {
    expect(findQuoteMatches(book, 'HELLO THERE').map((item) => item.chapterIndex)).toEqual([1, 3]);
  });

  it('gives nothing for an empty quote or a missing one', () => {
    expect(findQuoteMatches(book, '   ')).toEqual([]);
    expect(findQuoteMatches(book, 'absent')).toEqual([]);
  });
});
