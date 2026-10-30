import { describe, expect, it } from 'vitest';
import { desktopFixture } from '../support/desktop-fixture';
import { ImportPage } from '../../src/features/library/import/import.page';
import type { PackageReadResult } from '@dreamer/shared/models/novel-package';

const preview: PackageReadResult = {
  status: 'ok',
  preview: {
    file: { name: 'novel.zip', size: 100, modifiedMs: 1 },
    formatVersion: 1,
    metadata: {
      formatVersion: 1,
      type: 'novel',
      originalTitle: 'Original',
      title: 'Novel',
      author: 'Author',
      description: '',
      tags: [],
      language: 'en',
      publication: 'ongoing',
      cover: null,
      chapters: [{ title: 'First', file: 'chapters/1.txt' }],
    },
    cover: null,
    ignoredFiles: [],
    warnings: [],
    chapters: [
      {
        index: 1,
        file: 'chapters/1.txt',
        title: 'First',
        bytes: 10,
        chars: 10,
        paragraphs: 1,
        hash: 'a'.repeat(64),
        warnings: [],
      },
    ],
  },
};

describe('[TH03-01] L2-TH03-01-01 production package import screen', () => {
  it('AC1/2 previews without importing and submits the title edited in the actual metadata component', async () => {
    const app = desktopFixture();
    app.api.readPackage.mockResolvedValue(preview);
    const view = await app.mount(ImportPage);
    await view.click('import-source-pick');
    expect(view.find('import-preview')).not.toBeNull();
    expect(app.api.importNovel).not.toHaveBeenCalled();
    await view.input('import-metadata-title', 'Edited title');
    await view.click('import-start');
    expect(app.api.importNovel).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'novel.zip',
        metadata: expect.objectContaining({ title: 'Edited title' }),
        chapters: [{ index: 1, title: 'First', included: true }],
      }),
    );
    expect(view.find('import-source-idle')).not.toBeNull();
    expect(view.find('import-preview')).toBeNull();
  });

  it('AC4 cancels the actual preview without importing its unsaved edits', async () => {
    const app = desktopFixture();
    app.api.readPackage.mockResolvedValue(preview);
    const view = await app.mount(ImportPage);
    await view.click('import-source-pick');
    await view.input('import-metadata-title', 'Unsaved title');
    await view.click('import-cancel');
    expect(view.find('import-source-idle')).not.toBeNull();
    expect(view.find('import-preview')).toBeNull();
    expect(app.api.importNovel).not.toHaveBeenCalled();
  });

  it('AC3 refuses a non-ZIP dropped on the actual source component and shows its reason', async () => {
    const app = desktopFixture();
    const view = await app.mount(ImportPage);
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [new File(['text'], 'unsafe.txt')] } });
    view.element('import-source').dispatchEvent(event);
    await view.settle();
    expect(view.element('import-source-refused').getAttribute('data-refusal')).toBe('notZip');
    expect(view.element('import-source-file').textContent).toContain('unsafe.txt');
    expect(app.api.readPackage).not.toHaveBeenCalled();
    expect(app.api.pathForFile).not.toHaveBeenCalled();
  });
});
