import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { hasGlossaryKey } from '@dreamer/shared/core/glossary';
import { formatLlmChoice, LlmResolution, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { GlossaryRunPlan } from '@dreamer/shared/models/translation';
import { GlossaryRunRequest } from '@dreamer/shared/models/translation';
import { TranslationRun } from '@dreamer/shared/models/translation';
import { GlossaryPage, GlossaryRow, InstructionRequest } from '@dreamer/shared/models/translation';
import { InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { LlmChoiceState, TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
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
import { checkGlossaryRun, GlossaryTranslationDeps } from './glossary-translation-pipeline';

const logger: Logger = createLogger('translation');

export class TranslationService {
  private readonly observed: WeakSet<AppDataSession> = new WeakSet<AppDataSession>();

  constructor(
    private readonly session: () => AppDataSession,
    private readonly deps: GlossaryTranslationDeps,
    private readonly analysisRuns: AnalysisRuns,
  ) {
    this.analysisRuns.onChanged((novelId: string): void => void this.pruneOnWorldChange(novelId));
  }

  private current(): AppDataSession {
    const session: AppDataSession = this.session();
    if (!this.observed.has(session)) {
      session.executor.onRunFinished((run: PipelineRun): void => {
        if (run.type === 'glossary-translation' && run.novelId !== null) this.deps.runs.clear(run.novelId);
      });
      this.observed.add(session);
    }
    return session;
  }

  private activeRun(novelId: string): PipelineRun | undefined {
    return new PipelineRunRepository(this.current().db)
      .activeNovelRuns()
      .find(
        (run: PipelineRun): boolean =>
          run.novelId === novelId && (run.type === 'glossary-translation' || run.type === 'content-translation'),
      );
  }

  async status(query: TranslationStatusQuery): Promise<TranslationStatus> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const targets: TargetLanguage[] = this.targetLanguages(novel);
    const language: TargetLanguage =
      query.language !== null && targets.includes(query.language) ? query.language : targets[0];
    const glossary: GlossaryRow[] = await this.glossaryRows(novel, language);
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
      languages: targets.map((target: TargetLanguage) => ({
        language: target,
        translated: 0,
        total: novel.chapters.length,
      })),
      chapters: novel.chapters.map((chapter, index: number) => ({
        index: index + 1,
        file: chapter.file,
        title: null,
        status: 'not-translated',
        issues: 0,
        edited: false,
        staleReason: null,
        instructionChanged: false,
        error: null,
      })),
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
    const blockedReason: ErrorCode | null = novelLocks(new PipelineRunRepository(session.db)).has(request.novelId)
      ? ErrorCode.NovelLocked
      : check.blockedReason;
    return { count: check.queue.length, batches: check.batches.length, blockedReason };
  }

  async startGlossary(request: GlossaryRunRequest): Promise<void> {
    const session: AppDataSession = this.current();
    const check = await checkGlossaryRun(this.deps, session.paths, request);
    if (check.blockedReason) {
      throw new CodedError(check.blockedReason, `Glossary translation cannot run: ${check.blockedReason}`);
    }
    assertUnlocked(new PipelineRunRepository(session.db), request.novelId);
    if (request.instruction?.trim()) {
      await this.saveInstruction({ novelId: request.novelId, language: request.language, text: request.instruction });
    }
    session.executor.startRun('glossary-translation', { ...request }, check.novel.title, request.novelId);
    this.deps.runs.set(request.novelId, {
      kind: 'glossary',
      language: request.language,
      runningChapter: null,
      done: 0,
      total: check.queue.length,
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
      await withNovelLock(novelId, async (): Promise<void> => {
        const folder: NovelFolder = this.folder(novelId);
        const novel: NovelMetadata | null = readMetadata(folder);
        if (novel === null) return;
        await pruneGlossary(folder, await this.entities(folder, novel));
        for (const language of this.targetLanguages(novel)) {
          broadcast(TranslationChannel.Changed, { novelId, language });
        }
      });
    } catch (error: unknown) {
      logger.error(`Glossary prune failed for ${novelId}`, error);
    }
  }

  private targetLanguages(novel: NovelMetadata): TargetLanguage[] {
    return TARGET_LANGUAGES.filter(
      (language: TargetLanguage): boolean => language !== novel.language.split('-')[0].toLowerCase(),
    );
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
