import { seedNovel, sessionDeps, workspace } from '../support/fixtures';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { AppDataSession } from '../../main/app/app-data-session';
import { coverPath } from '../../main/features/library/library-files';
import { readMetadata } from '../../main/features/library/novel/novel-files';

describe('[TH03-02] L2-TH03-02-02 metadata and cover persistence', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    session = AppDataSession.open(work.root, sessionDeps());
  });
  afterEach(() => {
    session.close();
    work.dispose();
  });

  it('AC1 commits valid metadata to both list and detail and restores it in a fresh session', async () => {
    await session.library.updateNovel({
      id: seed.novel.id,
      patch: {
        title: ' Edited title ',
        author: ' New author ',
        description: ' New description ',
        publication: 'completed',
        tags: ['Fantasy', 'Fantasy'],
      },
    });
    const expected = { title: 'Edited title', author: 'New author', publication: 'completed', tags: ['Fantasy'] };
    expect(session.library.list().find((novel) => novel.id === seed.novel.id)).toMatchObject(expected);
    expect(session.library.get(seed.novel.id)).toMatchObject({ ...expected, description: 'New description' });
    session.close();
    session = AppDataSession.open(work.root, sessionDeps());
    expect(session.library.get(seed.novel.id)).toMatchObject(expected);
  });

  it.each(['title', 'language'] as const)(
    'AC2 rejects an empty required %s without changing saved metadata',
    async (field) => {
      const before = readFileSync(seed.folder.metadata, 'utf8');
      await expect(session.library.updateNovel({ id: seed.novel.id, patch: { [field]: '   ' } })).rejects.toMatchObject(
        { code: ErrorCode.NovelMetadataInvalid },
      );
      expect(readFileSync(seed.folder.metadata, 'utf8')).toBe(before);
      expect(session.library.get(seed.novel.id).title).toBe(seed.novel.title);
    },
  );

  it('AC2 rejects invalid cover bytes without committing accompanying metadata changes', async () => {
    const invalid = join(work.root, 'invalid.png');
    writeFileSync(invalid, 'not an image');
    const before = readFileSync(seed.folder.metadata, 'utf8');
    await expect(
      session.library.updateNovel({ id: seed.novel.id, patch: { title: 'Must not commit', cover: { path: invalid } } }),
    ).rejects.toMatchObject({ code: ErrorCode.CoverInvalid });
    expect(readFileSync(seed.folder.metadata, 'utf8')).toBe(before);
    expect(session.library.get(seed.novel.id).hasCover).toBe(false);
  });

  it('AC3 persists a replacement cover and removes its owned file when the cover is cleared', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
      'base64',
    );
    const image = join(work.root, 'replacement.png');
    writeFileSync(image, png);
    expect(await session.library.updateNovel({ id: seed.novel.id, patch: { cover: { path: image } } })).toMatchObject({
      hasCover: true,
    });
    const cover = readMetadata(seed.folder)!.cover!;
    expect(readFileSync(coverPath(seed.folder, cover))).toEqual(png);
    expect(session.library.list().find((novel) => novel.id === seed.novel.id)?.hasCover).toBe(true);
    expect(await session.library.updateNovel({ id: seed.novel.id, patch: { cover: 'remove' } })).toMatchObject({
      hasCover: false,
    });
    expect(readMetadata(seed.folder)?.cover).toBeNull();
    expect(existsSync(coverPath(seed.folder, cover))).toBe(false);
    expect(readFileSync(image)).toEqual(png);
  });
});
