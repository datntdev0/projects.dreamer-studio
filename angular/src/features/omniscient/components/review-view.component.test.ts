import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../../../../tests/support/desktop-fixture';
import { OmniscientStore } from '../omniscient.store';
import { ReviewViewComponent } from './review-view.component';
import type { ReviewItem } from '@dreamer/shared/models/analysis';

describe('[TH04-01] ReviewViewComponent with the real review store', () => {
  it('[L2-TH04-01-02] reloads selected kind/chapter filters and renders their review results with source context', async () => {
    const app = desktopFixture();
    const entity: ReviewItem = {
      issue: {
        key: 'entity',
        reason: 'words-not-found',
        severity: 'error',
        entityIds: ['ghost'],
        chapters: [1],
        params: {},
      },
      entities: [{ id: 'ghost', type: 'Persona', name: 'Ghost', aliases: [], titles: [], chapters: [1] }],
      fact: null,
      chapterIndex: 1,
      chapterTitle: 'First',
      context: null,
    };
    const fact: ReviewItem = {
      issue: {
        key: 'fact',
        reason: 'quote-not-found',
        severity: 'error',
        entityIds: [],
        chapters: [2],
        params: {},
        fact: { factId: 'f', chapterIndex: 2 },
      },
      entities: [],
      fact: {
        id: 'f',
        chapterIndex: 2,
        kind: 'relationship',
        predicate: 'located_in',
        subjectId: 'mai',
        objectId: 'hanoi',
        quote: 'Bad quote',
      },
      chapterIndex: 2,
      chapterTitle: 'Second',
      context: { before: 'Source ', match: 'Mai', after: ' in Hanoi.' },
    };
    app.api.analysisReview.mockImplementation(async ({ itemKind, chapterIndex }) => ({
      items: [entity, fact].filter(
        (item) =>
          (itemKind === 'all' || (itemKind === 'entity') === (item.fact === null)) &&
          (chapterIndex === null || item.chapterIndex === chapterIndex),
      ),
      counts: { errors: 2, warnings: 0 },
    }));
    const view = await app.mount(ReviewViewComponent, false, [OmniscientStore]);
    expect(view.find('world-review-issue-entity')).not.toBeNull();
    expect(view.find('world-review-issue-fact')).not.toBeNull();
    expect(view.element('world-review-issue-fact').textContent).toContain('Second');
    expect(view.element('world-review-issue-fact').querySelector('mark')?.textContent).toBe('Mai');
    await view.input('world-review-kind', 'entity', 'change');
    expect(app.api.analysisReview).toHaveBeenLastCalledWith({
      novelId: 'novel',
      chapterIndex: null,
      itemKind: 'entity',
    });
    expect(view.find('world-review-issue-entity')).not.toBeNull();
    expect(view.find('world-review-issue-fact')).toBeNull();
    await view.input('world-review-chapter', '2', 'change');
    expect(view.find('world-review-issue-entity')).toBeNull();
    expect(view.find('world-review-empty')).not.toBeNull();
    await view.input('world-review-kind', 'fact', 'change');
    expect(app.api.analysisReview).toHaveBeenLastCalledWith({ novelId: 'novel', chapterIndex: 2, itemKind: 'fact' });
    expect(view.find('world-review-issue-fact')).not.toBeNull();
    expect(view.find('world-review-empty')).toBeNull();
  });
});
