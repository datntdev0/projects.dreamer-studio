import { describe, expect, it } from 'vitest';
import { CodedError, ErrorCode } from '../errors/app-error';
import type { AnalysisEntity, AnalysisFact, Ontology, ReviewEdit } from '../models/analysis';
import { applyReviewEdit, canAccept, chapterReviewStatus } from './analysis-review';
import { filterReviewItems, isMergeable, issueCounts, reviewItems } from './analysis-review';
import type { ReviewChapter } from './analysis-review';

const ONTOLOGY: Ontology = {
  name: 'test',
  task: 'Extract facts.',
  rules: [],
  entityTypes: ['Character', 'Persona', 'Location'],
  entityTypeDescriptions: {},
  entityTypeExamples: {},
  predicates: [
    { name: 'has_persona', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Persona'] },
    { name: 'enemy_of', kind: 'relationship', subjectTypes: ['Persona'], objectTypes: ['Persona'] },
    { name: 'located_in', kind: 'relationship', subjectTypes: ['Persona'], objectTypes: ['Location'] },
    { name: 'gender', kind: 'scalar', subjectTypes: ['Persona'], allowedValues: ['female', 'male'] },
  ],
};

const CHAPTER = { index: 2, paragraphs: ['Mai hated Lan in Hanoi.', 'Mai is a woman.'] };

function entity(
  id: string,
  type: AnalysisEntity['type'],
  name: string,
  over: Partial<AnalysisEntity> = {},
): AnalysisEntity {
  return { id, type, name, aliases: [], wordsFound: [name], status: 'verified', ...over };
}

function fact(over: Partial<AnalysisFact> = {}): AnalysisFact {
  return {
    id: 'f-1',
    kind: 'relationship',
    predicate: 'enemy_of',
    subjectId: 'mai',
    objectId: 'lan',
    objectName: 'Lan',
    quote: 'Mai hated Lan',
    status: 'verified',
    ...over,
  };
}

const ENTITIES: AnalysisEntity[] = [
  entity('mai', 'Persona', 'Mai'),
  entity('lan', 'Persona', 'Lan'),
  entity('hanoi', 'Location', 'Hanoi'),
];

function apply(edit: ReviewEdit, entities: AnalysisEntity[] = ENTITIES, facts: AnalysisFact[] = [fact()]) {
  return applyReviewEdit({ chapter: CHAPTER, entities, facts, edit, ontology: ONTOLOGY });
}

function edit(over: object): ReviewEdit {
  return { chapterIndex: 2, itemKind: 'fact', itemId: 'f-1', ...over } as ReviewEdit;
}

function codeOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error instanceof CodedError ? error.code : error;
  }
  return null;
}

describe('canAccept', () => {
  it('allows warnings only', () => {
    expect(canAccept('words-not-found')).toBe(false);
    expect(canAccept('quote-not-found')).toBe(false);
    expect(canAccept('value-not-allowed')).toBe(true);
    expect(canAccept('label-missing')).toBe(true);
    expect(canAccept('name-conflict')).toBe(true);
    expect(canAccept('alias-conflict')).toBe(true);
    expect(canAccept('value-conflict')).toBe(true);
    expect(canAccept('type-not-allowed')).toBe(false);
    expect(canAccept(undefined)).toBe(false);
  });
});

describe('applyReviewEdit', () => {
  const failedFact: AnalysisFact = fact({ status: 'failed', reason: 'quote-not-found', quote: 'Never said' });

  it('rejects an item, sets issue and edited', () => {
    const result = apply(edit({ kind: 'review-reject' }), ENTITIES, [failedFact]);
    expect(result.facts[0]).toMatchObject({ status: 'rejected', issue: 'quote-not-found', edited: true });
  });

  it('rejects a verified item without an issue', () => {
    const result = apply(edit({ kind: 'review-reject' }));
    expect(result.facts[0]).toMatchObject({ status: 'rejected', edited: true });
    expect(result.facts[0].issue).toBeUndefined();
  });

  it('accepts a warning', () => {
    const unlabeled = fact({ status: 'failed', reason: 'label-missing' });
    const result = apply(edit({ kind: 'review-accept' }), ENTITIES, [unlabeled]);
    expect(result.facts[0]).toMatchObject({ status: 'accepted', issue: 'label-missing', edited: true });
  });

  it('refuses to accept an error', () => {
    const ghost = entity('ghost', 'Persona', 'Ghost', { status: 'failed', reason: 'words-not-found', wordsFound: [] });
    const accept = edit({ kind: 'review-accept', itemKind: 'entity', itemId: 'ghost' });
    expect(codeOf(() => apply(accept, [...ENTITIES, ghost]))).toBe(ErrorCode.AnalysisEditInvalid);
    expect(codeOf(() => apply(edit({ kind: 'review-accept' }), ENTITIES, [failedFact]))).toBe(
      ErrorCode.AnalysisEditInvalid,
    );
  });

  it('refuses to accept other reasons and verified items', () => {
    const bad = fact({ status: 'failed', reason: 'type-not-allowed' });
    expect(codeOf(() => apply(edit({ kind: 'review-accept' }), ENTITIES, [bad]))).toBe(ErrorCode.AnalysisEditInvalid);
    expect(codeOf(() => apply(edit({ kind: 'review-accept' })))).toBe(ErrorCode.AnalysisEditInvalid);
  });

  it('throws for an unknown item and a wrong chapter', () => {
    expect(codeOf(() => apply(edit({ kind: 'review-reject', itemId: 'nope' })))).toBe(ErrorCode.AnalysisEditInvalid);
    expect(codeOf(() => apply(edit({ kind: 'review-reject', chapterIndex: 3 })))).toBe(ErrorCode.AnalysisEditInvalid);
    expect(codeOf(() => apply(edit({ kind: 'review-reject', itemKind: 'entity', itemId: 'f-1' })))).toBe(
      ErrorCode.AnalysisEditInvalid,
    );
  });

  it('throws for a fix with no allowed field', () => {
    expect(codeOf(() => apply(edit({ kind: 'review-fix', fact: {} })))).toBe(ErrorCode.AnalysisEditInvalid);
    expect(codeOf(() => apply(edit({ kind: 'review-fix', fact: { status: 'verified' } })))).toBe(
      ErrorCode.AnalysisEditInvalid,
    );
  });

  it('fixes an entity type and verifies it', () => {
    const wrong = entity('hanoi', 'Organization' as AnalysisEntity['type'], 'Hanoi', {
      status: 'failed',
      reason: 'entity-not-in-ontology',
    });
    const result = apply(
      edit({ kind: 'review-fix', itemKind: 'entity', itemId: 'hanoi', entity: { type: 'Location' } }),
      [ENTITIES[0], ENTITIES[1], wrong],
      [],
    );
    expect(result.entities[2]).toMatchObject({
      type: 'Location',
      status: 'verified',
      issue: 'entity-not-in-ontology',
      edited: true,
      wordsFound: ['Hanoi'],
    });
    expect(result.entities[2].reason).toBeUndefined();
  });

  it('fails an entity fix that is still bad with the new reason', () => {
    const ghost = entity('ghost', 'Persona', 'Ghost', { status: 'failed', reason: 'entity-not-in-ontology' });
    const result = apply(
      edit({ kind: 'review-fix', itemKind: 'entity', itemId: 'ghost', entity: { type: 'Location' } }),
      [...ENTITIES, ghost],
      [],
    );
    expect(result.entities[3]).toMatchObject({ status: 'failed', reason: 'words-not-found', wordsFound: [] });
  });

  it('fails an entity fix to a type outside the ontology', () => {
    const result = apply(
      edit({ kind: 'review-fix', itemKind: 'entity', itemId: 'mai', entity: { type: 'Organization' } }),
      ENTITIES,
      [],
    );
    expect(result.entities[0]).toMatchObject({ status: 'failed', reason: 'entity-not-in-ontology' });
  });

  it('fixes a fact predicate and verifies it', () => {
    const bad = fact({ predicate: 'loves', status: 'failed', reason: 'predicate-not-in-ontology' });
    const result = apply(edit({ kind: 'review-fix', fact: { predicate: 'enemy_of' } }), ENTITIES, [bad]);
    expect(result.facts[0]).toMatchObject({
      predicate: 'enemy_of',
      status: 'verified',
      issue: 'predicate-not-in-ontology',
    });
    expect(result.facts[0].reason).toBeUndefined();
  });

  it('fixes the object and refreshes objectName', () => {
    const bad = fact({ predicate: 'located_in', status: 'failed', reason: 'type-not-allowed' });
    const result = apply(edit({ kind: 'review-fix', fact: { objectId: 'hanoi' } }), ENTITIES, [bad]);
    expect(result.facts[0]).toMatchObject({ objectId: 'hanoi', objectName: 'Hanoi', status: 'verified' });
  });

  it('fixes a scalar value', () => {
    const bad = fact({
      kind: 'scalar',
      predicate: 'gender',
      value: 'robot',
      objectId: undefined,
      objectName: undefined,
      quote: 'Mai is a woman',
      status: 'failed',
      reason: 'value-not-allowed',
    });
    const result = apply(edit({ kind: 'review-fix', fact: { value: 'female' } }), ENTITIES, [bad]);
    expect(result.facts[0]).toMatchObject({ value: 'female', status: 'verified', issue: 'value-not-allowed' });
  });

  it('fixes a label', () => {
    const ontology: Ontology = {
      ...ONTOLOGY,
      predicates: [
        ...ONTOLOGY.predicates,
        { name: 'other', kind: 'relationship', subjectTypes: ['Persona'], objectTypes: ['Persona'], labeled: true },
      ],
    };
    const bad = fact({ predicate: 'other', status: 'failed', reason: 'label-missing' });
    const result = applyReviewEdit({
      chapter: CHAPTER,
      entities: ENTITIES,
      facts: [bad],
      edit: edit({ kind: 'review-fix', fact: { label: 'rival' } }),
      ontology,
    });
    expect(result.facts[0]).toMatchObject({ label: 'rival', status: 'verified' });
  });

  it('fails a fact fix that is still bad with the new reason', () => {
    const bad = fact({ status: 'failed', reason: 'predicate-not-in-ontology', predicate: 'loves' });
    const result = apply(edit({ kind: 'review-fix', fact: { predicate: 'gender' } }), ENTITIES, [bad]);
    expect(result.facts[0]).toMatchObject({ status: 'failed', reason: 'type-not-allowed' });
  });

  it('ignores fields that are not allowed in a fact fix', () => {
    const result = apply(edit({ kind: 'review-fix', fact: { predicate: 'enemy_of', status: 'rejected' } }));
    expect(result.facts[0]).toMatchObject({ status: 'verified', quote: 'Mai hated Lan' });
  });

  it('does not mutate the input', () => {
    const facts = [failedFact];
    const entities = ENTITIES.map((item) => ({ ...item }));
    const snapshot = JSON.stringify({ entities, facts });
    apply(edit({ kind: 'review-reject' }), entities, facts);
    apply(edit({ kind: 'review-fix', fact: { quote: 'x', predicate: 'enemy_of' } }), entities, facts);
    expect(JSON.stringify({ entities, facts })).toBe(snapshot);
  });

  it('re-evaluates conflicts after a fix that solves a name conflict', () => {
    const conflicted = [entity('a', 'Persona', 'Mai'), entity('b', 'Location', 'Mai')].map((item) => ({
      ...item,
      status: 'failed' as const,
      reason: 'name-conflict' as const,
    }));
    const result = apply(
      edit({ kind: 'review-fix', itemKind: 'entity', itemId: 'b', entity: { type: 'Character' } }),
      conflicted,
      [],
    );
    expect(result.entities.map((item) => item.status)).toEqual(['verified', 'verified']);
  });

  it('re-evaluates conflicts after a fix that creates a conflict', () => {
    const entities = [entity('a', 'Persona', 'Mai'), entity('b', 'Persona', 'Mai')];
    const result = apply(
      edit({ kind: 'review-fix', itemKind: 'entity', itemId: 'b', entity: { type: 'Location' } }),
      entities,
      [],
    );
    expect(result.entities.map((item) => item.reason)).toEqual(['name-conflict', 'name-conflict']);
  });

  it('clears a conflict when the other side is rejected', () => {
    const entities = [
      entity('a', 'Persona', 'Mai', { status: 'failed', reason: 'name-conflict', issue: 'name-conflict' }),
      entity('b', 'Location', 'Mai', { status: 'failed', reason: 'name-conflict', issue: 'name-conflict' }),
    ];
    const result = apply(edit({ kind: 'review-reject', itemKind: 'entity', itemId: 'b' }), entities, []);
    expect(result.entities[0]).toMatchObject({ status: 'verified', issue: 'name-conflict' });
    expect(result.entities[1].status).toBe('rejected');
  });
});

describe('chapterReviewStatus', () => {
  it('is clean without failed items or issues', () => {
    expect(chapterReviewStatus(ENTITIES, [fact()])).toBe('clean');
  });

  it('has issues while any item is failed', () => {
    const failed = fact({ status: 'failed', reason: 'quote-not-found', issue: 'quote-not-found' });
    expect(chapterReviewStatus(ENTITIES, [failed])).toBe('has-issues');
    expect(chapterReviewStatus([entity('x', 'Persona', 'X', { status: 'failed' })], [])).toBe('has-issues');
  });

  it('is reviewed when nothing failed but an item has an issue', () => {
    expect(chapterReviewStatus(ENTITIES, [fact({ status: 'accepted', issue: 'quote-not-found' })])).toBe('reviewed');
    const rejected = entity('x', 'Persona', 'X', { issue: 'words-not-found', status: 'rejected' });
    expect(chapterReviewStatus([rejected], [])).toBe('reviewed');
  });
});

describe('review issues', () => {
  const failed = (reason: AnalysisEntity['reason']): Partial<AnalysisEntity> => ({
    status: 'failed',
    reason,
    issue: reason,
  });
  const chapter = (index: number, entities: AnalysisEntity[], facts: AnalysisFact[] = []): ReviewChapter => ({
    index,
    title: `Chapter ${index}`,
    paragraphs: CHAPTER.paragraphs,
    entities,
    facts,
  });
  const CHAPTERS: ReviewChapter[] = [
    chapter(1, [entity('mai', 'Persona', 'Mai', failed('name-conflict')), entity('lan', 'Persona', 'Lan')]),
    chapter(2, [
      entity('mai-place', 'Location', 'Mai', failed('name-conflict')),
      entity('qiao', 'Persona', 'Qiao', { ...failed('alias-conflict'), aliases: ['Lan'] }),
      entity('ghost', 'Persona', 'Ghost', failed('words-not-found')),
    ]),
  ];
  const query = { novelId: 'n', status: 'open' as const, chapterIndex: null, itemKind: 'all' as const };

  it('groups a conflict of several chapters under one issue key', () => {
    const keys = reviewItems(CHAPTERS).map((item) => item.issueKey);
    expect(keys).toEqual([
      'name-conflict:mai',
      'name-conflict:mai',
      'alias-conflict:qiao',
      'words-not-found:2:entity:ghost',
    ]);
  });

  it('lists the entities named by a clashing alias', () => {
    const qiao = reviewItems(CHAPTERS).find((item) => item.entity?.id === 'qiao')!;
    expect(qiao.related).toEqual([{ name: 'Lan', type: 'Persona', chapters: [1] }]);
  });

  it('counts open issues and open errors once per issue', () => {
    expect(issueCounts(reviewItems(CHAPTERS))).toEqual({ open: 3, errors: 1 });
  });

  it('keeps every item of an issue that touches the filtered chapter', () => {
    const items = filterReviewItems(reviewItems(CHAPTERS), { ...query, chapterIndex: 1 });
    expect(items.map((item) => [item.chapterIndex, item.entity?.id])).toEqual([
      [1, 'mai'],
      [2, 'mai-place'],
    ]);
  });

  it('merges open warnings but never open errors or rejected items', () => {
    expect(isMergeable(entity('a', 'Persona', 'A', failed('label-missing')))).toBe(true);
    expect(isMergeable(entity('a', 'Persona', 'A', failed('quote-not-found')))).toBe(false);
    expect(isMergeable(entity('a', 'Persona', 'A', { status: 'rejected' }))).toBe(false);
  });
});
