import { join } from 'node:path';
import { checkTranslation, foundGlossary } from '@dreamer/shared/core/translation-check';
import { glossaryTerm } from '@dreamer/shared/core/glossary';
import { contentRunQueue } from '@dreamer/shared/core/translation-status';
import { translationParts } from '@dreamer/shared/core/translation-parts';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { formatLlmChoice, LlmFeatureRunRequest, LlmRunResult, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineStepDetail } from '@dreamer/shared/models/pipeline';
import { ChapterTranslationFile, ChapterTranslationSummary } from '@dreamer/shared/models/translation';
import { ContentRunRequest, GlossaryRow, GlossaryUsed } from '@dreamer/shared/models/translation';
import { TranslationIndexEntry, TranslationIssue, TranslationRun } from '@dreamer/shared/models/translation';
import { AppPaths } from '@storage/paths';
import { broadcast } from '../../ipc/broadcast';
import { readChapterParagraphs } from '../analysis/analysis-files';
import { novelFolder, NovelFolder } from '../library/library-files';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { isAbort, PipelineDefinition, settleAll, StepContext } from '../pipelines/pipeline-definition';
import { promptLogDir } from '../pipelines/run-log';
import { WorkSlots } from '../pipelines/work-slots';
import { chapterStatusesFor, instructionHash, saveTranslationEntry } from './translation-index';
import { hasAnalysedWorld, loadGlossaryRows } from './translation-glossary';
import { loadInstruction } from './translation-instruction';
import { AskLlm } from '../llm/llm-checked';
import { askChapterPart, ChapterPartTranslation } from './translation-llm';
import { GlossaryTranslationDeps } from './glossary-translation-pipeline';

export interface ContentTranslationDeps extends GlossaryTranslationDeps {
  chapterSlots: WorkSlots;
}

export interface ContentRunCheck {
  novel: NovelMetadata;
  statuses: ChapterTranslationSummary[];
  queue: number[];
  rows: GlossaryRow[];
  blockedReason: ErrorCode | null;
  llmLabel: string;
}

function requestFromParams(params: Record<string, unknown>): ContentRunRequest {
  return params as unknown as ContentRunRequest;
}

function readNovel(folder: NovelFolder, novelId: string): NovelMetadata {
  const novel: NovelMetadata | null = readMetadata(folder);
  if (novel === null) throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
  return novel;
}

export async function checkContentRun(
  deps: ContentTranslationDeps,
  paths: AppPaths,
  request: ContentRunRequest,
): Promise<ContentRunCheck> {
  const folder: NovelFolder = novelFolder(paths, request.novelId);
  const novel: NovelMetadata = readNovel(folder, request.novelId);
  const resolution = resolveLlm(deps.settings.get().llm, 'contentTranslation', await deps.llm.status());
  const llmLabel: string = resolution.choice ? formatLlmChoice(resolution.choice, 'Default') : '';
  const statuses: ChapterTranslationSummary[] = await chapterStatusesFor(folder, novel, request.language);
  const queue: number[] = contentRunQueue(request, statuses);
  const rows: GlossaryRow[] = hasAnalysedWorld(folder)
    ? await loadGlossaryRows(deps.snapshots, folder, novel, request.language)
    : [];
  const blockedReason: ErrorCode | null =
    resolution.problem !== null || resolution.choice === null
      ? ErrorCode.LlmNotAvailable
      : queue.length === 0
        ? ErrorCode.TranslationNothingToRun
        : null;
  return { novel, statuses, queue, rows, blockedReason, llmLabel };
}

function isChapterFailure(error: unknown): error is CodedError {
  return (
    error instanceof CodedError &&
    (error.code === ErrorCode.TranslationLlmOutputInvalid ||
      error.code === ErrorCode.LlmTimeout ||
      error.code === ErrorCode.ChapterFileMissing)
  );
}

function publish(deps: ContentTranslationDeps, novelId: string, run: TranslationRun, ctx: StepContext): void {
  deps.runs.set(novelId, { ...run });
  if (run.total > 0) ctx.progress((run.done / run.total) * 100);
}

function promptGlossary(names: GlossaryUsed[]): { term: string; translation: string; entityType: string }[] {
  return names.flatMap((name: GlossaryUsed) =>
    name.translation === null
      ? []
      : [{ term: glossaryTerm(name.key), translation: name.translation, entityType: name.key.entityType }],
  );
}

async function askChapter(input: {
  index: number;
  title: string;
  paragraphs: string[];
  names: GlossaryUsed[];
  sourceLanguage: string;
  request: ContentRunRequest;
  instruction: string;
  ask: AskLlm;
  ctx: StepContext;
}): Promise<ChapterPartTranslation> {
  const parts: string[][] = translationParts(input.paragraphs);
  const translated: ChapterPartTranslation[] = [];
  for (const [partIndex, part] of parts.entries()) {
    translated.push(
      await askChapterPart({
        chapter: input.index,
        part: partIndex + 1,
        parts: parts.length,
        title: partIndex === 0 ? input.title : null,
        paragraphs: part,
        glossary: promptGlossary(input.names),
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.request.language,
        instruction: input.instruction,
        ask: input.ask,
        log: input.ctx.log,
      }),
    );
  }
  return {
    title: translated[0]?.title ?? '',
    paragraphs: translated.flatMap((part: ChapterPartTranslation): string[] => part.paragraphs),
  };
}

async function precondition(ctx: StepContext, deps: ContentTranslationDeps): Promise<void> {
  const request: ContentRunRequest = requestFromParams(ctx.params);
  const check: ContentRunCheck = await checkContentRun(deps, ctx.paths, request);
  if (check.blockedReason) {
    throw new CodedError(check.blockedReason, `Content translation cannot run: ${check.blockedReason}`);
  }
  ctx.log.info(`LLM: ${check.llmLabel}; chapters ${check.queue.length}`);
}

async function translate(ctx: StepContext, deps: ContentTranslationDeps): Promise<void> {
  const request: ContentRunRequest = requestFromParams(ctx.params);
  const check: ContentRunCheck = await checkContentRun(deps, ctx.paths, request);
  if (check.blockedReason) {
    throw new CodedError(check.blockedReason, `Content translation cannot run: ${check.blockedReason}`);
  }
  const folder: NovelFolder = novelFolder(ctx.paths, request.novelId);
  const instruction: string = (await loadInstruction(folder, request.novelId, request.language)).text;
  const hash: string = await instructionHash(instruction);
  const run: TranslationRun = {
    kind: 'content',
    language: request.language,
    runningChapter: null,
    done: 0,
    total: check.queue.length,
    failed: 0,
  };
  let issues: number = 0;
  let callNumber: number = 0;
  const ask = (llmRequest: LlmFeatureRunRequest, name: string): Promise<LlmRunResult> => {
    ctx.checkpoint();
    const number: string = String(++callNumber).padStart(3, '0');
    const promptFile: string = join(promptLogDir(ctx.paths, ctx.runId), `${number}-${name}.md`);
    return deps.llm.runForFeature('contentTranslation', llmRequest, { signal: ctx.signal, log: ctx.log, promptFile });
  };
  const finish = (): void =>
    deps.runs.finish(request.novelId, {
      runId: ctx.runId,
      kind: 'content',
      language: request.language,
      translated: run.done - run.failed,
      failed: run.failed,
      issues,
    });
  const save = async (entry: TranslationIndexEntry, result?: ChapterTranslationFile): Promise<void> => {
    await withNovelLock(request.novelId, (): Promise<void> =>
      saveTranslationEntry(folder, request.language, check.novel.chapters, entry, result),
    );
    broadcast(TranslationChannel.Changed, { novelId: request.novelId, language: request.language });
  };
  const translateChapter = async (index: number): Promise<void> => {
    const chapter: NovelChapterEntry = check.novel.chapters[index - 1];
    const base = { index, file: chapter.file, edited: false, instructionHash: hash };
    try {
      ctx.checkpoint();
      const detail: PipelineStepDetail = { key: 'translation.run.detail.chapter', params: { chapter: index } };
      ctx.enterStep('translation.run.step.content', detail);
      run.runningChapter = index;
      publish(deps, request.novelId, run, ctx);
      const paragraphs: string[] = await readChapterParagraphs(folder, chapter.file);
      const names: GlossaryUsed[] = foundGlossary(check.rows, chapter.title, paragraphs);
      const translated: ChapterPartTranslation = await askChapter({
        index,
        title: chapter.title,
        paragraphs,
        names,
        sourceLanguage: check.novel.language,
        request,
        instruction,
        ask,
        ctx,
      });
      const chapterIssues: TranslationIssue[] = checkTranslation({
        source: { title: chapter.title, paragraphs },
        translation: translated,
        names,
      });
      ctx.checkpoint();
      const translatedAt: string = new Date().toISOString();
      await save(
        { ...base, title: translated.title, issues: chapterIssues.length, glossaryUsed: names, translatedAt },
        { version: 1, file: chapter.file, ...translated, issues: chapterIssues, translatedAt },
      );
      run.done++;
      if (chapterIssues.length > 0) issues++;
      ctx.log.info(`Chapter ${index} saved`);
    } catch (error: unknown) {
      if (!isChapterFailure(error)) throw error;
      const translatedAt: string = new Date().toISOString();
      await save({ ...base, title: null, issues: 0, glossaryUsed: [], error: error.code, translatedAt });
      run.done++;
      run.failed++;
      ctx.log.warn(`Chapter ${index} failed: ${error.code}`);
    }
    publish(deps, request.novelId, run, ctx);
  };
  publish(deps, request.novelId, run, ctx);
  try {
    await settleAll(
      check.queue.map((index: number): Promise<void> =>
        deps.chapterSlots.run(ctx.signal, () => translateChapter(index)),
      ),
    );
    ctx.checkpoint();
    finish();
  } catch (error: unknown) {
    if (isAbort(error)) finish();
    throw error;
  }
}

export function contentTranslationPipeline(deps: ContentTranslationDeps): PipelineDefinition {
  return {
    type: 'content-translation',
    overallProgress: true,
    steps: [
      {
        key: 'translation.run.step.check',
        backend: false,
        run: (ctx: StepContext): Promise<void> => precondition(ctx, deps),
      },
      {
        key: 'translation.run.step.content',
        backend: false,
        run: (ctx: StepContext): Promise<void> => translate(ctx, deps),
      },
    ],
  };
}
