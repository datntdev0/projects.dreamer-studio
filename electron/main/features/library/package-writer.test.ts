import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import type { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { decodeUtf8 } from '@dreamer/shared/core/novel-text';
import { resolveAppPaths, ensureFolders } from '@storage/paths';
import { novelFolder } from './library-files';
import { writeChapter, writeMetadata } from './novel/novel-files';
import { openPackageArchive, readPackage } from './package-reader';
import { buildPackageMetadata, writePackage } from './package-writer';
import { packageFormat } from './package-format';

vi.mock('electron', () => ({ app: { getPath: () => 'appData', isPackaged: false, getAppPath: () => join(process.cwd(), 'electron') } }));

const novel: NovelMetadata = {
  formatVersion: 1, id: 'id', originalTitle: 'Original', title: 'Title', author: 'Author', description: '',
  language: 'en', publication: 'ongoing', tags: [], cover: null, importedAt: '2026-01-01', updatedAt: '2026-01-01',
  chapters: [{ title: 'First', file: 'hash-a', paragraphs: 1, chars: 4 }, { title: 'Second', file: 'hash-b', paragraphs: 1, chars: 5 }],
};

describe('[TH03-02] buildPackageMetadata', () => {
  it('exports the current chapter order with portable numbered filenames', () => {
    expect(buildPackageMetadata(novel)).toMatchObject({
      type: 'novel', title: 'Title',
      chapters: [{ file: expect.stringContaining('0001'), title: 'First' }, { file: expect.stringContaining('0002'), title: 'Second' }],
    });
  });

  it('writes an archive that the package reader accepts with chapter order and text intact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dreamer-export-'));
    try {
      const paths = resolveAppPaths(root);
      ensureFolders(paths);
      const id = '12345678-1234-4abc-8def-1234567890ab';
      const folder = novelFolder(paths, id);
      const chapter = await writeChapter(folder, 'one\n\ntwo');
      const metadata: NovelMetadata = { ...novel, formatVersion: NOVEL_STORE_VERSION, id, chapters: [{ title: 'First', ...chapter }] };
      await writeMetadata(folder, metadata);
      const archive = join(root, 'export.zip');
      await writePackage(folder, metadata, archive, { checkpoint: () => undefined, progress: () => undefined });

      const result = await readPackage(archive);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.preview.metadata.chapters.map(({ title }) => title)).toEqual(['First']);
        expect(result.preview.chapters[0]).toMatchObject({ title: 'First', paragraphs: 2 });
        const zip = await openPackageArchive(archive);
        const exported = await zip.read(result.preview.metadata.chapters[0].file, 'chapter', packageFormat().chapterMaxBytes);
        zip.close();
        expect(decodeUtf8(exported)).toBe(`one${packageFormat().exportSeparator}two`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
