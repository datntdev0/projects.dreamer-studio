import { describe, expect, it } from 'vitest';
import { desktopFixture, novelRoute } from '../../../tests/support/desktop-fixture';
import { NovelPage } from './novel.page';

describe('[TH03-03] NovelPage focus mode with production panels', () => {
  it('[L2-TH03-03-01] hides both side panels and restores them with Escape while keeping the reader visible', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    expect(view.find('novel-page-chapters-panel')).not.toBeNull();
    expect(view.find('novel-page-novel-panel')).not.toBeNull();
    await view.click('novel-page-focus');
    expect(view.find('novel-page-chapters-panel')).toBeNull();
    expect(view.find('novel-page-novel-panel')).toBeNull();
    expect(view.find('novel-reader-article')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await view.settle();
    expect(view.find('novel-page-chapters-panel')).not.toBeNull();
    expect(view.find('novel-page-novel-panel')).not.toBeNull();
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
  });
});
