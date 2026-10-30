import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { vi } from 'vitest';
import { defaultSettings } from '@dreamer/shared/models/settings';
import { NOVEL_STORE_VERSION } from '@dreamer/shared/models/novel-store';
import { ensureFolders, resolveAppPaths } from '@storage/paths';
import { loadMigrations } from '@storage/migrator';
import { novelFolder } from '../../main/features/library/library-files';
import { writeChapter, writeMetadata } from '../../main/features/library/novel/novel-files';
import {
  abortError,
  type StepContext,
  type PipelineDefinition,
} from '../../main/features/pipelines/pipeline-definition';
import { PipelineRegistry } from '../../main/features/pipelines/pipeline-registry';
import { WorkSlots } from '../../main/features/pipelines/work-slots';
import { AnalysisRuns } from '../../main/features/analysis/analysis-runs';
import { AnalysisSnapshots } from '../../main/features/analysis/analysis-snapshot';
import { TranslationRuns } from '../../main/features/translation/translation-runs';
import type { LlmService } from '../../main/features/llm/llm-service';
import type { SettingsStore } from '../../main/features/settings/settings-store';

vi.mock('electron', () => ({
  app: { getPath: () => 'appData', isPackaged: false, getAppPath: () => resolve('electron') },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock('../../main/ipc/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('../../main/logging/logger', () => ({
  initLogging: () => true,
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

export function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'dreamer-acceptance-'));
  const paths = resolveAppPaths(root);
  ensureFolders(paths);
  return { root, paths, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

export function sessionDeps(definitions: PipelineDefinition[] = []) {
  return {
    migrations: () => loadMigrations(resolve('electron/main/storage/migrations')),
    registry: new PipelineRegistry(definitions),
    limit: () => 1,
  };
}

export async function seedNovel(
  paths: ReturnType<typeof resolveAppPaths>,
  texts = ['Mai visited Hanoi.', 'Lan met Mai.'],
) {
  const id = randomUUID();
  const folder = novelFolder(paths, id);
  const chapters = await Promise.all(
    texts.map(async (text, index) => ({ title: `Chapter ${index + 1}`, ...(await writeChapter(folder, text)) })),
  );
  const novel = {
    formatVersion: NOVEL_STORE_VERSION,
    id,
    originalTitle: 'Original',
    title: 'Novel',
    author: 'Author',
    description: '',
    language: 'en',
    publication: 'ongoing' as const,
    tags: ['fantasy'],
    cover: null,
    importedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    chapters,
  };
  await writeMetadata(folder, novel);
  return { novel, folder };
}

export function context(paths: ReturnType<typeof resolveAppPaths>, params: object = {}) {
  const controller = new AbortController();
  const ctx: StepContext = {
    runId: randomUUID(),
    paths,
    params: { ...params },
    signal: controller.signal,
    progress: vi.fn(),
    enterStep: vi.fn(),
    setNovelId: vi.fn(),
    checkpoint: () => {
      if (controller.signal.aborted) throw abortError();
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { ctx, controller };
}

export async function execute(pipeline: PipelineDefinition, ctx: StepContext) {
  try {
    for (const step of pipeline.steps) await step.run?.(ctx);
  } catch (error) {
    await pipeline.cleanup?.(ctx);
    throw error;
  }
}

export function llmDeps(root: string) {
  const settings = defaultSettings(root);
  settings.llm.default = { cli: 'claude', model: null };
  const runForFeature = vi.fn();
  const status = vi.fn(async () => [
    { id: 'claude', state: 'installed', version: '1', path: 'claude', customPath: false },
  ]);
  return {
    settings: { get: () => settings } as SettingsStore,
    llm: { status, runForFeature } as unknown as LlmService,
    runs: new AnalysisRuns(),
    snapshots: new AnalysisSnapshots(),
    chapterSlots: new WorkSlots(() => 1),
    translationRuns: new TranslationRuns(),
    runForFeature,
    status,
    settingsValue: settings,
  };
}
