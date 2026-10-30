import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import type { AnalysisIndexEntry, AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import type { LlmFeatureId, LlmFeatureRunRequest, LlmRunResult } from '@dreamer/shared/models/llm';
import type { PipelineStepDetail } from '@dreamer/shared/models/pipeline';
import { NOVEL_STORE_VERSION, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { defaultSettings } from '@dreamer/shared/models/settings';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import { broadcast } from '../../ipc/broadcast';
import { LlmRunOptions, LlmService } from '../llm/llm-service';
import { novelFolder, NovelFolder } from '../library/library-files';
import { writeChapter, writeMetadata } from '../library/novel/novel-files';
import { abortError, PipelineDefinition, StepContext } from '../pipelines/pipeline-definition';
import { WorkSlots } from '../pipelines/work-slots';
import { SettingsStore } from '../settings/settings-store';
import { readAnalysisIndex, readChapterResult } from './analysis-files';
import { novelOntologyFile } from './analysis-ontology';
import { AnalysisRuns } from './analysis-runs';
import { worldAnalysisPipeline } from './world-analysis-pipeline';

vi.mock('electron', () => ({
  app: {
    getPath: (): string => 'appData',
    isPackaged: false,
    getAppPath: (): string => join(process.cwd(), 'electron'),
  },
  shell: { openPath: vi.fn() },
}));
vi.mock('../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const texts: string[] = [
  'Mai Linh walked into Hanoi. She met Lan there.',
  'Lan lived in Hanoi.',
  'Mai Linh hated Lan.',
];
const quotes: string[] = ['Mai Linh walked into Hanoi.', 'Lan lived in Hanoi.', 'Mai Linh hated Lan.'];

type Reply = unknown;

interface Call {
  kind: 'candidates' | 'predicates';
  chapters: number[];
  prompt: string;
}

interface Script {
  candidates?(chapters: number[], call: number): Reply;
  predicates?(chapter: number, call: number): Reply;
}

let tempRoot: string;
let paths: AppPaths;
let folder: NovelFolder;
let calls: Call[];
let script: Script;
let runs: AnalysisRuns;
let pipeline: PipelineDefinition;
let controller: AbortController;
let progress: ReturnType<typeof vi.fn>;
let enteredSteps: Array<{ key: string; detail: PipelineStepDetail | null }>;
let promptFiles: Array<string | undefined>;

function defaultCandidates(chapters: number[]): Reply {
  const all: { type: string; name: string; aliases: string[] }[] = [
    { type: 'Persona', name: 'Mai Linh', aliases: [] },
    { type: 'Persona', name: 'Lan', aliases: [] },
    { type: 'Location', name: 'Hanoi', aliases: [] },
  ];
  const text: string = chapters.map((chapter: number): string => texts[chapter - 1]).join(' ');
  return { entities: all.filter((item): boolean => text.includes(item.name)) };
}

function fact(predicate: string, subject: string, object: string, quote: string): object {
  return { predicate, subject, object, value: null, label: null, quote };
}

function defaultPredicates(chapter: number): Reply {
  const facts: object[] = [
    fact('located_in', 'Mai Linh', 'Hanoi', quotes[0]),
    fact('located_in', 'Lan', 'Hanoi', quotes[1]),
    fact('enemy_of', 'Mai Linh', 'Lan', quotes[2]),
  ];
  return { facts: [facts[chapter - 1]] };
}

function chaptersIn(prompt: string): number[] {
  return [...prompt.matchAll(/## Chapter (\d+):/g)].map((match: RegExpMatchArray): number => Number(match[1]));
}

function fakeLlm(): LlmService {
  const runForFeature = (
    _feature: LlmFeatureId,
    request: LlmFeatureRunRequest,
    options: LlmRunOptions = {},
  ): Promise<LlmRunResult> => {
    promptFiles.push(options.promptFile);
    const chapters: number[] = chaptersIn(request.prompt);
    const kind: Call['kind'] = request.prompt.startsWith('Extract named entities') ? 'candidates' : 'predicates';
    calls.push({ kind, chapters, prompt: request.prompt });
    const count: number = calls.filter((call: Call): boolean => call.kind === kind).length;
    const reply: Reply =
      kind === 'candidates'
        ? (script.candidates?.(chapters, count) ?? defaultCandidates(chapters))
        : (script.predicates?.(chapters[0], count) ?? defaultPredicates(chapters[0]));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ value: reply, usage: null, durationMs: 1 });
  };
  const status = (): Promise<object[]> =>
    Promise.resolve([{ id: 'claude', state: 'installed', version: '1', path: 'claude', customPath: false }]);
  return { status, runForFeature } as unknown as LlmService;
}

function fakeSettings(withLlm: boolean): SettingsStore {
  const settings = defaultSettings(tempRoot);
  if (withLlm) settings.llm.features.worldAnalysis = { cli: 'claude', model: null };
  return { get: (): typeof settings => settings } as unknown as SettingsStore;
}

function setup(withLlm: boolean = true): void {
  pipeline = worldAnalysisPipeline({
    llm: fakeLlm(),
    settings: fakeSettings(withLlm),
    runs,
    chapterSlots: new WorkSlots((): number => 1),
  });
}

function request(overrides: Partial<AnalysisRunRequest> = {}): AnalysisRunRequest {
  return { novelId, mode: 'full', from: null, to: null, overwrite: false, stage: 'all', batchSize: 2, ...overrides };
}

function context(params: AnalysisRunRequest): StepContext {
  return {
    runId: 'run-1',
    paths,
    params: params as unknown as Record<string, unknown>,
    signal: controller.signal,
    progress: progress as unknown as StepContext['progress'],
    enterStep: (key: string, detail: PipelineStepDetail | null): void => {
      enteredSteps.push({ key, detail });
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as StepContext['log'],
    checkpoint: (): void => {
      if (controller.signal.aborted) throw abortError();
    },
    setNovelId: vi.fn(),
  };
}

async function runStep(index: number, params: AnalysisRunRequest = request()): Promise<void> {
  await pipeline.steps[index].run?.(context(params));
}

async function runAll(params: AnalysisRunRequest = request()): Promise<void> {
  await runStep(0, params);
  await runStep(1, params);
}

function callsOf(kind: Call['kind']): Call[] {
  return calls.filter((call: Call): boolean => call.kind === kind);
}

function analysedChapters(): number[] {
  return callsOf('predicates').map((call: Call): number => call.chapters[0]);
}

function indexEntries(): AnalysisIndexEntry[] {
  return readAnalysisIndex(folder)?.chapters ?? [];
}

function entry(index: number): AnalysisIndexEntry {
  return indexEntries().find((item: AnalysisIndexEntry): boolean => item.index === index)!;
}

async function writeNovel(): Promise<void> {
  folder = novelFolder(paths, novelId);
  const chapters: NovelMetadata['chapters'] = [];
  for (const [position, text] of texts.entries()) {
    const written = await writeChapter(folder, text);
    chapters.push({
      title: `Chapter ${position + 1}`,
      file: written.file,
      paragraphs: written.paragraphs,
      chars: written.chars,
    });
  }
  await writeMetadata(folder, {
    formatVersion: NOVEL_STORE_VERSION,
    id: novelId,
    originalTitle: 'Novel',
    title: 'Novel',
    author: '',
    description: '',
    language: 'en',
    publication: 'ongoing',
    tags: [],
    cover: null,
    importedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    chapters,
  });
}

function progressSteps(): string[] {
  return vi
    .mocked(broadcast)
    .mock.calls.filter(([channel]): boolean => channel === AnalysisChannel.Progress)
    .map(([, payload]): string => (payload as { step: string }).step);
}

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'dreamer-world-analysis-'));
  paths = resolveAppPaths(tempRoot);
  calls = [];
  script = {};
  controller = new AbortController();
  progress = vi.fn();
  enteredSteps = [];
  promptFiles = [];
  runs = new AnalysisRuns();
  vi.mocked(broadcast).mockClear();
  await writeNovel();
  setup();
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('[TH04-01] world analysis pipeline definition', () => {
  it('has check, candidates and predicates steps', () => {
    expect(pipeline.type).toBe('world-analysis');
    expect(pipeline.overallProgress).toBe(true);
    expect(pipeline.steps.map((step) => step.key)).toEqual([
      'analysis.run.step.check',
      'analysis.run.step.candidates',
      'analysis.run.step.predicates',
    ]);
    expect(pipeline.steps[2].run).toBeUndefined();
  });
});

describe('[TH04-01] precondition', () => {
  it('fails with LLM_NOT_AVAILABLE when no LLM is chosen', async () => {
    setup(false);
    await expect(runStep(0)).rejects.toMatchObject({ code: ErrorCode.LlmNotAvailable });
    expect(calls).toHaveLength(0);
  });

  it('fails with ONTOLOGY_INVALID for a broken ontology', async () => {
    mkdirSync(folder.analysis, { recursive: true });
    writeFileSync(novelOntologyFile(folder), 'version: [\n');
    await expect(runStep(0)).rejects.toMatchObject({ code: ErrorCode.OntologyInvalid });
  });

  it('fails with ANALYSIS_NOTHING_TO_RUN when no chapter is queued', async () => {
    await runAll();
    await expect(runStep(0, request({ mode: 'missing' }))).rejects.toMatchObject({
      code: ErrorCode.AnalysisNothingToRun,
    });
  });

  it('copies the default ontology into the novel on the first run', async () => {
    const file: string = novelOntologyFile(folder);
    await runStep(0);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('has_persona');
  });

  it('keeps an existing ontology', async () => {
    await runStep(0);
    const file: string = novelOntologyFile(folder);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n# custom\n`);
    await runStep(0);
    expect(readFileSync(file, 'utf8')).toContain('# custom');
  });
});

describe('[TH04-01] analyse', () => {
  it('batches candidates, runs predicates per chapter and saves results', async () => {
    await runAll(request({ batchSize: 2 }));
    expect(callsOf('candidates').map((call: Call): number[] => call.chapters)).toEqual([[1, 2], [3]]);
    expect(analysedChapters()).toEqual([1, 2, 3]);
    expect(enteredSteps).toEqual([
      {
        key: 'analysis.run.step.candidates',
        detail: { key: 'analysis.run.detail.chapters', params: { batch: 1, batches: 2, from: 1, to: 2 } },
      },
      {
        key: 'analysis.run.step.predicates',
        detail: { key: 'analysis.run.detail.chapter', params: { batch: 1, batches: 2, chapter: 1 } },
      },
      {
        key: 'analysis.run.step.predicates',
        detail: { key: 'analysis.run.detail.chapter', params: { batch: 1, batches: 2, chapter: 2 } },
      },
      {
        key: 'analysis.run.step.candidates',
        detail: { key: 'analysis.run.detail.chapter', params: { batch: 2, batches: 2, chapter: 3 } },
      },
      {
        key: 'analysis.run.step.predicates',
        detail: { key: 'analysis.run.detail.chapter', params: { batch: 2, batches: 2, chapter: 3 } },
      },
    ]);
    for (const position of texts.keys()) {
      const saved = readChapterResult(folder, entry(position + 1).file)!;
      expect(saved.index).toBe(position + 1);
      expect(saved.llm).toContain('Claude');
      expect(saved.facts).toHaveLength(1);
      expect(saved.facts[0].quote).toBe(quotes[position]);
    }
    expect(indexEntries().map((item: AnalysisIndexEntry): string | undefined => item.error)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(entry(1).counts).toEqual({ entities: 3, facts: 1 });
    expect(readAnalysisIndex(folder)?.lastRun).toMatchObject({ runId: 'run-1', analysed: 3, failed: 0, issues: 0 });
  });

  it('saves the raw result of a chapter with a bad quote and counts the issue in lastRun', async () => {
    script.predicates = (chapter: number): Reply =>
      chapter === 3 ? { facts: [fact('located_in', 'Mai Linh', 'Hanoi', 'Never said.')] } : defaultPredicates(chapter);
    await runAll();
    expect(entry(3).counts).toEqual({ entities: 2, facts: 1 });
    expect(readChapterResult(folder, entry(3).file)!.facts[0]).toMatchObject({ quote: 'Never said.' });
    expect(Number.isNaN(Date.parse(entry(3).analysedAt))).toBe(false);
    expect(callsOf('predicates').filter((call: Call): boolean => call.chapters[0] === 3)).toHaveLength(3);
    expect(readAnalysisIndex(folder)?.lastRun).toMatchObject({ analysed: 3, failed: 0, issues: 1 });
  });

  it('fails only the chapter whose predicate call never returns valid JSON', async () => {
    script.predicates = (chapter: number): Reply =>
      chapter === 2 ? new CodedError(ErrorCode.LlmBadOutput, 'bad') : defaultPredicates(chapter);
    await runAll();
    expect(entry(2)).toMatchObject({ error: ErrorCode.AnalysisLlmOutputInvalid });
    expect(entry(1).error).toBeUndefined();
    expect(entry(3).error).toBeUndefined();
    expect(readChapterResult(folder, entry(1).file)).not.toBeNull();
    expect(readChapterResult(folder, entry(2).file)).toBeNull();
    expect(readAnalysisIndex(folder)?.lastRun).toMatchObject({ analysed: 2, failed: 1 });
  });

  it('fails every chapter of a batch when its candidates are unusable', async () => {
    script.candidates = (chapters: number[]): Reply =>
      chapters.includes(1) ? new CodedError(ErrorCode.LlmBadOutput, 'bad') : defaultCandidates(chapters);
    await runAll();
    expect([entry(1).error, entry(2).error, entry(3).error].map((error) => error !== undefined)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('stops the run when the LLM is not signed in', async () => {
    script.candidates = (): Reply => new CodedError(ErrorCode.LlmNotSignedIn, 'out');
    await expect(runAll()).rejects.toMatchObject({ code: ErrorCode.LlmNotSignedIn });
    expect(indexEntries()).toHaveLength(0);
  });

  it('keeps finished chapters and writes lastRun when cancelled', async () => {
    script.candidates = (chapters: number[]): Reply => {
      if (chapters.includes(2)) {
        controller.abort();
        return abortError();
      }
      return defaultCandidates(chapters);
    };
    await expect(runAll(request({ batchSize: 1 }))).rejects.toMatchObject({ name: 'AbortError' });
    expect(readChapterResult(folder, entry(1).file)).not.toBeNull();
    expect(indexEntries()).toHaveLength(1);
    expect(readAnalysisIndex(folder)?.lastRun).toMatchObject({ analysed: 1, failed: 0 });
  });

  it('skips analysed chapters in missing mode', async () => {
    await runAll(request({ mode: 'range', from: 1, to: 1 }));
    calls = [];
    await runAll(request({ mode: 'missing' }));
    expect(analysedChapters()).toEqual([2, 3]);
  });

  it('skips up-to-date chapters in range mode without overwrite', async () => {
    await runAll(request({ mode: 'range', from: 1, to: 1 }));
    calls = [];
    await runAll(request({ mode: 'range', from: 1, to: 3, overwrite: false }));
    expect(analysedChapters()).toEqual([2, 3]);
  });

  it('re-runs up-to-date chapters with overwrite', async () => {
    await runAll(request({ mode: 'range', from: 1, to: 1 }));
    calls = [];
    await runAll(request({ mode: 'range', from: 1, to: 3, overwrite: true }));
    expect(analysedChapters()).toEqual([1, 2, 3]);
  });

  it('keeps the other types when the stage is one type', async () => {
    await runAll(request({ mode: 'range', from: 1, to: 1 }));
    calls = [];
    script.candidates = (): Reply => ({ entities: [{ type: 'Location', name: 'Hanoi', aliases: [] }] });
    await runAll(request({ mode: 'range', from: 1, to: 1, overwrite: true, stage: 'Location' }));
    const saved = readChapterResult(folder, entry(1).file)!;
    expect(saved.entities.map((item) => item.name).sort()).toEqual(['Hanoi', 'Lan', 'Mai Linh']);
    expect(callsOf('candidates')[0].prompt).not.toContain('- Persona:');
    expect(callsOf('predicates')[0].prompt).toContain('Persona: Mai Linh');
  });

  it('broadcasts progress for candidates, predicates and verification', async () => {
    await runAll(request({ batchSize: 3 }));
    const steps: string[] = progressSteps();
    expect(steps).toEqual(expect.arrayContaining(['candidates', 'predicates', 'verification']));
    expect(steps[0]).toBe('candidates');
    const last = vi
      .mocked(broadcast)
      .mock.calls.filter(([channel]) => channel === AnalysisChannel.Progress)
      .at(-1)![1];
    expect(last).toMatchObject({ novelId, done: 3, total: 3, failed: 0 });
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(runs.get(novelId)).toMatchObject({ done: 3, total: 3 });
  });

  it('gives every LLM call a numbered prompt file named after the call under logs/prompts/<run-id>', async () => {
    await runAll(request({ batchSize: 2 }));
    const dir: string = join(paths.promptLogs, 'run-1');
    expect(promptFiles.every((file) => file !== undefined && dirname(file) === dir)).toBe(true);
    expect(promptFiles.map((file) => basename(file!))).toEqual([
      '001-candidates-ch001-002-a1.md',
      '002-predicates-ch001-a1.md',
      '003-predicates-ch002-a1.md',
      '004-candidates-ch003-003-a1.md',
      '005-predicates-ch003-a1.md',
    ]);
  });

  it('numbers a retry as the next file with the next attempt', async () => {
    script.predicates = (chapter: number, call: number): Reply =>
      chapter === 1 && call === 1 ? { facts: [fact('flies to', 'Mai Linh', 'Lan', 'Not in the text.')] } : undefined;
    await runAll(request({ batchSize: 3 }));
    expect(promptFiles.map((file) => basename(file!)).slice(0, 3)).toEqual([
      '001-candidates-ch001-003-a1.md',
      '002-predicates-ch001-a1.md',
      '003-predicates-ch001-a2.md',
    ]);
  });
});
