import { context, execute, seedNovel, workspace } from '../support/fixtures';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import * as novelFiles from '../../main/features/library/novel/novel-files';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelImportRequest } from '@dreamer/shared/models/novel-package';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { importStagingDir, novelFolder } from '../../main/features/library/library-files';
import { readMetadata } from '../../main/features/library/novel/novel-files';
import { novelImportPipeline } from '../../main/features/library/novel/novel-import-pipeline';
import { readPackage } from '../../main/features/library/package-reader';
import { writePackage } from '../../main/features/library/package-writer';

describe('[TH03-01] L2-TH03-01-01 package import orchestration', () => {
  let work: ReturnType<typeof workspace>;
  let request: NovelImportRequest;
  beforeEach(async () => {
    work = workspace();
    const { novel, folder } = await seedNovel(work.paths);
    const path = join(work.root, 'source.zip');
    await writePackage(folder, novel, path, { checkpoint: vi.fn(), progress: vi.fn() });
    const result = await readPackage(path);
    if (result.status !== 'ok') throw new Error('Fixture package rejected');
    request = {
      path,
      size: result.preview.file.size,
      modifiedMs: result.preview.file.modifiedMs,
      metadata: { ...novel, title: 'Edited preview' },
      cover: { kind: 'none' },
      chapters: result.preview.chapters.map((chapter) => ({
        index: chapter.index,
        title: `Edited ${chapter.index}`,
        included: chapter.index === 1,
      })),
    };
  });
  afterEach(() => work.dispose());

  it('AC1/2/5 previews without writes and imports edited selections twice as distinct novels', async () => {
    const before = readdirSync(work.paths.library);
    await readPackage(request.path);
    expect(readdirSync(work.paths.library)).toEqual(before);
    const ids: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { ctx } = context(work.paths, { request });
      await execute(novelImportPipeline, ctx);
      const id = vi.mocked(ctx.setNovelId).mock.calls[0][0];
      ids.push(id);
      expect(readMetadata(novelFolder(work.paths, id))).toMatchObject({
        title: 'Edited preview',
        chapters: [{ title: 'Edited 1' }],
      });
      expect(existsSync(importStagingDir(work.paths, ctx.runId))).toBe(false);
    }
    expect(new Set(ids).size).toBe(2);
    expect(readdirSync(work.paths.library)).toHaveLength(before.length + 2);
  });

  it('AC3 reports corrupt archives safely and leaves the library untouched', async () => {
    const before = readdirSync(work.paths.library);
    const invalid = join(work.root, 'invalid.zip');
    writeFileSync(invalid, 'not an archive');
    expect(await readPackage(invalid)).toMatchObject({
      status: 'refused',
      refusal: expect.any(String),
      problems: expect.any(Array),
    });
    expect(readdirSync(work.paths.library)).toEqual(before);
  });

  it('AC4 cleans extracted staging data after cancellation without publishing a partial novel', async () => {
    const before = readdirSync(work.paths.library);
    const { ctx, controller } = context(work.paths, { request });
    await novelImportPipeline.steps[0].run?.(ctx);
    ctx.progress = () => controller.abort();
    await expect(execute({ ...novelImportPipeline, steps: novelImportPipeline.steps.slice(1) }, ctx)).rejects.toThrow();
    expect(existsSync(importStagingDir(work.paths, ctx.runId))).toBe(false);
    expect(readdirSync(work.paths.library)).toEqual(before);
    expect(ctx.setNovelId).not.toHaveBeenCalled();
  });

  it('rejects a package changed after preview before any extraction', async () => {
    const { ctx } = context(work.paths, { request: { ...request, size: request.size + 1 } });
    await expect(execute(novelImportPipeline, ctx)).rejects.toMatchObject({ code: ErrorCode.PackageChanged });
    expect(ctx.setNovelId).not.toHaveBeenCalled();
  });

  it('AC4 removes staging after a metadata write fails and never publishes the novel', async () => {
    const before = readdirSync(work.paths.library);
    const { ctx } = context(work.paths, { request });
    await novelImportPipeline.steps[0].run?.(ctx);
    await novelImportPipeline.steps[1].run?.(ctx);
    const failure = vi
      .spyOn(novelFiles, 'writeMetadata')
      .mockRejectedValueOnce(Object.assign(new Error('Disk full'), { code: 'ENOSPC' }));
    try {
      await expect(
        execute({ ...novelImportPipeline, steps: novelImportPipeline.steps.slice(2) }, ctx),
      ).rejects.toMatchObject({ code: ErrorCode.LibraryWriteFailed });
      expect(existsSync(importStagingDir(work.paths, ctx.runId))).toBe(false);
      expect(readdirSync(work.paths.library)).toEqual(before);
      expect(ctx.setNovelId).not.toHaveBeenCalled();
    } finally {
      failure.mockRestore();
    }
  });
});
