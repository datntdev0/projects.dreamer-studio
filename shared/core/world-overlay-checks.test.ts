import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors/app-error';
import type { AnalysisFact, Ontology, OverlayEdit, World, WorldEntity } from '../models/analysis';
import { parseOntology } from './ontology';
import { checkOverlayEdit } from './world-overlay-checks';

const ontology: Ontology = parseOntology(
  readFileSync(resolve(__dirname, '../../electron/resources/ontology.default.yml'), 'utf8'),
).ontology;

function worldEntity(id: string, name: string, type: WorldEntity['type']): WorldEntity {
  return { id, type, name, aliases: [], titles: [], degree: 0, chapters: [1], scalars: [], staleChapters: [] };
}

const world: World = {
  entities: [
    worldEntity('lan', 'Lan', 'Persona'),
    worldEntity('mai', 'Mai', 'Persona'),
    worldEntity('hanoi', 'Hanoi', 'Location'),
    worldEntity('ch', 'Player', 'Character'),
  ],
  links: [],
};

const chapters = [
  { index: 1, title: 'One', paragraphs: ['Lan said “Hello there” — and left Hanoi.'] },
  { index: 2, title: 'Two', paragraphs: ['Nothing here.'] },
];

function check(edit: OverlayEdit): string | null {
  return checkOverlayEdit({ edit, world, ontology, chapters });
}

function relation(over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id: 'u1',
    kind: 'relationship',
    predicate: 'friend_of',
    subjectId: 'lan',
    objectId: 'mai',
    quote: null,
    status: 'accepted',
    addedByUser: true,
    ...over,
  };
}

function addFact(fact: AnalysisFact, chapterIndex: number = 1): OverlayEdit {
  return { kind: 'fact-add', chapterIndex, fact };
}

const INVALID: string = ErrorCode.AnalysisEditInvalid;

describe('checkOverlayEdit entity edits', () => {
  it('accepts valid entity edits', () => {
    expect(check({ kind: 'entity-add', entity: { id: 'n', type: 'Persona', name: 'New' } })).toBeNull();
    expect(check({ kind: 'entity-rename', entityId: 'lan', name: 'Lan Anh' })).toBeNull();
    expect(check({ kind: 'entity-change-type', entityId: 'lan', entityType: 'Organization' })).toBeNull();
    expect(check({ kind: 'entity-add-alias', entityId: 'lan', alias: 'Lanny' })).toBeNull();
    expect(check({ kind: 'entity-remove-alias', entityId: 'lan', alias: 'Lanny' })).toBeNull();
    expect(check({ kind: 'entity-delete', entityId: 'lan' })).toBeNull();
    expect(check({ kind: 'entity-merge', sourceIds: ['mai'], targetId: 'lan' })).toBeNull();
    const split: OverlayEdit = {
      kind: 'entity-split',
      entityId: 'lan',
      newEntity: { id: 'n', type: 'Persona', name: 'Other' },
      aliases: [],
      facts: [],
    };
    expect(check(split)).toBeNull();
  });

  it('refuses a type that is not in the ontology', () => {
    const add = { kind: 'entity-add', entity: { id: 'n', type: 'Dragon', name: 'New' } } as unknown as OverlayEdit;
    const change = { kind: 'entity-change-type', entityId: 'lan', entityType: 'Dragon' } as unknown as OverlayEdit;
    const split = {
      kind: 'entity-split',
      entityId: 'lan',
      newEntity: { id: 'n', type: 'Dragon', name: 'Other' },
      aliases: [],
      facts: [],
    } as unknown as OverlayEdit;
    expect([check(add), check(change), check(split)]).toEqual([INVALID, INVALID, INVALID]);
  });

  it('refuses an empty name or alias', () => {
    expect(check({ kind: 'entity-add', entity: { id: 'n', type: 'Persona', name: '  ' } })).toBe(INVALID);
    expect(check({ kind: 'entity-rename', entityId: 'lan', name: '' })).toBe(INVALID);
    expect(check({ kind: 'entity-add-alias', entityId: 'lan', alias: ' ' })).toBe(INVALID);
  });

  it('refuses a missing entity', () => {
    expect(check({ kind: 'entity-rename', entityId: 'zz', name: 'X' })).toBe(INVALID);
    expect(check({ kind: 'entity-delete', entityId: 'zz' })).toBe(INVALID);
    expect(check({ kind: 'entity-add-alias', entityId: 'zz', alias: 'X' })).toBe(INVALID);
  });

  it('refuses an add with an existing id', () => {
    expect(check({ kind: 'entity-add', entity: { id: 'lan', type: 'Persona', name: 'Again' } })).toBe(INVALID);
  });

  it('refuses a merge without another existing source', () => {
    expect(check({ kind: 'entity-merge', sourceIds: [], targetId: 'lan' })).toBe(INVALID);
    expect(check({ kind: 'entity-merge', sourceIds: ['lan'], targetId: 'lan' })).toBe(INVALID);
    expect(check({ kind: 'entity-merge', sourceIds: ['zz'], targetId: 'lan' })).toBe(INVALID);
    expect(check({ kind: 'entity-merge', sourceIds: ['mai'], targetId: 'zz' })).toBe(INVALID);
  });
});

describe('checkOverlayEdit fact edits', () => {
  it('accepts valid facts', () => {
    expect(check(addFact(relation()))).toBeNull();
    const scalar: AnalysisFact = relation({ kind: 'scalar', predicate: 'gender', objectId: undefined });
    expect(check(addFact(scalar))).toBeNull();
    expect(check(addFact(relation({ quote: 'hello there' })))).toBeNull();
    expect(check(addFact(relation({ predicate: 'other_relation', label: 'rival' })))).toBeNull();
  });

  it('accepts a quote that matches only after the fold', () => {
    expect(check(addFact(relation({ quote: '"hello  THERE" - and' })))).toBeNull();
  });

  it('refuses a predicate that is not in the ontology or has the wrong kind', () => {
    expect(check(addFact(relation({ predicate: 'nope' })))).toBe(INVALID);
    expect(check(addFact(relation({ kind: 'scalar', predicate: 'friend_of' })))).toBe(INVALID);
    expect(check(addFact(relation({ predicate: 'gender' })))).toBe(INVALID);
  });

  it('refuses a subject or object type that is not allowed', () => {
    expect(check(addFact(relation({ predicate: 'has_persona' })))).toBe(INVALID);
    expect(check(addFact(relation({ objectId: 'hanoi' })))).toBe(INVALID);
    expect(check(addFact(relation({ kind: 'scalar', predicate: 'gender', subjectId: 'hanoi' })))).toBe(INVALID);
  });

  it('refuses a missing subject or object', () => {
    expect(check(addFact(relation({ subjectId: 'zz' })))).toBe(INVALID);
    expect(check(addFact(relation({ objectId: 'zz' })))).toBe(INVALID);
  });

  it('refuses a labeled predicate without a label', () => {
    expect(check(addFact(relation({ predicate: 'other_relation' })))).toBe(INVALID);
  });

  it('refuses a chapter that is not in the novel', () => {
    expect(check(addFact(relation(), 9))).toBe(INVALID);
  });

  it('gives ANALYSIS_QUOTE_NOT_FOUND for a quote missing from that chapter', () => {
    expect(check(addFact(relation({ quote: 'never said' })))).toBe(ErrorCode.AnalysisQuoteNotFound);
    expect(check(addFact(relation({ quote: 'hello there' }), 2))).toBe(ErrorCode.AnalysisQuoteNotFound);
  });
});

describe('checkOverlayEdit resets', () => {
  it('gives null for resets', () => {
    expect(check({ kind: 'entity-reset', entityId: 'zz' })).toBeNull();
    expect(check({ kind: 'fact-reset', factId: 'zz', chapterIndex: 9 })).toBeNull();
    expect(check({ kind: 'entity-restore', entityId: 'zz' })).toBeNull();
    expect(check({ kind: 'fact-restore', factId: 'zz', chapterIndex: 9 })).toBeNull();
  });
});
