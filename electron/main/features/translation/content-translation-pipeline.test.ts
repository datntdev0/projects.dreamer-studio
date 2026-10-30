import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { resolveAppPaths, ensureFolders } from '@storage/paths';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import type { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { writeChapter, writeMetadata } from '../library/novel/novel-files';
import { novelFolder } from '../library/library-files';
import type { StepContext } from '../pipelines/pipeline-definition';
import { WorkSlots } from '../pipelines/work-slots';
import { contentTranslationPipeline } from './content-translation-pipeline';
import { readChapterTranslation, readTranslationIndex, saveTranslationEntry } from './translation-index';

vi.mock('electron', () => ({ app: { getPath: () => 'appData', isPackaged: false, getAppPath: () => join(process.cwd(), 'electron') } }));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));

describe('[TH04-05] contentTranslationPipeline', () => {
  let root = '';
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('[L2-TH04-05-03] keeps a completed chapter and continues after another chapter times out', async () => {
    root = mkdtempSync(join(tmpdir(), 'dreamer-content-translation-'));
    const paths = resolveAppPaths(root);
    ensureFolders(paths);
    const novelId = '12345678-1234-4abc-8def-1234567890ab';
    const folder = novelFolder(paths, novelId);
    const written = await Promise.all([writeChapter(folder, 'First source.'), writeChapter(folder, 'Second source.')]);
    const novel: NovelMetadata = {
      formatVersion: NOVEL_STORE_VERSION, id: novelId, originalTitle: 'Original', title: 'Novel', author: '',
      description: '', language: 'zh', publication: 'ongoing', tags: [], cover: null,
      importedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      chapters: written.map((chapter, index) => ({ title: `Chapter ${index + 1}`, ...chapter })),
    };
    await writeMetadata(folder, novel);
    const instructionHash = 'current-instruction';
    await saveTranslationEntry(
      folder,
      'vi',
      novel.chapters,
      {
        index: 1, file: written[0].file, title: 'My edit', issues: 0, edited: true,
        instructionHash, glossaryUsed: [], translatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        version: 1, file: written[0].file, title: 'My edit', paragraphs: ['User text.'], issues: [],
        translatedAt: '2026-01-02T00:00:00.000Z',
      },
    );
    let calls = 0;
    const runs = { set: vi.fn(), finish: vi.fn() };
    const deps = {
      settings: { get: () => ({ llm: { paths: {}, default: { cli: 'claude', model: null }, features: {} } }) },
      llm: {
        status: async () => [{ id: 'claude', state: 'installed', version: '1.0', path: 'claude', customPath: false }],
        runForFeature: async () => {
          calls++;
          if (calls === 2) throw new CodedError(ErrorCode.LlmTimeout, 'timeout');
          return { value: { title: 'Translated title', paragraphs: ['Translated text.'] }, usage: null, durationMs: 1 };
        },
      },
      runs,
      snapshots: {},
      chapterSlots: new WorkSlots(() => 1),
    };
    const ctx = {
      runId: 'run-1', paths,
      params: { novelId, language: 'vi', mode: 'full', from: null, to: null, overwrite: true, instruction: null },
      signal: new AbortController().signal, progress: vi.fn(), enterStep: vi.fn(), checkpoint: vi.fn(),
      setNovelId: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as StepContext;

    const pipeline = contentTranslationPipeline(deps as never);
    await expect(pipeline.steps[1].run?.(ctx)).resolves.toBeUndefined();

    const index = readTranslationIndex(folder, 'vi');
    expect(readChapterTranslation(folder, 'vi', written[0].file)).toMatchObject({
      title: 'Translated title', paragraphs: ['Translated text.'],
    });
    expect(index?.chapters[0]).toMatchObject({ title: 'Translated title', edited: false });
    expect(index?.chapters.map((chapter) => chapter.error ?? chapter.title)).toEqual([
      'Translated title', ErrorCode.LlmTimeout,
    ]);
    expect(runs.finish).toHaveBeenCalledWith(novelId, expect.objectContaining({ translated: 1, failed: 1 }));
  });
});
