import { describe, expect, it } from 'vitest';
import { desktopFixture, novelRoute, translatedChapter } from '../support/desktop-fixture';
import { TranslationPage } from '../../src/features/translation/translation.page';
import { NovelPage } from '../../src/features/library/novel.page';
import type { ChapterTranslation } from '@dreamer/shared/models/translation';

describe('[TH04-05] L2-TH04-05-03 production reader and chapter translation dialog', () => {
  it('AC5 displays original, translated or paired text from the real reader controls', async () => {
    const app = desktopFixture();
    app.state.translations.set('vi/first', translatedChapter());
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
    await view.click('translation-reader-display-translation');
    expect(view.element('novel-reader-article').textContent).toContain('Translated text.');
    expect(view.element('novel-reader-article').textContent).not.toContain('moon over moon');
    await view.click('translation-reader-display-side');
    expect(view.element('novel-reader-article').textContent).toContain('Translated text.');
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
  });

  it('AC5 never renders a late translation response for a previously selected chapter', async () => {
    const app = desktopFixture();
    app.state.translations.set('vi/second', translatedChapter('second', 'vi', ['Current translation.']));
    let resolveOld!: (value: ChapterTranslation) => void;
    app.api.translationChapter.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-reader-pager-next');
    await view.click('translation-reader-display-translation');
    expect(view.element('novel-reader-article').textContent).toContain('Current translation.');
    resolveOld(translatedChapter('first', 'vi', ['Obsolete translation.']));
    await view.settle();
    expect(view.element('novel-reader-article').textContent).toContain('Current translation.');
    expect(view.element('novel-reader-article').textContent).not.toContain('Obsolete translation.');
  });

  it('passes the range, explicit overwrite and instruction selected through the real content dialog', async () => {
    const app = desktopFixture();
    const view = await app.mount(TranslationPage, true);
    await view.click('translation-page-translate-chapters');
    const dialog = view.element('translate-dialog-content');
    await view.click('translate-dialog-mode-range', dialog);
    await view.input('translate-dialog-from', '2', 'input', dialog);
    await view.input('translate-dialog-to', '2', 'input', dialog);
    await view.click('translate-dialog-overwrite', dialog);
    expect(view.find('translate-dialog-edited-warning', dialog)).not.toBeNull();
    await view.click('instruction-toggle', dialog);
    await view.input('instruction-text', 'Shared instruction', 'input', dialog);
    await view.click('translate-dialog-start', dialog);
    const request = {
      novelId: 'novel',
      language: 'vi',
      mode: 'range',
      from: 2,
      to: 2,
      overwrite: true,
      instruction: 'Shared instruction',
    };
    expect(app.api.translationPlanContent).toHaveBeenLastCalledWith(request);
    expect(app.api.translationStartContent).toHaveBeenCalledWith(request);
    expect(dialog.querySelector('dialog')?.open).toBe(false);
  });
});
