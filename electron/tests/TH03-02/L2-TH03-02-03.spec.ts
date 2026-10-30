import { context, execute, seedNovel, sessionDeps, workspace } from '../support/fixtures';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDataSession } from '../../main/app/app-data-session';
import { novelExportPipeline } from '../../main/features/library/novel/novel-export-pipeline';
import { novelImportPipeline } from '../../main/features/library/novel/novel-import-pipeline';
import { readPackage, openPackageArchive } from '../../main/features/library/package-reader';
import { chapterPath, novelFolder } from '../../main/features/library/library-files';
import { readMetadata, writeMetadata } from '../../main/features/library/novel/novel-files';
import { vi } from 'vitest';

describe('[TH03-02] L2-TH03-02-03 delete/export data contract', () => {
  let work: ReturnType<typeof workspace>;
  beforeEach(() => {
    work = workspace();
  });
  afterEach(() => work.dispose());

  it('AC3/4 exports current chapter order and round-trips through a new library import', async () => {
    const { novel, folder } = await seedNovel(work.paths, ['first text', 'second text']);
    novel.chapters.reverse();
    novel.title = 'Current title';
    await writeMetadata(folder, novel);
    const outputPath = join(work.root, 'export.zip');
    await execute(novelExportPipeline, context(work.paths, { novelId: novel.id, outputPath }).ctx);
    const result = await readPackage(outputPath);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Export rejected');
    expect(result.preview.chapters.map((chapter) => chapter.title)).toEqual(['Chapter 2', 'Chapter 1']);
    const archive = await openPackageArchive(outputPath);
    try {
      expect(Buffer.from(await archive.read(result.preview.chapters[0].file, 'chapter', 10000)).toString('utf8')).toBe(
        'second text',
      );
    } finally {
      archive.close();
    }
    const target = workspace();
    try {
      const { ctx } = context(target.paths, {
        request: {
          path: outputPath,
          size: result.preview.file.size,
          modifiedMs: result.preview.file.modifiedMs,
          metadata: result.preview.metadata,
          cover: { kind: 'none' },
          chapters: result.preview.chapters.map((chapter) => ({
            index: chapter.index,
            title: chapter.title,
            included: true,
          })),
        },
      });
      await execute(novelImportPipeline, ctx);
      const imported = readMetadata(novelFolder(target.paths, vi.mocked(ctx.setNovelId).mock.calls[0][0]));
      expect(imported).toMatchObject({ title: novel.title, author: novel.author, chapters: novel.chapters });
      expect(imported?.id).not.toBe(novel.id);
    } finally {
      target.dispose();
    }
  });

  it.each(['cancel', 'missing-source'] as const)(
    'AC5 removes temporary output on %s and leaves an existing destination intact',
    async (reason) => {
      const { novel, folder } = await seedNovel(work.paths);
      const outputPath = join(work.root, 'export.zip');
      writeFileSync(outputPath, 'existing destination');
      const { ctx, controller } = context(work.paths, { novelId: novel.id, outputPath });
      await novelExportPipeline.steps[0].run?.(ctx);
      if (reason === 'missing-source') rmSync(chapterPath(folder, novel.chapters[0].file));
      else ctx.progress = () => controller.abort();
      await expect(
        execute({ ...novelExportPipeline, steps: novelExportPipeline.steps.slice(1) }, ctx),
      ).rejects.toThrow();
      expect(existsSync(`${outputPath}.tmp`)).toBe(false);
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(outputPath, 'utf8')).toBe('existing destination');
    },
  );

  it('AC1/2 removes owned data, deduplicates bulk selection and reports locked novels as skipped', async () => {
    const unlocked = await seedNovel(work.paths);
    const locked = await seedNovel(work.paths);
    const session = AppDataSession.open(work.root, sessionDeps());
    try {
      const now = new Date().toISOString();
      session.db.run(
        'INSERT INTO pipeline_run (id,type,status,progress,step_index,step_count,created_at,novel_id) VALUES (?,?,?,?,?,?,?,?)',
        ['lock', 'world-analysis', 'running', 0, 0, 1, now, locked.novel.id],
      );
      const result = await session.library.deleteNovels([unlocked.novel.id, locked.novel.id, unlocked.novel.id]);
      expect(result).toEqual({ deleted: [unlocked.novel.id], skipped: [locked.novel.id] });
      expect(existsSync(unlocked.folder.dir)).toBe(false);
      expect(existsSync(locked.folder.dir)).toBe(true);
    } finally {
      session.close();
    }
  });
});
