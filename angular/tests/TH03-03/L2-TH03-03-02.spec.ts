import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { desktopFixture, novelRoute } from '../support/desktop-fixture';
import { NovelPage } from '../../src/features/library/novel.page';

describe('[TH03-03] L2-TH03-03-02 production chapter organization', () => {
  it('AC3 moves chapters through the real selection controls/dialog and renders the saved order', async () => {
    const app = desktopFixture();
    const view = await app.mount(NovelPage, true, [novelRoute().provider]);
    await view.click('novel-chapters-organize');
    const list = view.element('novel-chapters-list');
    await vi.waitFor(() => expect(list.querySelectorAll('[data-testid="novel-chapters-row"]')).toHaveLength(2));
    const second = list.querySelector('[data-chapter-id="2"]')!;
    (second.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await view.settle();
    await view.click('novel-chapters-move');
    const dialog = view.element('chapter-dlg-move').closest('ds-dialog')!;
    await view.input('chapter-dlg-move-position', '1', 'input', dialog);
    const saved = {
      ...app.state.novels[0],
      chapters: [...app.state.novels[0].chapters]
        .reverse()
        .map((chapter, index) => ({ ...chapter, position: index + 1 })),
    };
    app.api.changeChapters.mockResolvedValueOnce(saved);
    await view.click('chapter-dlg-move-confirm', dialog);
    expect(app.api.changeChapters).toHaveBeenCalledWith({
      novelId: 'novel',
      change: { kind: 'move', chapters: [{ position: 2, file: 'second' }], toIndex: 0 },
    });
    expect(list.querySelector('[data-testid="novel-chapters-row"]')?.textContent).toContain('Second');
  });

  it.each([ErrorCode.NovelLocked, ErrorCode.ChapterChangeInvalid, ErrorCode.ChapterFileMissing])(
    'AC5 keeps chapter order visible and reports the failed merge: %s',
    async (code) => {
      const app = desktopFixture();
      const view = await app.mount(NovelPage, true, [novelRoute().provider]);
      await view.click('novel-chapters-organize');
      (view.element('novel-chapters-select-all').querySelector('input') as HTMLInputElement).click();
      await view.settle();
      await view.click('novel-chapters-merge');
      app.api.changeChapters.mockRejectedValueOnce({ code, message: 'Operation refused' });
      const dialog = view.element('chapter-dlg-merge').closest('ds-dialog')!;
      await view.click('chapter-dlg-merge-confirm', dialog);
      const rows = view.element('novel-chapters-list').querySelectorAll('[data-testid="novel-chapters-row"]');
      expect(rows[0].textContent).toContain('First');
      expect(rows[1].textContent).toContain('Second');
      expect(app.api.changeChapters).toHaveBeenCalledTimes(1);
      expect(view.element('toast').getAttribute('role')).toBe('alert');
    },
  );
});
