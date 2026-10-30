import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { desktopFixture, novelRoute } from '../support/desktop-fixture';
import { NovelPage } from '../../src/features/library/novel.page';

describe('[TH03-03] L2-TH03-03-03 chapter editor inside the production novel page', () => {
  it('AC1/2 saves normalized edits through the real store and updates reader title/text', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-page-edit');
    await view.input('chapter-editor-title', ' Updated ');
    await view.input('chapter-editor-content', 'First paragraph.\n\nSecond paragraph.');
    const chapter = { ...app.state.novels[0].chapters[0], title: 'Updated', file: 'changed', paragraphs: 2, chars: 33 };
    app.api.changeChapters.mockResolvedValueOnce({
      ...app.state.novels[0],
      chapters: [chapter, app.state.novels[0].chapters[1]],
    });
    app.api.getChapter.mockResolvedValue({ paragraphs: ['First paragraph.', 'Second paragraph.'] });
    await view.click('chapter-editor-save');
    expect(app.api.changeChapters).toHaveBeenCalledWith({
      novelId: 'novel',
      change: {
        kind: 'edit',
        chapter: { position: 1, file: 'first' },
        title: 'Updated',
        paragraphs: ['First paragraph.', 'Second paragraph.'],
      },
    });
    expect(view.find('chapter-editor')).toBeNull();
    expect(view.element('novel-reader-article').textContent).toContain('Updated');
    expect(view.element('novel-reader-article').textContent).toContain('Second paragraph.');
  });

  it.each(['chapter-editor-title', 'chapter-editor-content'])(
    'AC3 keeps the real editor open and shows validation when %s is empty',
    async (id) => {
      const app = desktopFixture();
      const view = await app.mount(NovelPage, true, [novelRoute().provider]);
      await view.click('novel-page-edit');
      await view.input(id, '   ');
      await view.click('chapter-editor-save');
      expect(app.api.changeChapters).not.toHaveBeenCalled();
      expect(view.find('chapter-editor')).not.toBeNull();
      expect(view.element('chapter-editor').querySelector('.ds-field-error')).not.toBeNull();
    },
  );

  it('AC4 offers continue/discard for dirty edits and restores the original reader on confirmed discard', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-page-edit');
    await view.input('chapter-editor-content', 'Unsaved draft.');
    await view.click('chapter-editor-cancel');
    await view.click('novel-dlg-unsaved-keep');
    expect((view.element('chapter-editor-content') as HTMLTextAreaElement).value).toBe('Unsaved draft.');
    await view.click('chapter-editor-cancel');
    await view.click('novel-dlg-unsaved-discard');
    expect(view.find('chapter-editor')).toBeNull();
    expect(app.api.changeChapters).not.toHaveBeenCalled();
    expect(view.element('novel-reader-article').textContent).toContain('moon over moon');
  });

  it('AC5 retains the draft and displays a lock refusal instead of returning to the reader', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-page-edit');
    await view.input('chapter-editor-content', 'Unsaved draft.');
    app.api.changeChapters.mockRejectedValueOnce({ code: ErrorCode.NovelLocked, message: 'Locked' });
    await view.click('chapter-editor-save');
    expect(view.find('chapter-editor-refused')).not.toBeNull();
    expect((view.element('chapter-editor-content') as HTMLTextAreaElement).value).toBe('Unsaved draft.');
    expect(view.find('novel-reader-article')).toBeNull();
  });
});
