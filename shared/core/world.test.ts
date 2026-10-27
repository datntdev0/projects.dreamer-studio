import { describe, expect, it } from 'vitest';
import type { AnalysisChapterDetail, AnalysisEntity, AnalysisFact, OverlayEdit } from '../models/analysis';
import type { World, WorldEntity } from '../models/analysis';
import { activeOverlay, buildWorld, entityOccurrences, factBase, findQuoteMatches } from './world';
import { overlayOrphans, overlayResetEdit } from './world';
import type { OccurrenceChapter } from './world';

function entity(id: string, name: string, over: Partial<AnalysisEntity> = {}): AnalysisEntity {
  return { id, type: 'Persona', name, aliases: [], wordsFound: [name], status: 'verified', ...over };
}

function fact(id: string, over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id,
    kind: 'relationship',
    predicate: 'located_in',
    subjectId: 'a',
    objectId: 'b',
    quote: 'quote',
    status: 'verified',
    ...over,
  };
}

function chapter(index: number, entities: AnalysisEntity[], facts: AnalysisFact[] = []): AnalysisChapterDetail {
  return {
    index,
    title: `Chapter ${index}`,
    file: `file-${index}`,
    resultFile: `result-${index}`,
    status: 'clean',
    counts: {} as AnalysisChapterDetail['counts'],
    pending: false,
    paragraphs: [],
    entities,
    facts,
  };
}

const all = { chapter: null, only: false };

describe('buildWorld', () => {
  it('merges the same name and type across chapters, ignoring case', () => {
    const world: World = buildWorld(
      [chapter(1, [entity('a', 'Mai Linh')]), chapter(2, [entity('b', 'mai LINH')])],
      all,
    );
    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].chapters).toEqual([1, 2]);
  });

  it('merges NFC and NFD spellings', () => {
    const composed: string = 'Tiêu Viêm'.normalize('NFC');
    const decomposed: string = 'Tiêu Viêm'.normalize('NFD');
    const world: World = buildWorld(
      [chapter(1, [entity('a', composed)]), chapter(2, [entity('b', ` ${decomposed} `)])],
      all,
    );
    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].chapters).toEqual([1, 2]);
  });

  it('keeps the same name with different types as two entities', () => {
    const world: World = buildWorld(
      [chapter(1, [entity('a', 'Hanoi'), entity('b', 'Hanoi', { type: 'Location' })])],
      all,
    );
    expect(world.entities).toHaveLength(2);
  });

  it('does not merge an entity whose alias equals another entity name', () => {
    const world: World = buildWorld([chapter(1, [entity('a', 'Lan', { aliases: ['Mai'] }), entity('b', 'Mai')])], all);
    expect(world.entities.map((item: WorldEntity): string => item.name).sort()).toEqual(['Lan', 'Mai']);
  });

  it('filters chapters by scope', () => {
    const chapters: AnalysisChapterDetail[] = [1, 2, 3].map((index: number): AnalysisChapterDetail =>
      chapter(index, [entity(`e${index}`, `N${index}`)]),
    );
    const names = (world: World): string[] => world.entities.map((item: WorldEntity): string => item.name);
    expect(names(buildWorld(chapters, { chapter: 2, only: false }))).toEqual(['N1', 'N2']);
    expect(names(buildWorld(chapters, { chapter: 2, only: true }))).toEqual(['N2']);
    expect(names(buildWorld(chapters, { chapter: null, only: false }))).toEqual(['N1', 'N2', 'N3']);
  });

  it('leaves failed and rejected items out of the world', () => {
    const world: World = buildWorld(
      [
        chapter(1, [
          entity('a', 'Kept'),
          entity('b', 'Failed', { status: 'failed', reason: 'type-not-allowed' }),
          entity('c', 'Rejected', { status: 'rejected' }),
        ]),
      ],
      all,
    );
    expect(world.entities.map((item: WorldEntity): string => item.name)).toEqual(['Kept']);
  });

  it('builds one link per relationship with chapters, quotes and degree', () => {
    const entities: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];
    const world: World = buildWorld(
      [chapter(1, entities, [fact('f1', { quote: 'q1' })]), chapter(2, entities, [fact('f2', { quote: 'q2' })])],
      all,
    );
    expect(world.links).toHaveLength(1);
    expect(world.links[0]).toMatchObject({ chapters: [1, 2], quotes: ['q1', 'q2'] });
    expect(world.entities.map((item: WorldEntity): number => item.degree)).toEqual([1, 1]);
  });
});

describe('entityOccurrences', () => {
  const chapters: OccurrenceChapter[] = [
    { index: 1, title: 'One', paragraphs: ['Mai Linh walked.'] },
    { index: 2, title: 'Two', paragraphs: ['Nothing here.'] },
    { index: 3, title: 'Three', paragraphs: ['The young master left.'] },
  ];

  function subject(over: Partial<WorldEntity>): WorldEntity {
    return { ...buildWorld([chapter(1, [entity('a', 'Mai Linh')])], all).entities[0], ...over };
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
  const chapters: AnalysisChapterDetail[] = [
    chapter(1, people, [fact('f1', { quote: 'q1' })]),
    chapter(2, people, [fact('f2', { quote: 'q2' })]),
  ];

  function build(edits: OverlayEdit[]): World {
    return buildWorld(chapters, all, edits);
  }

  function find(world: World, id: string): WorldEntity | undefined {
    return world.entities.find((item: WorldEntity): boolean => item.id === id);
  }

  const added: OverlayEdit = { kind: 'entity-add', entity: { id: 'n1', type: 'Persona', name: 'New', aliases: ['N'] } };

  it('adds an entity marked as overlay', () => {
    const world: World = build([added]);
    expect(find(world, 'n1')).toMatchObject({ name: 'New', aliases: ['N'], overlay: true, chapters: [] });
  });

  it('renames, changes the type and edits aliases', () => {
    const world: World = build([
      { kind: 'entity-rename', entityId: 'a', name: 'Lan Anh' },
      { kind: 'entity-change-type', entityId: 'b', entityType: 'Organization' },
      { kind: 'entity-add-alias', entityId: 'a', alias: 'Lanny' },
      { kind: 'entity-add-alias', entityId: 'a', alias: 'Temp' },
      { kind: 'entity-remove-alias', entityId: 'a', alias: 'temp' },
    ]);
    expect(find(world, 'a')).toMatchObject({ name: 'Lan Anh', aliases: ['Lanny'], overlay: true });
    expect(find(world, 'b')).toMatchObject({ type: 'Organization', overlay: true });
  });

  it('deletes an entity and its links', () => {
    const world: World = build([{ kind: 'entity-delete', entityId: 'b' }]);
    expect(find(world, 'b')).toBeUndefined();
    expect(world.links).toEqual([]);
  });

  it('merges sources into the target as aliases and moves the links', () => {
    const extra: AnalysisChapterDetail[] = [
      chapter(1, [...people, entity('c', 'Tiny')], [fact('f1'), fact('f3', { subjectId: 'c', objectId: 'b' })]),
    ];
    const world: World = buildWorld(extra, all, [{ kind: 'entity-merge', sourceIds: ['c'], targetId: 'a' }]);
    expect(find(world, 'c')).toBeUndefined();
    expect(find(world, 'a')?.aliases).toContain('Tiny');
    expect(find(world, 'a')).toMatchObject({ overlay: true });
    expect(world.links.some((link) => link.source === 'c' || link.target === 'c')).toBe(false);
  });

  it('splits an entity into a new one', () => {
    const split: OverlayEdit = {
      kind: 'entity-split',
      entityId: 'a',
      newEntity: { id: 'n2', type: 'Persona', name: 'Other' },
      aliases: ['Alt'],
      facts: [],
    };
    const source: AnalysisChapterDetail = chapter(1, [entity('a', 'Lan', { aliases: ['Alt', 'Keep'] }), people[1]]);
    const world: World = buildWorld([source], all, [split]);
    expect(find(world, 'a')?.aliases).toEqual(['Keep']);
    expect(find(world, 'n2')).toMatchObject({ name: 'Other', aliases: ['Alt'], overlay: true });
  });

  it('moves only the relations and scalars of the ticked chapter on a split', () => {
    const people3: AnalysisEntity[] = [
      entity('a', 'Lan'),
      entity('b', 'Hanoi', { type: 'Location' }),
      entity('c', 'Mai'),
    ];
    const scalarOf = (): AnalysisFact =>
      fact('f-2', { kind: 'scalar', predicate: 'gender', objectId: undefined, quote: 'q' });
    const chapters: AnalysisChapterDetail[] = [
      chapter(1, people3, [fact('f-1', { objectId: 'b' }), scalarOf()]),
      chapter(2, people3, [fact('f-1', { objectId: 'c', predicate: 'knows' }), scalarOf()]),
    ];
    const split: OverlayEdit = {
      kind: 'entity-split',
      entityId: 'a',
      newEntity: { id: 'n2', type: 'Persona', name: 'Other' },
      aliases: [],
      facts: [
        { factId: 'f-1', chapterIndex: 1 },
        { factId: 'f-2', chapterIndex: 1 },
      ],
    };
    const world: World = buildWorld(chapters, all, [split]);
    const linkOf = (predicate: string): World['links'][number] | undefined =>
      world.links.find((item) => item.predicate === predicate);
    expect(linkOf('located_in')).toMatchObject({ source: 'n2', overlay: true });
    expect(linkOf('knows')).toMatchObject({ source: 'a' });
    expect(find(world, 'n2')?.scalars.map((item) => item.chapterIndex)).toEqual([1]);
    expect(find(world, 'a')?.scalars.map((item) => item.chapterIndex)).toEqual([2]);
  });

  it('applies two successive edits of the same merged fact without an orphan', () => {
    const people2: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];
    const chapters: AnalysisChapterDetail[] = [chapter(1, people2, [fact('f1', { quote: 'q1' })])];
    const base = factBase(fact('f1', { quote: 'q1' }));
    const edits: OverlayEdit[] = [
      { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'one' }, base },
      { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'two' }, base },
    ];
    expect(overlayOrphans(chapters, edits)).toEqual([]);
    expect(buildWorld(chapters, all, edits).links[0].quotes).toEqual(['two']);
  });

  it('marks only the edited fact of its own chapter when fact ids repeat', () => {
    const people2: AnalysisEntity[] = [entity('a', 'Lan'), entity('b', 'Hanoi', { type: 'Location' })];
    const scalarOf = (): AnalysisFact =>
      fact('f-1', { kind: 'scalar', predicate: 'gender', objectId: undefined, quote: 'q' });
    const chapters: AnalysisChapterDetail[] = [chapter(1, people2, [scalarOf()]), chapter(2, people2, [scalarOf()])];
    const world: World = buildWorld(chapters, all, [
      { kind: 'fact-edit', factId: 'f-1', chapterIndex: 2, patch: { quote: 'new' } },
    ]);
    expect(find(world, 'a')?.scalars.map((item) => item.overlay)).toEqual([true, undefined]);
  });

  it('adds a relationship fact as an overlay link', () => {
    const world: World = build([
      added,
      { kind: 'fact-add', chapterIndex: 2, fact: fact('u1', { subjectId: 'n1', objectId: 'b', quote: null }) },
    ]);
    const link = world.links.find((item) => item.source === 'n1');
    expect(link).toMatchObject({ target: 'b', overlay: true, chapters: [2] });
  });

  it('adds a scalar fact to its subject', () => {
    const scalar: AnalysisFact = fact('u2', {
      kind: 'scalar',
      predicate: 'gender',
      subjectId: 'a',
      objectId: undefined,
    });
    const world: World = build([{ kind: 'fact-add', chapterIndex: 2, fact: scalar }]);
    expect(find(world, 'a')?.scalars).toEqual([
      { factId: 'u2', predicate: 'gender', chapterIndex: 2, quote: 'quote', overlay: true },
    ]);
  });

  it('edits and deletes a merged fact', () => {
    const edited: World = build([{ kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'new' } }]);
    expect(edited.links[0].quotes).toEqual(['new', 'q2']);
    expect(edited.links[0].overlay).toBe(true);
    const removed: World = build([{ kind: 'fact-delete', factId: 'f1', chapterIndex: 1 }]);
    expect(removed.links[0]).toMatchObject({ chapters: [2], quotes: ['q2'] });
  });

  it('fills the fact refs of a link', () => {
    expect(build([]).links[0].factRefs).toEqual([
      { factId: 'f1', chapterIndex: 1 },
      { factId: 'f2', chapterIndex: 2 },
    ]);
  });

  it('does not apply an edit whose entity is gone', () => {
    const world: World = build([
      { kind: 'entity-rename', entityId: 'zz', name: 'X' },
      { kind: 'fact-edit', factId: 'nope', chapterIndex: 1, patch: { quote: 'x' } },
    ]);
    expect(world.entities.map((item: WorldEntity): string => item.name)).toEqual(['Lan', 'Hanoi']);
    expect(world.links[0].quotes).toEqual(['q1', 'q2']);
  });

  it('gives the new entity the chapters of the moved facts, else those of the original', () => {
    const base: OverlayEdit = {
      kind: 'entity-split',
      entityId: 'a',
      newEntity: { id: 'n2', type: 'Persona', name: 'Other' },
      aliases: [],
      facts: [],
    };
    const moved: OverlayEdit = { ...base, facts: [{ factId: 'f2', chapterIndex: 2 }] } as OverlayEdit;
    expect(find(build([moved]), 'n2')?.chapters).toEqual([2]);
    expect(find(build([base]), 'n2')?.chapters).toEqual([1, 2]);
  });

  it('brings back a deleted entity with its earlier edits after a restore', () => {
    const world: World = build([
      { kind: 'entity-add-alias', entityId: 'a', alias: 'Lanny' },
      { kind: 'entity-merge', sourceIds: ['b'], targetId: 'a' },
      { kind: 'entity-delete', entityId: 'a' },
      { kind: 'entity-restore', entityId: 'a' },
    ]);
    expect(find(world, 'b')).toBeUndefined();
    expect(find(world, 'a')?.aliases).toEqual(expect.arrayContaining(['Lanny', 'Hanoi']));
  });

  it('brings back a deleted fact with its earlier fact-edit after a restore', () => {
    const edits: OverlayEdit[] = [
      { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'q9' } },
      { kind: 'fact-delete', factId: 'f1', chapterIndex: 1 },
    ];
    expect(build(edits).links[0]).toMatchObject({ factIds: ['f2'], quotes: ['q2'] });
    const restored: World = build([...edits, { kind: 'fact-restore', factId: 'f1', chapterIndex: 1 }]);
    expect(restored.links[0]).toMatchObject({ overlay: true, quotes: ['q9', 'q2'] });
  });

  it('hides a deleted user-added fact and shows it again after a restore', () => {
    const userFact: OverlayEdit = {
      kind: 'fact-add',
      chapterIndex: 1,
      fact: fact('u1', { predicate: 'knows', objectId: 'b', quote: '' }),
    };
    const del: OverlayEdit = { kind: 'fact-delete', factId: 'u1', chapterIndex: 1 };
    const hasLink = (edits: OverlayEdit[]): boolean => build(edits).links.some((link) => link.predicate === 'knows');
    expect(hasLink([userFact])).toBe(true);
    expect(hasLink([userFact, del])).toBe(false);
    expect(build([userFact, del]).orphans).toBeUndefined();
    expect(hasLink([userFact, del, { kind: 'fact-restore', factId: 'u1', chapterIndex: 1 }])).toBe(true);
  });

  it('shows nothing of an entity edit after its reset', () => {
    const world: World = build([
      { kind: 'entity-rename', entityId: 'a', name: 'X' },
      { kind: 'entity-reset', entityId: 'a' },
    ]);
    expect(find(world, 'a')).toMatchObject({ name: 'Lan' });
    expect(find(world, 'a')?.overlay).toBeUndefined();
  });
});

describe('activeOverlay', () => {
  const rename: OverlayEdit = { kind: 'entity-rename', entityId: 'a', name: 'X' };
  const other: OverlayEdit = { kind: 'entity-rename', entityId: 'b', name: 'Y' };

  it('keeps edits in order without resets', () => {
    expect(activeOverlay([rename, other])).toEqual([rename, other]);
  });

  it('entity-reset removes every edit on that entity', () => {
    const split: OverlayEdit = {
      kind: 'entity-split',
      entityId: 'q',
      newEntity: { id: 'a', type: 'Persona', name: 'S' },
      aliases: [],
      facts: [],
    };
    const edits: OverlayEdit[] = [
      rename,
      other,
      { kind: 'entity-add-alias', entityId: 'a', alias: 'Z' },
      { kind: 'entity-merge', sourceIds: ['c'], targetId: 'a' },
      split,
      { kind: 'entity-add', entity: { id: 'a', type: 'Persona', name: 'A' } },
      { kind: 'entity-reset', entityId: 'a' },
    ];
    expect(activeOverlay(edits)).toEqual([other]);
  });

  it('fact-reset removes the edits of that fact and chapter only', () => {
    const keep: OverlayEdit = { kind: 'fact-delete', factId: 'f1', chapterIndex: 2 };
    const edits: OverlayEdit[] = [
      { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'x' } },
      keep,
      { kind: 'fact-reset', factId: 'f1', chapterIndex: 1 },
    ];
    expect(activeOverlay(edits)).toEqual([keep]);
  });

  it('folds a fact-edit of a user-added fact into the fact-add', () => {
    const add: OverlayEdit = { kind: 'fact-add', chapterIndex: 1, fact: fact('u1', { quote: 'old' }) };
    const result: OverlayEdit[] = activeOverlay([
      add,
      { kind: 'fact-edit', factId: 'u1', chapterIndex: 1, patch: { quote: 'new' } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'fact-add', fact: { id: 'u1', quote: 'new' } });
  });

  it('restores remove only the matching delete and are not kept', () => {
    const rename: OverlayEdit = { kind: 'entity-rename', entityId: 'a', name: 'X' };
    const factEdit: OverlayEdit = { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: { quote: 'x' } };
    const otherDelete: OverlayEdit = { kind: 'fact-delete', factId: 'f1', chapterIndex: 2 };
    const result: OverlayEdit[] = activeOverlay([
      rename,
      { kind: 'entity-delete', entityId: 'a' },
      { kind: 'entity-restore', entityId: 'a' },
      factEdit,
      { kind: 'fact-delete', factId: 'f1', chapterIndex: 1 },
      otherDelete,
      { kind: 'fact-restore', factId: 'f1', chapterIndex: 1 },
    ]);
    expect(result).toEqual([rename, factEdit, otherDelete]);
  });

  it('keeps the delete of a user-added fact separate and reset removes both', () => {
    const add: OverlayEdit = { kind: 'fact-add', chapterIndex: 1, fact: fact('u1') };
    const del: OverlayEdit = { kind: 'fact-delete', factId: 'u1', chapterIndex: 1 };
    expect(activeOverlay([add, del])).toEqual([add, del]);
    expect(activeOverlay([add, del, { kind: 'fact-restore', factId: 'u1', chapterIndex: 1 }])).toEqual([add]);
    expect(activeOverlay([add, del, { kind: 'fact-reset', factId: 'u1', chapterIndex: 1 }])).toEqual([]);
  });

  it('does not keep any reset edit', () => {
    const result: OverlayEdit[] = activeOverlay([
      { kind: 'entity-reset', entityId: 'a' },
      { kind: 'fact-reset', factId: 'f', chapterIndex: 1 },
    ]);
    expect(result).toEqual([]);
  });
});

describe('overlayResetEdit and factBase', () => {
  it('gives the matching reset edit', () => {
    const entityReset: OverlayEdit = { kind: 'entity-reset', entityId: 'a' };
    const user: OverlayEdit = { kind: 'entity-add', entity: { id: 'a', type: 'Persona', name: 'A' } };
    expect(overlayResetEdit(user)).toEqual(entityReset);
    expect(overlayResetEdit({ kind: 'entity-rename', entityId: 'a', name: 'B' })).toEqual(entityReset);
    expect(overlayResetEdit({ kind: 'entity-delete', entityId: 'a' })).toEqual(entityReset);
    expect(overlayResetEdit({ kind: 'entity-merge', sourceIds: ['x'], targetId: 'a' })).toEqual(entityReset);
    const factReset: OverlayEdit = { kind: 'fact-reset', factId: 'f1', chapterIndex: 2 };
    expect(overlayResetEdit({ kind: 'fact-add', chapterIndex: 2, fact: fact('f1') })).toEqual(factReset);
    expect(overlayResetEdit({ kind: 'fact-edit', factId: 'f1', chapterIndex: 2, patch: {} })).toEqual(factReset);
    expect(overlayResetEdit({ kind: 'fact-delete', factId: 'f1', chapterIndex: 2 })).toEqual(factReset);
  });

  it('gives null for resets', () => {
    expect(overlayResetEdit({ kind: 'entity-reset', entityId: 'a' })).toBeNull();
    expect(overlayResetEdit({ kind: 'fact-reset', factId: 'f', chapterIndex: 1 })).toBeNull();
    expect(overlayResetEdit({ kind: 'entity-restore', entityId: 'a' })).toBeNull();
    expect(overlayResetEdit({ kind: 'fact-restore', factId: 'f', chapterIndex: 1 })).toBeNull();
  });

  it('takes the base of a fact', () => {
    expect(factBase(fact('f1'))).toEqual({ predicate: 'located_in', subjectId: 'a', objectId: 'b', quote: 'quote' });
  });
});

describe('overlayOrphans', () => {
  const people: AnalysisEntity[] = [
    entity('a', 'Lan'),
    entity('b', 'Hanoi', { type: 'Location' }),
    entity('c', 'Tiny'),
  ];
  const chapters: AnalysisChapterDetail[] = [chapter(1, people, [fact('f1')])];
  const orphans = (...edits: OverlayEdit[]): OverlayEdit[] => overlayOrphans(chapters, edits);

  it('does not report valid edits', () => {
    const edits: OverlayEdit[] = [
      { kind: 'entity-rename', entityId: 'a', name: 'X' },
      { kind: 'entity-merge', sourceIds: ['c'], targetId: 'a' },
      { kind: 'fact-edit', factId: 'f1', chapterIndex: 1, patch: {}, base: factBase(fact('f1')) },
      { kind: 'fact-delete', factId: 'f1', chapterIndex: 1, base: factBase(fact('f1')) },
      { kind: 'fact-add', chapterIndex: 1, fact: fact('u1') },
    ];
    expect(orphans(...edits)).toEqual([]);
  });

  it('reports an entity edit with a missing entity', () => {
    const edit: OverlayEdit = { kind: 'entity-rename', entityId: 'zz', name: 'X' };
    expect(orphans(edit, { kind: 'entity-delete', entityId: 'a' })).toEqual([edit]);
  });

  it('reports a merge with a missing target', () => {
    const edit: OverlayEdit = { kind: 'entity-merge', sourceIds: ['a'], targetId: 'zz' };
    expect(orphans(edit)).toEqual([edit]);
  });

  it('reports a fact edit or delete whose fact or chapter is missing', () => {
    const missingFact: OverlayEdit = { kind: 'fact-delete', factId: 'nope', chapterIndex: 1 };
    const missingChapter: OverlayEdit = { kind: 'fact-edit', factId: 'f1', chapterIndex: 9, patch: {} };
    expect(orphans(missingFact, missingChapter)).toEqual([missingFact, missingChapter]);
  });

  it('reports a fact edit whose base differs from the current fact', () => {
    const changed: OverlayEdit = {
      kind: 'fact-edit',
      factId: 'f1',
      chapterIndex: 1,
      patch: {},
      base: { ...factBase(fact('f1')), quote: 'other' },
    };
    expect(orphans(changed)).toEqual([changed]);
  });

  it('reports a fact-add with a missing subject or object', () => {
    const noSubject: OverlayEdit = { kind: 'fact-add', chapterIndex: 1, fact: fact('u1', { subjectId: 'zz' }) };
    const noObject: OverlayEdit = { kind: 'fact-add', chapterIndex: 1, fact: fact('u2', { objectId: 'zz' }) };
    expect(orphans(noSubject, noObject)).toEqual([noSubject, noObject]);
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
