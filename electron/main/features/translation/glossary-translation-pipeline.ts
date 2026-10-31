import { join } from 'node:path';
import {
  glossaryBatches,
  glossaryEntityId,
  glossaryRunRows,
  glossaryTerm,
  groupByEntity,
} from '@dreamer/shared/core/glossary';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { formatLlmChoice, LlmFeatureRunRequest, LlmRunResult, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineStepDetail, PipelineType } from '@dreamer/shared/models/pipeline';
import { GlossaryRow, GlossaryRunRequest, TranslationRun } from '@dreamer/shared/models/translation';
import { AppPaths } from '@storage/paths';
import { Broadcaster } from '../../ipc/broadcast-provider';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { novelFolder, NovelFolder } from '../library/library-files';
import { LlmService } from '../llm/llm-service';
import { isAbort, PipelineDefinition, PipelineStep, StepContext } from '../pipelines/pipeline-definition';
import { promptLogDir } from '../pipelines/run-log';
import { SettingsStore } from '../settings/settings-store';
import { AnalysisSnapshots } from '../analysis/analysis-snapshot';
import { loadInstruction } from './translation-instruction';
import { hasAnalysedWorld, loadGlossaryRows, saveLlmEntries } from './translation-glossary';
import { recheckGlossaryChange } from './translation-index';
import { askGlossaryBatch } from './translation-llm';
import { TranslationRuns } from './translation-runs';

export interface GlossaryRunCheck {
  novel: NovelMetadata;
  rows: GlossaryRow[];
  queue: GlossaryRow[];
  batches: GlossaryRow[][];
  blockedReason: ErrorCode | null;
  llmLabel: string;
}

function requestFromParams(params: Record<string, unknown>): GlossaryRunRequest {
  return params as unknown as GlossaryRunRequest;
}

function readNovel(folder: NovelFolder, novelId: string): NovelMetadata {
  const novel: NovelMetadata | null = readMetadata(folder);
  if (novel === null) throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
  return novel;
}

export async function checkGlossaryRun(
  llm: LlmService,
  settings: SettingsStore,
  snapshots: AnalysisSnapshots,
  paths: AppPaths,
  request: GlossaryRunRequest,
): Promise<GlossaryRunCheck> {
  const folder: NovelFolder = novelFolder(paths, request.novelId);
  const novel: NovelMetadata = readNovel(folder, request.novelId);
  const resolution = resolveLlm(settings.get().llm, 'glossaryTranslation', await llm.status());
  const llmLabel: string = resolution.choice ? formatLlmChoice(resolution.choice, 'Default') : '';
  const rows: GlossaryRow[] = await loadGlossaryRows(snapshots, folder, novel, request.language);
  const queue: GlossaryRow[] = glossaryRunRows(rows, request.scope);
  const batches: GlossaryRow[][] = glossaryBatches(queue, request.batchSize);
  const blockedReason: ErrorCode | null =
    resolution.problem !== null || resolution.choice === null
      ? ErrorCode.LlmNotAvailable
      : !hasAnalysedWorld(folder)
        ? ErrorCode.TranslationNoWorld
        : queue.length === 0
          ? ErrorCode.TranslationNothingToRun
          : null;
  return { novel, rows, queue, batches, blockedReason, llmLabel };
}

function isBatchFailure(error: unknown): error is CodedError {
  return (
    error instanceof CodedError &&
    (error.code === ErrorCode.TranslationLlmOutputInvalid || error.code === ErrorCode.LlmTimeout)
  );
}

function otherNames(entities: Map<string, GlossaryRow[]>, batch: GlossaryRow[]): Map<GlossaryRow, string[]> {
  return new Map(
    batch.map((row: GlossaryRow): [GlossaryRow, string[]] => [
      row,
      (entities.get(glossaryEntityId(row)) ?? [])
        .filter((item: GlossaryRow): boolean => item !== row)
        .map(glossaryTerm),
    ]),
  );
}

function publish(runs: TranslationRuns, novelId: string, run: TranslationRun, ctx: StepContext): void {
  runs.set(novelId, run);
  if (run.total > 0) ctx.progress((run.done / run.total) * 100);
}

export class GlossaryTranslationPipeline implements PipelineDefinition {
  readonly type: PipelineType = 'glossary-translation';
  readonly overallProgress: boolean = true;
  readonly steps: PipelineStep[] = [
    {
      key: 'translation.run.step.check',
      backend: false,
      run: (ctx: StepContext): Promise<void> => this.precondition(ctx),
    },
    {
      key: 'translation.run.step.glossary',
      backend: false,
      run: (ctx: StepContext): Promise<void> => this.translate(ctx),
    },
  ];

  constructor(
    private readonly llm: LlmService,
    private readonly settings: SettingsStore,
    private readonly runs: TranslationRuns,
    private readonly snapshots: AnalysisSnapshots,
    private readonly broadcaster: Broadcaster,
  ) {}

  private async precondition(ctx: StepContext): Promise<void> {
    const request: GlossaryRunRequest = requestFromParams(ctx.params);
    const check: GlossaryRunCheck = await checkGlossaryRun(this.llm, this.settings, this.snapshots, ctx.paths, request);
    if (check.blockedReason) {
      throw new CodedError(check.blockedReason, `Glossary translation cannot run: ${check.blockedReason}`);
    }
    ctx.log.info(`LLM: ${check.llmLabel}; names ${check.queue.length}; batches ${check.batches.length}`);
  }

  private async translate(ctx: StepContext): Promise<void> {
    const request: GlossaryRunRequest = requestFromParams(ctx.params);
    const check: GlossaryRunCheck = await checkGlossaryRun(this.llm, this.settings, this.snapshots, ctx.paths, request);
    if (check.blockedReason) {
      throw new CodedError(check.blockedReason, `Glossary translation cannot run: ${check.blockedReason}`);
    }
    const folder: NovelFolder = novelFolder(ctx.paths, request.novelId);
    const instruction: string = (await loadInstruction(folder, request.novelId, request.language)).text;
    const run: TranslationRun = {
      kind: 'glossary',
      language: request.language,
      runningChapter: null,
      done: 0,
      total: check.queue.length,
      failed: 0,
    };
    const entities: Map<string, GlossaryRow[]> = groupByEntity(check.rows);
    const finish = (): void =>
      this.runs.finish(request.novelId, {
        runId: ctx.runId,
        kind: 'glossary',
        language: request.language,
        translated: run.done - run.failed,
        failed: run.failed,
        issues: 0,
      });
    let callNumber: number = 0;
    const saved: Set<string> = new Set();
    const ask = (llmRequest: LlmFeatureRunRequest, name: string): Promise<LlmRunResult> => {
      ctx.checkpoint();
      const number: string = String(++callNumber).padStart(3, '0');
      const promptFile: string = join(promptLogDir(ctx.paths, ctx.runId), `${number}-${name}.md`);
      return this.llm.runForFeature('glossaryTranslation', llmRequest, {
        signal: ctx.signal,
        log: ctx.log,
        promptFile,
      });
    };
    try {
      for (const [index, batchRows] of check.batches.entries()) {
        ctx.checkpoint();
        const batch: number = index + 1;
        const detail: PipelineStepDetail = {
          key: 'translation.run.detail.batch',
          params: { batch, batches: check.batches.length },
        };
        ctx.enterStep('translation.run.step.glossary', detail);
        publish(this.runs, request.novelId, run, ctx);
        try {
          const translations: Map<GlossaryRow, string> = await askGlossaryBatch({
            batch,
            rows: batchRows,
            otherNames: otherNames(entities, batchRows),
            sourceLanguage: check.novel.language,
            targetLanguage: request.language,
            instruction,
            ask,
            log: ctx.log,
          });
          ctx.checkpoint();
          const batchSaved: string[] = await withNovelLock(request.novelId, (): Promise<string[]> =>
            saveLlmEntries(
              folder,
              request.language,
              [...translations].map(([key, translation]: [GlossaryRow, string]) => ({ key, translation })),
            ),
          );
          this.broadcaster.send(TranslationChannel.Changed, { novelId: request.novelId, language: request.language });
          batchSaved.forEach((id: string): void => {
            saved.add(id);
          });
          run.done += batchRows.length;
          run.failed += batchRows.length - batchSaved.length;
          ctx.log.info(`Glossary batch ${batch} saved ${batchSaved.length}/${batchRows.length}`);
        } catch (error: unknown) {
          if (!isBatchFailure(error)) throw error;
          run.done += batchRows.length;
          run.failed += batchRows.length;
          ctx.log.warn(`Glossary batch ${batch} failed: ${error.code}`);
        }
        publish(this.runs, request.novelId, run, ctx);
      }
      await recheckGlossaryChange(this.snapshots, folder, request.novelId, request.language, saved, this.broadcaster);
      ctx.checkpoint();
      finish();
    } catch (error: unknown) {
      if (isAbort(error)) {
        await recheckGlossaryChange(this.snapshots, folder, request.novelId, request.language, saved, this.broadcaster);
        finish();
      }
      throw error;
    }
  }
}
