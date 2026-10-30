import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { desktopFixture, novelRoute, translatedChapter } from '../../../tests/support/desktop-fixture';
import { NovelPage } from './novel.page';

describe('[TH04-05] translation state through the production novel page', () => {
  it('clears visible translation and display state when the real page opens another novel', async () => {
    const app = desktopFixture();
    const route = novelRoute();
    app.state.novels.push({ ...app.state.novels[0], id: 'other', title: 'Other novel' });
    app.state.translations.set('vi/first', translatedChapter('first', 'vi', ['Old novel translation.']));
    app.api.translationChapter.mockImplementation(async ({ novelId }) =>
      novelId === 'novel' ? translatedChapter('first', 'vi', ['Old novel translation.']) : null,
    );
    const view = await app.mount(NovelPage, true, [route.provider]);
    await view.click('translation-reader-display-translation');
    expect(view.element('novel-reader-article').textContent).toContain('Old novel translation.');
    route.params.next(convertToParamMap({ id: 'other' }));
    await view.settle();
    expect(view.element('novel-reader-article').getAttribute('data-display')).toBe('original');
    expect(view.element('novel-reader-article').textContent).not.toContain('Old novel translation.');
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
  });

  it('restores each novel view language through the actual reader selector when revisiting it', async () => {
    const app = desktopFixture();
    const route = novelRoute();
    app.state.novels.push({ ...app.state.novels[0], id: 'other' });
    const view = await app.mount(NovelPage, true, [route.provider]);
    await view.input('translation-reader-language', 'en', 'change');
    route.params.next(convertToParamMap({ id: 'other' }));
    await view.settle();
    expect((view.element('translation-reader-language') as HTMLSelectElement).value).toBe('vi');
    route.params.next(convertToParamMap({ id: 'novel' }));
    await view.settle();
    expect((view.element('translation-reader-language') as HTMLSelectElement).value).toBe('en');
    expect(app.api.translationInstruction).toHaveBeenCalledWith({ novelId: 'novel', language: 'en' });
  });
});
