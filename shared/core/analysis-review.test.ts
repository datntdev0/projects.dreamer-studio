import { describe, expect, it } from 'vitest';
import type { WorldEditEntity, WorldFact, WorldIssue } from '../models/analysis';
import { filterReviewItems, issueCounts, reviewItems } from './analysis-review';

const PARAGRAPHS = ['Mai hated Lan in Hanoi.', 'Mai is a woman.'];
const CHAPTERS = [
  { index: 1, title: 'One', paragraphs: ['Nothing here.'] },
  { index: 2, title: 'Two', paragraphs: PARAGRAPHS },
];

function entity(id: string, name: string, over: Partial<WorldEditEntity> = {}): WorldEditEntity {
  return { id, type: 'Persona', name, aliases: [], titles: [], chapters: [2], ...over };
}

const FACT: WorldFact = {
  id: 'f-1',
  chapterIndex: 2,
  kind: 'relationship',
  predicate: 'enemy_of',
  subjectId: 'mai',
  objectId: 'lan',
  quote: 'Mai hated Lan',
};

const ISSUES: WorldIssue[] = [
  {
    key: 'label-missing:fact:2:f-1',
    reason: 'label-missing',
    severity: 'warning',
    entityIds: ['mai', 'lan'],
    fact: { factId: 'f-1', chapterIndex: 2 },
    chapters: [2],
    params: {},
  },
  {
    key: 'name-conflict:mai',
    reason: 'name-conflict',
    severity: 'warning',
    entityIds: ['mai', 'mai-place'],
    chapters: [1, 2],
    params: {},
  },
  {
    key: 'words-not-found:entity:ghost',
    reason: 'words-not-found',
    severity: 'error',
    entityIds: ['ghost'],
    chapters: [1],
    params: {},
  },
];

const MODEL = {
  state: {
    entities: [
      entity('mai', 'Mai'),
      entity('lan', 'Lan'),
      entity('mai-place', 'Mai', { type: 'Location' }),
      entity('ghost', 'Ghost', { chapters: [1] }),
    ],
    facts: [FACT],
  },
  issues: ISSUES,
};

describe('[TH04-01] reviewItems', () => {
  const items = reviewItems(MODEL, CHAPTERS);

  it('builds one item per issue with its entities, fact and chapter', () => {
    expect(items.map((item) => [item.issue.key, item.chapterIndex, item.chapterTitle])).toEqual([
      ['label-missing:fact:2:f-1', 2, 'Two'],
      ['name-conflict:mai', 1, 'One'],
      ['words-not-found:entity:ghost', 1, 'One'],
    ]);
    expect(items[0].fact).toBe(FACT);
    expect(items[0].entities.map((item) => item.id)).toEqual(['mai', 'lan']);
    expect(items[1].fact).toBeNull();
  });

  it('finds the quote of a fact and the name of an entity in the chapter text', () => {
    expect(items[0].context?.match).toBe('Mai hated Lan');
    expect(items[2].context).toBeNull();
    const conflict = reviewItems({ ...MODEL, issues: [{ ...ISSUES[1], chapters: [2] }] }, CHAPTERS)[0];
    expect(conflict.context?.match).toBe('Mai');
  });
});

describe('[TH04-01] filterReviewItems', () => {
  const items = reviewItems(MODEL, CHAPTERS);
  const query = { novelId: 'n', chapterIndex: null, itemKind: 'all' as const };

  it('filters by item kind', () => {
    expect(filterReviewItems(items, { ...query, itemKind: 'fact' })).toHaveLength(1);
    expect(filterReviewItems(items, { ...query, itemKind: 'entity' })).toHaveLength(2);
  });

  it('keeps issues that touch the chapter', () => {
    const keys = filterReviewItems(items, { ...query, chapterIndex: 2 }).map((item) => item.issue.key);
    expect(keys).toEqual(['label-missing:fact:2:f-1', 'name-conflict:mai']);
  });
});

describe('[TH04-01] issueCounts', () => {
  it('counts errors and warnings', () => {
    expect(issueCounts(ISSUES)).toEqual({ errors: 1, warnings: 2 });
  });
});
