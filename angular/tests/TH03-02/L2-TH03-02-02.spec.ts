import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { desktopFixture } from '../support/desktop-fixture';
import { LibraryPage } from '../../src/features/library/library.page';

describe('[TH03-02] L2-TH03-02-02 metadata editing in the production library inspector', () => {
  it('AC1 saves from the actual form and refreshes both the list and inspector', async () => {
    const app = desktopFixture();
    const view = await app.mount(LibraryPage, true);
    await view.click('insp-edit');
    await view.input('insp-edit-display', ' Edited title ');
    await view.click('insp-edit-save');
    expect(app.api.updateNovel).toHaveBeenCalledWith(
      'novel',
      expect.objectContaining({ title: 'Edited title', cover: 'keep' }),
    );
    expect(view.element('lib-card-novel').textContent).toContain('Edited title');
    expect(view.element('library-inspector').querySelector('.library-inspector-header')?.textContent).toContain(
      'Edited title',
    );
    expect(view.find('insp-edit-save')).toBeNull();
  });

  it('AC2 refuses an empty title and shows required-field feedback without leaving the form', async () => {
    const app = desktopFixture();
    const view = await app.mount(LibraryPage, true);
    await view.click('insp-edit');
    await view.input('insp-edit-display', '   ');
    await view.click('insp-edit-save');
    expect(app.api.updateNovel).not.toHaveBeenCalled();
    expect(view.find('insp-edit-save')).not.toBeNull();
    expect(view.element('library-inspector').querySelector('[data-testid="field-error"]')).not.toBeNull();
  });

  it('AC2 retains the actual draft and displays a cover rejection from persistence', async () => {
    const app = desktopFixture();
    const view = await app.mount(LibraryPage, true);
    await view.click('insp-edit');
    await view.input('insp-edit-display', 'Draft title');
    app.api.updateNovel.mockRejectedValueOnce({ code: ErrorCode.CoverInvalid, message: 'Invalid cover' });
    await view.click('insp-edit-save');
    expect((view.element('insp-edit-display') as HTMLInputElement).value).toBe('Draft title');
    expect(view.element('library-inspector').querySelector('[data-testid="field-error"]')).not.toBeNull();
    expect(view.element('lib-card-novel').textContent).toContain('Novel');
  });

  it('AC3 saves cover replacement/removal from the form and updates the inspector image', async () => {
    const app = desktopFixture();
    const view = await app.mount(LibraryPage, true);
    app.api.pickImage.mockResolvedValueOnce({
      path: 'C:\\picked.png',
      name: 'picked.png',
      size: 100,
      previewUrl: 'data:image/png;base64,AA==',
    });
    await view.click('insp-edit');
    await view.click('insp-edit-cover-change');
    await view.click('insp-edit-save');
    expect(app.api.updateNovel).toHaveBeenLastCalledWith(
      'novel',
      expect.objectContaining({ cover: { path: 'C:\\picked.png' } }),
    );
    expect(view.element('library-inspector').querySelector('ds-library-cover img')?.getAttribute('src')).toContain(
      'library-file://cover/novel',
    );
    await view.click('insp-edit');
    await view.click('insp-edit-cover-remove');
    await view.click('insp-edit-save');
    expect(app.api.updateNovel).toHaveBeenLastCalledWith('novel', expect.objectContaining({ cover: 'remove' }));
    expect(view.element('library-inspector').querySelector('ds-library-cover img')).toBeNull();
  });

  it('AC4 lets the user continue editing or discard before selecting another novel', async () => {
    const app = desktopFixture();
    app.state.novels.push({ ...app.state.novels[0], id: 'other', title: 'Other novel' });
    const view = await app.mount(LibraryPage, true);
    await view.click('lib-card-novel');
    await view.click('insp-edit');
    await view.input('insp-edit-display', 'Unsaved draft');
    await view.click('lib-card-other');
    await view.click('novel-dlg-unsaved-keep');
    expect((view.element('insp-edit-display') as HTMLInputElement).value).toBe('Unsaved draft');
    await view.click('lib-card-other');
    await view.click('novel-dlg-unsaved-discard');
    expect(view.find('insp-edit-display')).toBeNull();
    expect(app.api.updateNovel).not.toHaveBeenCalled();
    expect(view.element('library-inspector').querySelector('.library-inspector-header')?.textContent).toContain(
      'Other novel',
    );
    expect(view.element('lib-card-novel').textContent).toContain('Novel');
  });
});
