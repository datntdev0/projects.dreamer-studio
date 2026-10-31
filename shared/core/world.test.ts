import { describe, expect, it } from 'vitest';
import type { AnalysisEntity, AnalysisFact, ChapterResult, Ontology, World, WorldDraftEdit } from '../models/analysis';
import type { WorldEntity } from '../models/analysis';
import { buildModel, entityOccurrences, findQuoteMatches, mergeChapters, toGraph } from './world';
import type { OccurrenceChapter, WorldModel, WorldScope, WorldSource } from './world';
import { applyEdits } from './world-apply';
import type { ApplyChapter, ApplyOutcome } from './world-apply';

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

function model(sources: WorldSource[]): WorldModel {
  return buildModel({ sources, ontology, texts: [] });
}

function graph(sources: WorldSource[], scope: WorldScope = all): World {
  return toGraph(model(sources), scope);
}

describe('[TH04-01] mergeChapters', () => {
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

describe('[TH04-01] toGraph', () => {
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

describe('[TH04-01] entityOccurrences', () => {
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

describe('[TH04-01] applyEdits', () => {
  const lan: AnalysisEntity = entity('Persona:lan', 'Lan');
  const hanoi: AnalysisEntity = entity('Location:hanoi', 'Hanoi', { type: 'Location' });
  const link = (id: string, quote: string): AnalysisFact => fact(id, { subjectId: lan.id, objectId: hanoi.id, quote });
  const texts: Record<number, string[]> = {
    1: ['Lan walked to Hanoi. Lan said q1.'],
    2: ['Lan stayed in Hanoi, said q2. Little Lan smiled. Old Mai came.'],
  };

  function chapters(results: [number, AnalysisEntity[], AnalysisFact[]][]): ApplyChapter[] {
    return results.map(([index, entities, facts]) => ({
      index,
      paragraphs: texts[index] ?? [],
      result: { version: 1, file: `c${index}`, index, title: `C${index}`, analysedAt: '', llm: '', entities, facts },
    }));
  }

  const base = (): ApplyChapter[] =>
    chapters([
      [1, [lan, hanoi], [link('f-1', 'q1')]],
      [2, [lan, hanoi], [link('f-1', 'q2')]],
    ]);

  function run(edits: WorldDraftEdit[], input: ApplyChapter[] = base()): ApplyOutcome {
    const world = mergeChapters(input.map((item) => source(item.index, item.result.entities, item.result.facts)));
    return applyEdits({ chapters: input, entities: world.entities, edits, editedAt: 'now' });
  }

  function result(outcome: ApplyOutcome, index: number): ChapterResult | undefined {
    return outcome.results?.find((item) => item.index === index);
  }

  it('deletes an entity and its facts from every chapter', () => {
    const outcome = run([{ kind: 'entity-delete', entityId: hanoi.id }]);
    expect(outcome.results).toHaveLength(2);
    for (const index of [1, 2]) {
      expect(result(outcome, index)?.entities.map((item) => item.name)).toEqual(['Lan']);
      expect(result(outcome, index)?.facts).toEqual([]);
      expect(result(outcome, index)?.editedAt).toBe('now');
    }
  });

  it('creates an entity only in chapters whose text has its name or alias', () => {
    const outcome = run([
      {
        kind: 'entity-add',
        entity: { id: 'n1', type: 'Persona', name: 'Mai', aliases: ['Old Mai'], titles: [], chapters: [] },
      },
    ]);
    expect(result(outcome, 1)).toBeUndefined();
    expect(result(outcome, 2)?.entities.at(-1)).toMatchObject({ id: 'Persona:mai', name: 'Mai', aliases: ['Old Mai'] });
  });

  it('refuses a name, alias or title that is in no chapter text', () => {
    const add = (name: string, aliases: string[] = [], titles: string[] = []): WorldDraftEdit => ({
      kind: 'entity-add',
      entity: { id: 'n1', type: 'Persona', name, aliases, titles, chapters: [] },
    });
    expect(run([add('Ghost')]).problem).toEqual({ reason: 'word-not-in-text', word: 'Ghost' });
    expect(run([add('Mai', ['Nobody'])]).problem).toEqual({ reason: 'word-not-in-text', word: 'Nobody' });
    expect(run([add('Mai', [], ['Queen'])]).problem).toEqual({ reason: 'word-not-in-text', word: 'Queen' });
    expect(run([add('lan')]).problem).toEqual({ reason: 'name-taken', word: 'lan' });
  });

  it('renames and edits aliases in every chapter and relinks facts', () => {
    const outcome = run([{ kind: 'entity-edit', entityId: lan.id, patch: { name: 'Little Lan', aliases: ['Lan'] } }]);
    for (const index of [1, 2]) {
      expect(result(outcome, index)?.entities[0]).toMatchObject({ id: 'Persona:little lan', name: 'Little Lan' });
      expect(result(outcome, index)?.facts[0]).toMatchObject({
        subjectId: 'Persona:little lan',
        subjectName: 'Little Lan',
      });
    }
    expect(run([{ kind: 'entity-edit', entityId: lan.id, patch: { name: 'Nobody' } }]).problem?.reason).toBe(
      'word-not-in-text',
    );
  });

  it('refuses a rename to an existing entity of the same type', () => {
    const input = chapters([[2, [lan, hanoi, entity('Persona:mai', 'Mai')], []]]);
    expect(run([{ kind: 'entity-edit', entityId: lan.id, patch: { name: 'MAI' } }], input).problem).toEqual({
      reason: 'name-taken',
      word: 'MAI',
    });
  });

  it('merges a source into the target per chapter', () => {
    const tiny: AnalysisEntity = entity('Persona:tiny', 'Tiny');
    const input = chapters([
      [1, [lan, hanoi, tiny], [fact('f-1', { subjectId: tiny.id, objectId: hanoi.id, quote: 'q1' })]],
      [2, [tiny], []],
    ]);
    const outcome = run([{ kind: 'entity-merge', sourceIds: [tiny.id], targetId: lan.id }], input);
    expect(result(outcome, 1)?.entities.map((item) => item.name)).toEqual(['Lan', 'Hanoi']);
    expect(result(outcome, 1)?.entities[0].aliases).toEqual(['Tiny']);
    expect(result(outcome, 1)?.facts[0].subjectId).toBe(lan.id);
    expect(result(outcome, 2)?.entities).toEqual([{ ...lan, aliases: ['Tiny'] }]);
  });

  it('splits an entity and moves only the ticked facts', () => {
    const outcome = run([
      {
        kind: 'entity-split',
        entityId: lan.id,
        newEntity: { id: 'n2', type: 'Persona', name: 'Little Lan', aliases: [], titles: [], chapters: [] },
        aliases: [],
        facts: [{ factId: 'f-1', chapterIndex: 2 }],
      },
    ]);
    expect(result(outcome, 1)).toBeUndefined();
    expect(result(outcome, 2)?.facts[0].subjectId).toBe('Persona:little lan');
  });

  it('adds, moves and deletes facts in their chapters', () => {
    const added = run([
      {
        kind: 'fact-add',
        fact: { ...fact('u1', { subjectId: lan.id, objectId: hanoi.id, quote: 'q2' }), chapterIndex: 2 },
      },
    ]);
    expect(result(added, 2)?.facts.map((item) => item.id)).toEqual(['f-1', 'f-2']);
    const moved = run([{ kind: 'fact-edit', factId: 'f-1', chapterIndex: 1, patch: { chapterIndex: 2 } as never }]);
    expect(result(moved, 1)?.facts).toEqual([]);
    expect(result(moved, 2)?.facts).toHaveLength(2);
    const removed = run([{ kind: 'fact-delete', factId: 'f-1', chapterIndex: 2 }]);
    expect(result(removed, 2)?.facts).toEqual([]);
    expect(run([{ kind: 'fact-delete', factId: 'nope', chapterIndex: 2 }]).problem?.reason).toBe('missing');
  });

  it('links a persona to its character in the first chapter of the persona', () => {
    const character: AnalysisEntity = entity('Character:lan', 'Lan', { type: 'Character' });
    const input = [...chapters([[1, [lan, character], []]]), ...chapters([[2, [lan], []]])];
    const outcome = run([{ kind: 'persona-character', personaId: lan.id, characterId: character.id }], input);
    expect(result(outcome, 2)).toBeUndefined();
    expect(result(outcome, 1)?.facts).toEqual([
      expect.objectContaining({ predicate: 'has_persona', subjectId: character.id, objectId: lan.id, quote: 'Lan' }),
    ]);
    const linked = chapters([[1, [lan, character], result(outcome, 1)!.facts]]);
    const cleared = run([{ kind: 'persona-character', personaId: lan.id, characterId: null }], linked);
    expect(result(cleared, 1)?.facts).toEqual([]);
  });
});

describe('[TH04-01] findQuoteMatches', () => {
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
