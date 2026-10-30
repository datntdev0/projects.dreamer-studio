import { describe, expect, it } from 'vitest';
import { desktopFixture, novelRoute, translatedChapter } from '../../../../tests/support/desktop-fixture';
import { NovelPage } from '../novel.page';

describe('[TH04-05] production reader language matching', () => {
  it('[L2-TH04-05-03] displays only the translation for the language selected in the actual reader', async () => {
    const app = desktopFixture();
    app.state.translations.set('vi/first', translatedChapter('first', 'vi', ['Vietnamese text.']));
    app.state.translations.set('en/first', translatedChapter('first', 'en', ['English text.']));
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('translation-reader-display-translation');
    expect(view.element('novel-reader-article').textContent).toContain('Vietnamese text.');
    await view.input('translation-reader-language', 'en', 'change');
    expect(view.element('novel-reader-article').textContent).toContain('English text.');
    expect(view.element('novel-reader-article').textContent).not.toContain('Vietnamese text.');
  });
});

describe('[TH03-03] production reader search highlights and typing guard', () => {
  it('[L2-TH03-03-01] opens a real search hit and highlights just its selected occurrence', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-page-tab-search');
    await view.input('novel-search-input', 'moon');
    view.element('novel-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await view.settle();
    const request = app.api.search.mock.calls[0][0];
    app.searchProgress.emit({
      searchId: request.searchId,
      done: 2,
      total: 2,
      totalHits: 2,
      totalChapters: 1,
      finished: true,
      hits: [
        { position: 1, file: 'first', paragraph: 0, pre: '', hit: 'moon', post: ' over moon' },
        { position: 1, file: 'first', paragraph: 0, pre: 'moon over ', hit: 'moon', post: '' },
      ],
    });
    await view.settle();
    const hits = view.fixture.nativeElement.ownerDocument.querySelectorAll('[data-testid="novel-search-hit"]');
    (hits[1] as HTMLButtonElement).click();
    await view.settle();
    const marks = view.element('novel-reader-article').querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0].classList.contains('current')).toBe(false);
    expect(marks[1].classList.contains('current')).toBe(true);
    await view.click('novel-reader-pager-next');
    expect(view.element('novel-reader-article').querySelector('mark')).toBeNull();
  });

  it('[L2-TH03-03-01] suppresses shortcuts from the real chapter search and resumes navigation outside it', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    view
      .element('novel-chapters-search')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    await view.settle();
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
    view
      .element('novel-reader-pager-next')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    await view.settle();
    expect(view.element('novel-reader-article').textContent).toContain('Second source.');
  });
});
