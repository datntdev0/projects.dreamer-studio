import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { glossaryKeyId, hasGlossaryKey } from '@dreamer/shared/core/glossary';
import { formatLlmChoice, LlmResolution, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { ContentRunPlan, ContentRunRequest } from '@dreamer/shared/models/translation';
import { GlossaryRunPlan } from '@dreamer/shared/models/translation';
import { GlossaryRunRequest } from '@dreamer/shared/models/translation';
import { TranslationRun, TranslationRunKind } from '@dreamer/shared/models/translation';
import { GlossaryPage, GlossaryRow, InstructionRequest } from '@dreamer/shared/models/translation';
import { InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { LlmChoiceState, targetLanguages, TargetLanguage } from '@dreamer/shared/models/translation';
import { TranslationInstruction, TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { PipelineRun } from '@dreamer/shared/models/pipeline';
import { AppDataSession } from '../../app/app-data-session';
import { broadcast } from '../../ipc/broadcast';
import { createLogger, Logger } from '../../logging/logger';
import { AnalysisRuns } from '../analysis/analysis-runs';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked, novelLocks } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { editGlossaryEntry, hasAnalysedWorld, loadGlossaryRows, pruneGlossary } from './translation-glossary';
import { loadInstruction, resetInstruction, saveInstruction } from './translation-instruction';
import { chapterStatusesFor, languageSummary, recheckGlossaryChange } from './translation-index';
import { checkGlossaryRun } from './glossary-translation-pipeline';
import { checkContentRun, ContentTranslationDeps } from './content-translation-pipeline';

const logger: Logger = createLogger('translation');

interface RunStart {
  novelId: string;
  language: TargetLanguage;
  instruction: string | null;
}

function isTranslationRun(run: PipelineRun): boolean {
  return run.type === 'glossary-translation' || run.type === 'content-translation';
}

export class TranslationService {
  private readonly observed: WeakSet<AppDataSession> = new WeakSet<AppDataSession>();

  constructor(
    private readonly session: () => AppDataSession,
    private readonly deps: ContentTranslationDeps,
    private readonly analysisRuns: AnalysisRuns,
  ) {
    this.analysisRuns.onChanged((novelId: string): void => void this.pruneOnWorldChange(novelId));
  }

  private current(): AppDataSession {
    const session: AppDataSession = this.session();
    if (!this.observed.has(session)) {
      session.executor.onRunFinished((run: PipelineRun): void => {
        if (isTranslationRun(run) && run.novelId !== null) this.deps.runs.clear(run.novelId);
      });
      this.observed.add(session);
    }
    return session;
  }

  private activeRun(novelId: string): PipelineRun | undefined {
    return new PipelineRunRepository(this.current().db)
      .activeNovelRuns()
      .find((run: PipelineRun): boolean => run.novelId === novelId && isTranslationRun(run));
  }

  async status(query: TranslationStatusQuery): Promise<TranslationStatus> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const targets: TargetLanguage[] = targetLanguages(novel.language);
    const language: TargetLanguage =
      query.language !== null && targets.includes(query.language) ? query.language : targets[0];
    const glossary: GlossaryRow[] = await this.glossaryRows(novel, language);
    const folder: NovelFolder = this.folder(novel.id);
    const chapters = await chapterStatusesFor(folder, novel, language);
    const statuses = await this.deps.llm.status();
    const activeRun: PipelineRun | undefined = this.activeRun(query.novelId);
    const run: TranslationRun | null =
      this.deps.runs.get(query.novelId) ??
      (activeRun
        ? {
            kind: activeRun.type === 'glossary-translation' ? 'glossary' : 'content',
            language,
            runningChapter: null,
            done: 0,
            total: 0,
            failed: 0,
          }
        : null);
    return {
      novelId: novel.id,
      language,
      targets,
      languages: targets.map((target: TargetLanguage) => languageSummary(folder, novel, target)),
      chapters,
      glossary: {
        total: glossary.length,
        untranslated: glossary.filter((row: GlossaryRow): boolean => row.status === 'untranslated').length,
      },
      run,
      lastRun: this.deps.runs.lastRun(query.novelId),
      llm: {
        glossary: this.llmState(resolveLlm(this.deps.settings.get().llm, 'glossaryTranslation', statuses)),
        content: this.llmState(resolveLlm(this.deps.settings.get().llm, 'contentTranslation', statuses)),
      },
    };
  }

  async glossary(query: InstructionRequest): Promise<GlossaryPage> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const analysed: boolean = hasAnalysedWorld(this.folder(query.novelId));
    return {
      novelId: query.novelId,
      language: query.language,
      analysed,
      rows: analysed ? await this.glossaryRows(novel, query.language) : [],
    };
  }

  async planGlossary(request: GlossaryRunRequest): Promise<GlossaryRunPlan> {
    const session: AppDataSession = this.current();
    const check = await checkGlossaryRun(this.deps, session.paths, request);
    const blockedReason: ErrorCode | null = this.planBlockedReason(session, request.novelId, check.blockedReason);
    return { count: check.queue.length, batches: check.batches.length, blockedReason };
  }

  async startGlossary(request: GlossaryRunRequest): Promise<void> {
    const session: AppDataSession = this.current();
    const check = await checkGlossaryRun(this.deps, session.paths, request);
    await this.startRun(
      session,
      'glossary',
      { ...request },
      check.novel.title,
      check.queue.length,
      check.blockedReason,
    );
  }

  async planContent(request: ContentRunRequest): Promise<ContentRunPlan> {
    const session: AppDataSession = this.current();
    const check = await checkContentRun(this.deps, session.paths, request);
    const blockedReason: ErrorCode | null = this.planBlockedReason(session, request.novelId, check.blockedReason);
    const queued: Set<number> = new Set(check.queue);
    return {
      count: check.queue.length,
      from: check.queue.length > 0 ? Math.min(...check.queue) : null,
      to: check.queue.length > 0 ? Math.max(...check.queue) : null,
      userEdited: check.statuses.filter((chapter): boolean => queued.has(chapter.index) && chapter.edited).length,
      untranslatedNames: check.rows.filter(
        (row: GlossaryRow): boolean =>
          row.status === 'untranslated' && row.chapterIndexes.some((index: number): boolean => queued.has(index)),
      ).length,
      blockedReason,
    };
  }

  async startContent(request: ContentRunRequest): Promise<void> {
    const session: AppDataSession = this.current();
    const check = await checkContentRun(this.deps, session.paths, request);
    await this.startRun(session, 'content', { ...request }, check.novel.title, check.queue.length, check.blockedReason);
  }

  private planBlockedReason(session: AppDataSession, novelId: string, reason: ErrorCode | null): ErrorCode | null {
    return novelLocks(new PipelineRunRepository(session.db)).has(novelId) ? ErrorCode.NovelLocked : reason;
  }

  private async startRun(
    session: AppDataSession,
    kind: TranslationRunKind,
    request: RunStart & Record<string, unknown>,
    title: string,
    total: number,
    blockedReason: ErrorCode | null,
  ): Promise<void> {
    if (blockedReason) throw new CodedError(blockedReason, `Translation cannot run: ${blockedReason}`);
    assertUnlocked(new PipelineRunRepository(session.db), request.novelId);
    if (request.instruction?.trim()) {
      await this.saveInstruction({ novelId: request.novelId, language: request.language, text: request.instruction });
    }
    session.executor.startRun(`${kind}-translation`, request, title, request.novelId);
    this.deps.runs.set(request.novelId, {
      kind,
      language: request.language,
      runningChapter: null,
      done: 0,
      total,
      failed: 0,
    });
  }

  cancel(novelId: string): void {
    const run: PipelineRun | undefined = this.activeRun(novelId);
    if (run) this.current().executor.cancel(run.id);
  }

  editGlossary(request: GlossaryEditRequest): Promise<void> {
    return withNovelLock(request.novelId, async (): Promise<void> => {
      const novel: NovelMetadata = this.readNovel(request.novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), request.novelId);
      const entities: WorldEditEntity[] = await this.entities(this.folder(request.novelId), novel);
      if (!hasGlossaryKey(entities, request.key)) {
        throw new CodedError(ErrorCode.GlossaryKeyNotFound, 'Glossary key not found in the world');
      }
      await editGlossaryEntry(this.folder(request.novelId), request.language, request.key, request.translation);
      broadcast(TranslationChannel.Changed, { novelId: request.novelId, language: request.language });
      void recheckGlossaryChange(
        this.deps.snapshots,
        this.folder(request.novelId),
        request.novelId,
        request.language,
        new Set([glossaryKeyId(request.key)]),
      );
    });
  }

  instruction(request: InstructionRequest): Promise<TranslationInstruction> {
    this.readNovel(request.novelId);
    return loadInstruction(this.folder(request.novelId), request.novelId, request.language);
  }

  saveInstruction(request: InstructionSaveRequest): Promise<TranslationInstruction> {
    return withNovelLock(request.novelId, async (): Promise<TranslationInstruction> => {
      this.readNovel(request.novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), request.novelId);
      return saveInstruction(this.folder(request.novelId), request.novelId, request.language, request.text);
    });
  }

  resetInstruction(request: InstructionRequest): Promise<TranslationInstruction> {
    return withNovelLock(request.novelId, async (): Promise<TranslationInstruction> => {
      this.readNovel(request.novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), request.novelId);
      return resetInstruction(this.folder(request.novelId), request.novelId, request.language);
    });
  }

  private llmState({ choice, problem }: LlmResolution): LlmChoiceState {
    const available: boolean = choice !== null && problem === null;
    return {
      available,
      label: choice && available ? formatLlmChoice(choice, 'Default') : '',
      reason: available ? null : ErrorCode.LlmNotAvailable,
    };
  }

  private async glossaryRows(novel: NovelMetadata, language: TargetLanguage): Promise<GlossaryRow[]> {
    return loadGlossaryRows(this.deps.snapshots, this.folder(novel.id), novel, language);
  }

  private async entities(folder: NovelFolder, novel: NovelMetadata): Promise<WorldEditEntity[]> {
    return (await this.deps.snapshots.get(folder, novel)).model.state.entities;
  }

  private async pruneOnWorldChange(novelId: string): Promise<void> {
    try {
      let removed: Map<TargetLanguage, Set<string>> = new Map();
      await withNovelLock(novelId, async (): Promise<void> => {
        const folder: NovelFolder = this.folder(novelId);
        const novel: NovelMetadata | null = readMetadata(folder);
        if (novel === null) return;
        removed = await pruneGlossary(folder, await this.entities(folder, novel));
        for (const language of targetLanguages(novel.language)) {
          broadcast(TranslationChannel.Changed, { novelId, language });
        }
      });
      const folder: NovelFolder = this.folder(novelId);
      await Promise.all(
        [...removed].map(([language, changed]: [TargetLanguage, Set<string>]): Promise<void> =>
          recheckGlossaryChange(this.deps.snapshots, folder, novelId, language, changed),
        ),
      );
    } catch (error: unknown) {
      logger.error(`Glossary prune failed for ${novelId}`, error);
    }
  }

  private readNovel(novelId: string): NovelMetadata {
    const metadata: NovelMetadata | null = readMetadata(this.folder(novelId));
    if (metadata === null) throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
    return metadata;
  }

  private folder(novelId: string): NovelFolder {
    return novelFolder(this.current().paths, novelId);
  }
}
