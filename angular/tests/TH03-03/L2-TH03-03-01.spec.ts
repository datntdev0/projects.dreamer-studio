import { describe, expect, it } from 'vitest';
import { desktopFixture, novelRoute } from '../support/desktop-fixture';
import { NovelPage } from '../../src/features/library/novel.page';

describe('[TH03-03] L2-TH03-03-01 production novel reader', () => {
  it('AC1/2 opens the first chapter, navigates with real pager buttons and respects chapter boundaries', async () => {
    const app = desktopFixture();
    const route = novelRoute();
    const view = await app.mount(NovelPage, true, [route.provider]);
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
    expect((view.element('novel-reader-pager-prev') as HTMLButtonElement).disabled).toBe(true);
    await view.click('novel-reader-pager-next');
    expect(view.element('novel-reader-article').textContent).toContain('Second source.');
    expect((view.element('novel-reader-pager-next') as HTMLButtonElement).disabled).toBe(true);
    await view.click('novel-reader-pager-prev');
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
  });

  it('AC3 renders a missing-file error and retries from the actual reader button', async () => {
    const app = desktopFixture();
    app.api.getChapter.mockResolvedValueOnce(null);
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    expect(view.find('novel-reader-error')).not.toBeNull();
    await view.click('novel-reader-retry');
    expect(view.find('novel-reader-error')).toBeNull();
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
    expect(app.api.getChapter.mock.calls.filter(([request]) => request.file === 'first')).toHaveLength(2);
  });

  it('does not navigate the reader when Alt+ArrowRight originates from the real chapter search input', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    view
      .element('novel-chapters-search')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    await view.settle();
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    await view.settle();
    expect(view.element('novel-reader-article').textContent).toContain('Second source.');
  });
});
