import { context, execute, llmDeps, seedNovel, workspace } from '../support/fixtures';
import { persona, seedAnalysis } from '../support/analysis';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { AnalysisRunRequest } from '@dreamer/shared/models/analysis';
import { checkAnalysisRun, WorldAnalysisPipeline } from '../../main/features/analysis/world-analysis-pipeline';
import { novelOntologyFile } from '../../main/features/analysis/analysis-ontology';
import { readAnalysisIndex, readChapterResult } from '../../main/features/analysis/analysis-files';

describe('[TH04-01] L2-TH04-01-01 analysis orchestration', () => {
  let work: ReturnType<typeof workspace>;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let deps: ReturnType<typeof llmDeps>;
  let request: AnalysisRunRequest;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    deps = llmDeps(work.root);
    request = {
      novelId: seed.novel.id,
      mode: 'full',
      from: null,
      to: null,
      overwrite: false,
      stage: 'all',
      batchSize: 2,
    };
    deps.runForFeature.mockImplementation(async (_feature, input) => ({
      value: input.prompt.startsWith('Extract named entities')
        ? { entities: [{ type: 'Persona', name: 'Mai', aliases: [] }] }
        : { facts: [] },
      usage: null,
      durationMs: 1,
    }));
  });
  afterEach(() => work.dispose());

  it.each(['ontology', 'llm', 'empty'] as const)(
    'AC1 blocks %s preconditions before calling the LLM',
    async (reason) => {
      if (reason === 'ontology') {
        mkdirSync(seed.folder.analysis, { recursive: true });
        writeFileSync(novelOntologyFile(seed.folder), 'invalid: [');
      }
      if (reason === 'llm') deps.status.mockResolvedValue([]);
      if (reason === 'empty') {
        await seedAnalysis(seed, 1, [persona()]);
        await seedAnalysis(seed, 2, [persona()]);
        request.mode = 'missing';
      }
      await expect(
        execute(
          new WorldAnalysisPipeline(deps.llm, deps.settings, deps.runs, deps.chapterSlots, deps.snapshots),
          context(work.paths, request).ctx,
        ),
      ).rejects.toMatchObject({
        code:
          reason === 'ontology'
            ? ErrorCode.OntologyInvalid
            : reason === 'llm'
              ? ErrorCode.LlmNotAvailable
              : ErrorCode.AnalysisNothingToRun,
      });
      expect(deps.runForFeature).not.toHaveBeenCalled();
    },
  );

  it('AC2/4 processes only the selected range and respects overwrite on later planning', async () => {
    request = { ...request, mode: 'range', from: 2, to: 2 };
    await execute(
      new WorldAnalysisPipeline(deps.llm, deps.settings, deps.runs, deps.chapterSlots, deps.snapshots),
      context(work.paths, request).ctx,
    );
    expect(readAnalysisIndex(seed.folder)?.chapters.map((entry) => entry.index)).toEqual([2]);
    expect(
      (await checkAnalysisRun(deps.llm, deps.settings, work.paths, { ...request, mode: 'missing' })).plan.queue,
    ).toEqual([1]);
    expect(
      (await checkAnalysisRun(deps.llm, deps.settings, work.paths, { ...request, overwrite: true })).plan.queue,
    ).toEqual([2]);
    expect(
      deps.runForFeature.mock.calls
        .map(([, input]) => input.prompt)
        .every((prompt) => !prompt.includes('## Chapter 1:')),
    ).toBe(true);
  });

  it('AC5 retains completed chapter output when another chapter times out', async () => {
    deps.runForFeature.mockImplementation(async (_feature, input) => {
      if (!input.prompt.startsWith('Extract named entities') && input.prompt.includes('## Chapter 2:'))
        throw new CodedError(ErrorCode.LlmTimeout, 'timeout');
      return {
        value: input.prompt.startsWith('Extract named entities')
          ? { entities: [{ type: 'Persona', name: 'Mai', aliases: [] }] }
          : { facts: [] },
        usage: null,
        durationMs: 1,
      };
    });
    await execute(
      new WorldAnalysisPipeline(deps.llm, deps.settings, deps.runs, deps.chapterSlots, deps.snapshots),
      context(work.paths, request).ctx,
    );
    expect(readChapterResult(seed.folder, seed.novel.chapters[0].file)?.entities).toHaveLength(1);
    expect(readAnalysisIndex(seed.folder)?.chapters.find((entry) => entry.index === 2)?.error).toBe(
      ErrorCode.LlmTimeout,
    );
    expect(readAnalysisIndex(seed.folder)?.lastRun).toMatchObject({ analysed: 1, failed: 1 });
  });

  it('AC5 retains completed analysis when cancellation stops the following chapter', async () => {
    const { ctx, controller } = context(work.paths, request);
    // Progress is published after the first chapter has been written to disk.
    ctx.progress = () => {
      if (readAnalysisIndex(seed.folder)?.chapters.some((entry) => entry.index === 1)) controller.abort();
    };
    await expect(
      execute(new WorldAnalysisPipeline(deps.llm, deps.settings, deps.runs, deps.chapterSlots, deps.snapshots), ctx),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(readChapterResult(seed.folder, seed.novel.chapters[0].file)?.entities).toHaveLength(1);
    expect(readAnalysisIndex(seed.folder)?.chapters.map((entry) => entry.index)).toEqual([1]);
  });
});
