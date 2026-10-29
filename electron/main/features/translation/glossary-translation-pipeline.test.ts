import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortError } from '../pipelines/pipeline-definition';
import type { StepContext } from '../pipelines/pipeline-definition';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { emptyIndex, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { resolveAppPaths, ensureFolders } from '@storage/paths';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import type { NovelMetadata } from '@dreamer/shared/models/novel-store';
import type { AnalysisIndexEntry, WorldEditEntity } from '@dreamer/shared/models/analysis';
import { writeChapter, writeMetadata } from '../library/novel/novel-files';
import { novelFolder } from '../library/library-files';
import { writeAnalysisIndex } from '../analysis/analysis-files';
import { readGlossary } from './translation-glossary';
import { glossaryTranslationPipeline } from './glossary-translation-pipeline';

vi.mock('electron', () => ({ app: { getPath: () => 'appData', isPackaged: false, getAppPath: () => join(process.cwd(), 'electron') } }));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));

describe('[TH04-05] glossaryTranslationPipeline', () => {
  let root = '';
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('[L2-TH04-05-02] keeps completed batches when cancelled before the next batch', async () => {
    root = mkdtempSync(join(tmpdir(), 'dreamer-glossary-'));
    const paths = resolveAppPaths(root);
    ensureFolders(paths);
    const novelId = '12345678-1234-4abc-8def-1234567890ab';
    const folder = novelFolder(paths, novelId);
    const chapter = await writeChapter(folder, 'Source chapter.');
    const novel: NovelMetadata = {
      formatVersion: NOVEL_STORE_VERSION, id: novelId, originalTitle: 'Original', title: 'Novel', author: '',
      description: '', language: 'zh', publication: 'ongoing', tags: [], cover: null,
      importedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      chapters: [{ title: 'Chapter', ...chapter }],
    };
    await writeMetadata(folder, novel);
    const entities = Array.from({ length: 51 }, (_, index) => ({
      id: `e${index}`, type: 'Persona', name: `Name ${index}`, aliases: [], titles: [], chapters: [1],
    }) as WorldEditEntity);
    const indexEntry: AnalysisIndexEntry = {
      index: 1, file: chapter.file, counts: { entities: 51, facts: 0 }, analysedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeAnalysisIndex(folder, upsertIndexEntry(emptyIndex(), indexEntry));

    let calls = 0;
    const runs = { set: vi.fn(), finish: vi.fn() };
    const deps = {
      settings: { get: () => ({ llm: { paths: {}, default: { cli: 'claude', model: null }, features: {} } }) },
      llm: {
        status: async () => [{ id: 'claude', state: 'installed', version: '1.0', path: 'claude', customPath: false }],
        runForFeature: async () => {
          calls++;
          if (calls === 1) return {
            value: { translations: Array.from({ length: 50 }, (_, index) => ({ id: index + 1, translation: `Name ${index} vi` })) },
            usage: null, durationMs: 1,
          };
          throw abortError();
        },
      },
      runs,
      snapshots: { get: async () => ({ model: { state: { entities } } }) },
    };
    const ctx = {
      runId: 'run-1', paths,
      params: { novelId, language: 'vi', scope: 'untranslated', batchSize: 50, instruction: null },
      signal: new AbortController().signal, progress: vi.fn(), enterStep: vi.fn(), checkpoint: vi.fn(),
      setNovelId: vi.fn(), log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as StepContext;

    const pipeline = glossaryTranslationPipeline(deps as never);
    await expect(pipeline.steps[1].run?.(ctx)).rejects.toMatchObject({ name: 'AbortError' });

    expect(calls).toBe(2);
    expect(readGlossary(folder, 'vi')).toHaveLength(50);
    expect(runs.finish).toHaveBeenCalledWith(novelId, expect.objectContaining({ translated: 50, failed: 0 }));
    expect(runs.finish).not.toHaveBeenCalledWith(novelId, expect.objectContaining({ translated: 51 }));
  });
});
