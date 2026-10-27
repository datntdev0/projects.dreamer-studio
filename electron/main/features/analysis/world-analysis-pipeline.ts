import { join } from 'node:path';
import { chapterCounts, checkChapter, hasIssues, mergeStageEntities } from '@dreamer/shared/core/analysis-checks';
import { AnalysisRunQueue, chapterStatuses, emptyIndex } from '@dreamer/shared/core/analysis-plan';
import { isUpToDate, planRun, upsertIndexEntry } from '@dreamer/shared/core/analysis-plan';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisEntity, AnalysisIndexEntry, AnalysisIndexFile, AnalysisRun } from '@dreamer/shared/models/analysis';
import { AnalysisRunRequest, ChapterAnalysisCounts, ChapterResult, Ontology } from '@dreamer/shared/models/analysis';
import { formatLlmChoice, LlmFeatureRunRequest, LlmRunResult, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineStepDetail } from '@dreamer/shared/models/pipeline';
import { AppPaths } from '@storage/paths';
import { PipelineDefinition, StepContext } from '../pipelines/pipeline-definition';
import { promptLogDir } from '../pipelines/run-log';
import { LlmService } from '../llm/llm-service';
import { SettingsStore } from '../settings/settings-store';
import { novelFolder, NovelFolder } from '../library/library-files';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { readAnalysisIndex, readChapterParagraphs, readChapterResult } from './analysis-files';
import { writeAnalysisIndex, writeChapterResult } from './analysis-files';
import { askCandidates, askPredicates, LlmChapter } from './analysis-llm';
import { ensureOntology, loadOntology } from './analysis-ontology';
import { recheckWorld } from './analysis-recheck';
import { AnalysisRuns } from './analysis-runs';

export interface WorldAnalysisDeps {
  llm: LlmService;
  settings: SettingsStore;
  runs: AnalysisRuns;
}

export interface AnalysisRunCheck {
  plan: AnalysisRunQueue;
  blockedReason: ErrorCode | null;
  llmLabel: string;
}

function requestFromParams(params: Record<string, unknown>): AnalysisRunRequest {
  return params as unknown as AnalysisRunRequest;
}

function readNovel(folder: NovelFolder, novelId: string): NovelMetadata {
  const novel: NovelMetadata | null = readMetadata(folder);
  if (novel === null) throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
  return novel;
}

export async function checkAnalysisRun(
  deps: WorldAnalysisDeps,
  paths: AppPaths,
  request: AnalysisRunRequest,
): Promise<AnalysisRunCheck> {
  const folder: NovelFolder = novelFolder(paths, request.novelId);
  const novel: NovelMetadata = readNovel(folder, request.novelId);
  const resolution = resolveLlm(deps.settings.get().llm, 'worldAnalysis', await deps.llm.status());
  const llmLabel: string = resolution.choice ? formatLlmChoice(resolution.choice, 'Default') : '';
  const parsed = loadOntology(folder);
  const plan: AnalysisRunQueue = planRun(request, chapterStatuses(novel.chapters, readAnalysisIndex(folder)));
  const blockedReason: ErrorCode | null =
    resolution.problem !== null || resolution.choice === null
      ? ErrorCode.LlmNotAvailable
      : parsed.problems.length > 0
        ? ErrorCode.OntologyInvalid
        : plan.count === 0
          ? ErrorCode.AnalysisNothingToRun
          : null;
  return { plan, blockedReason, llmLabel };
}

async function queuedChapters(
  folder: NovelFolder,
  novel: NovelMetadata,
  plan: AnalysisRunQueue,
): Promise<Map<number, LlmChapter>> {
  const chapters: Map<number, LlmChapter> = new Map<number, LlmChapter>();
  for (const index of plan.queue) {
    const entry: NovelChapterEntry = novel.chapters[index - 1];
    chapters.set(index, { index, title: entry.title, paragraphs: await readChapterParagraphs(folder, entry.file) });
  }
  return chapters;
}

async function saveEntry(
  novelId: string,
  folder: NovelFolder,
  entry: AnalysisIndexEntry,
  result?: ChapterResult,
): Promise<void> {
  await withNovelLock(novelId, async (): Promise<void> => {
    if (result) await writeChapterResult(folder, result);
    const index: AnalysisIndexFile = readAnalysisIndex(folder) ?? emptyIndex();
    await writeAnalysisIndex(folder, upsertIndexEntry(index, entry));
  });
}

async function saveLastRun(
  novel: NovelMetadata,
  folder: NovelFolder,
  runId: string,
  analysed: number,
  failed: number,
  issues: number,
): Promise<void> {
  await withNovelLock(novel.id, async (): Promise<void> => {
    await recheckWorld(folder, novel);
    const index: AnalysisIndexFile = readAnalysisIndex(folder) ?? emptyIndex();
    await writeAnalysisIndex(folder, {
      ...index,
      lastRun: { runId, analysed, failed, issues, finishedAt: new Date().toISOString() },
    });
  });
}

function batchDetail(batchIndex: number, batches: number, chapters: number[]): PipelineStepDetail {
  const from: number = chapters[0];
  const to: number = chapters[chapters.length - 1];
  return from === to
    ? { key: 'analysis.run.detail.chapter', params: { batch: batchIndex + 1, batches, chapter: from } }
    : { key: 'analysis.run.detail.chapters', params: { batch: batchIndex + 1, batches, from, to } };
}

function isChapterFailure(error: unknown): error is CodedError {
  return (
    error instanceof CodedError &&
    (error.code === ErrorCode.AnalysisLlmOutputInvalid || error.code === ErrorCode.LlmTimeout)
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function publish(deps: WorldAnalysisDeps, novelId: string, run: AnalysisRun, ctx: StepContext): void {
  deps.runs.set(novelId, { ...run });
  if (run.total > 0) ctx.progress((run.done / run.total) * 100);
}

async function failChapter(
  deps: WorldAnalysisDeps,
  ctx: StepContext,
  folder: NovelFolder,
  novel: NovelMetadata,
  index: number,
  code: ErrorCode,
  run: AnalysisRun,
): Promise<void> {
  const chapter: NovelChapterEntry = novel.chapters[index - 1];
  const counts: ChapterAnalysisCounts = { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 };
  const analysedAt: string = new Date().toISOString();
  await saveEntry(ctx.params.novelId as string, folder, {
    index,
    file: chapter.file,
    status: 'failed',
    counts,
    error: code,
    analysedAt,
    updatedAt: analysedAt,
  });
  run.done++;
  run.failed++;
  run.runningChapter = index;
  publish(deps, ctx.params.novelId as string, run, ctx);
  ctx.log.warn(`Chapter ${index} failed: ${code}`);
}

async function precondition(ctx: StepContext, deps: WorldAnalysisDeps): Promise<void> {
  const request: AnalysisRunRequest = requestFromParams(ctx.params);
  const folder: NovelFolder = novelFolder(ctx.paths, request.novelId);
  readNovel(folder, request.novelId);
  await ensureOntology(folder);
  const check: AnalysisRunCheck = await checkAnalysisRun(deps, ctx.paths, request);
  if (check.blockedReason)
    throw new CodedError(check.blockedReason, `World Analysis cannot run: ${check.blockedReason}`);
  await queuedChapters(folder, readNovel(folder, request.novelId), check.plan);
  ctx.log.info(
    `LLM: ${check.llmLabel}; chapters ${check.plan.from}-${check.plan.to}; batches ${check.plan.batches.length}`,
  );
}

async function analyse(ctx: StepContext, deps: WorldAnalysisDeps): Promise<void> {
  const request: AnalysisRunRequest = requestFromParams(ctx.params);
  const folder: NovelFolder = novelFolder(ctx.paths, request.novelId);
  const novel: NovelMetadata = readNovel(folder, request.novelId);
  const check: AnalysisRunCheck = await checkAnalysisRun(deps, ctx.paths, request);
  if (check.blockedReason)
    throw new CodedError(check.blockedReason, `World Analysis cannot run: ${check.blockedReason}`);
  const chapters: Map<number, LlmChapter> = await queuedChapters(folder, novel, check.plan);
  const ontology: Ontology = loadOntology(folder).ontology;
  const statuses = chapterStatuses(novel.chapters, readAnalysisIndex(folder));
  const run: AnalysisRun = { runningChapter: null, step: 'candidates', done: 0, total: check.plan.count, failed: 0 };
  let issues: number = 0;
  let callNumber: number = 0;
  const ask = (llmRequest: LlmFeatureRunRequest, name: string): Promise<LlmRunResult> => {
    ctx.checkpoint();
    const number: string = String(++callNumber).padStart(3, '0');
    const promptFile: string = join(promptLogDir(ctx.paths, ctx.runId), `${number}-${name}.md`);
    return deps.llm.runForFeature('worldAnalysis', llmRequest, { signal: ctx.signal, log: ctx.log, promptFile });
  };
  try {
    for (const [batchIndex, batch] of check.plan.batches.entries()) {
      ctx.checkpoint();
      ctx.enterStep('analysis.run.step.candidates', batchDetail(batchIndex, check.plan.batches.length, batch));
      run.step = 'candidates';
      run.runningChapter = batch[0] ?? null;
      publish(deps, request.novelId, run, ctx);
      const batchChapters: LlmChapter[] = batch.map((index: number): LlmChapter => chapters.get(index)!);
      let candidates: Map<number, AnalysisEntity[]>;
      try {
        candidates = await askCandidates({
          chapters: batchChapters,
          ontology,
          stage: request.stage,
          ask,
          log: ctx.log,
        });
      } catch (error: unknown) {
        if (!isChapterFailure(error)) throw error;
        for (const index of batch) await failChapter(deps, ctx, folder, novel, index, error.code, run);
        continue;
      }
      for (const chapter of batchChapters) {
        ctx.checkpoint();
        ctx.enterStep(
          'analysis.run.step.predicates',
          batchDetail(batchIndex, check.plan.batches.length, [chapter.index]),
        );
        run.step = 'predicates';
        run.runningChapter = chapter.index;
        publish(deps, request.novelId, run, ctx);
        const file: string = novel.chapters[chapter.index - 1].file;
        const previous: AnalysisEntity[] = isUpToDate(statuses[chapter.index - 1].status)
          ? (readChapterResult(folder, file)?.entities ?? [])
          : [];
        const entities: AnalysisEntity[] = mergeStageEntities(
          previous,
          candidates.get(chapter.index) ?? [],
          request.stage,
        );
        try {
          const asked = await askPredicates({ chapter, entities, ontology, ask, log: ctx.log });
          ctx.checkpoint();
          run.step = 'verification';
          publish(deps, request.novelId, run, ctx);
          const { entities: checkedEntities, facts } = checkChapter({ entities, facts: asked, ontology });
          const counts: ChapterAnalysisCounts = chapterCounts(checkedEntities, facts);
          const status: AnalysisIndexEntry['status'] = hasIssues(counts) ? 'has-issues' : 'clean';
          const analysedAt: string = new Date().toISOString();
          await saveEntry(
            request.novelId,
            folder,
            { index: chapter.index, file, status, counts, analysedAt, updatedAt: analysedAt },
            {
              version: 1,
              file,
              index: chapter.index,
              title: chapter.title,
              analysedAt,
              llm: check.llmLabel,
              entities: checkedEntities,
              facts,
            },
          );
          ctx.log.info(`Chapter ${chapter.index} saved: ${status}`);
          if (status === 'has-issues') issues++;
          run.done++;
          publish(deps, request.novelId, run, ctx);
        } catch (error: unknown) {
          if (!isChapterFailure(error)) throw error;
          await failChapter(deps, ctx, folder, novel, chapter.index, error.code, run);
        }
      }
    }
    ctx.checkpoint();
    await saveLastRun(novel, folder, ctx.runId, run.done - run.failed, run.failed, issues);
  } catch (error: unknown) {
    if (isAbort(error)) await saveLastRun(novel, folder, ctx.runId, run.done - run.failed, run.failed, issues);
    throw error;
  }
}

export function worldAnalysisPipeline(deps: WorldAnalysisDeps): PipelineDefinition {
  return {
    type: 'world-analysis',
    overallProgress: true,
    steps: [
      {
        key: 'analysis.run.step.check',
        backend: false,
        run: (ctx: StepContext): Promise<void> => precondition(ctx, deps),
      },
      {
        key: 'analysis.run.step.candidates',
        backend: false,
        run: (ctx: StepContext): Promise<void> => analyse(ctx, deps),
      },
      { key: 'analysis.run.step.predicates', backend: false },
    ],
  };
}
