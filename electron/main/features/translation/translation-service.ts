import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { glossaryRows, hasGlossaryKey } from '@dreamer/shared/core/glossary';
import { formatLlmChoice, LlmResolution, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { GlossaryPage, GlossaryRow, InstructionRequest } from '@dreamer/shared/models/translation';
import { InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { LlmChoiceState, TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { TranslationInstruction, TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { broadcast } from '../../ipc/broadcast';
import { createLogger, Logger } from '../../logging/logger';
import { readAnalysisIndex } from '../analysis/analysis-files';
import { AnalysisSnapshots } from '../analysis/analysis-snapshot';
import { WorldAnalysisDeps } from '../analysis/world-analysis-pipeline';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { editGlossaryEntry, pruneGlossary, readGlossary } from './translation-glossary';
import { loadInstruction, resetInstruction, saveInstruction } from './translation-instruction';

const logger: Logger = createLogger('translation');

export type TranslationDeps = Pick<WorldAnalysisDeps, 'llm' | 'settings' | 'runs'>;

export class TranslationService {
  constructor(
    private readonly session: () => AppDataSession,
    private readonly deps: TranslationDeps,
    private readonly snapshots: AnalysisSnapshots,
  ) {
    this.deps.runs.onChanged((novelId: string): void => void this.pruneOnWorldChange(novelId));
  }

  async status(query: TranslationStatusQuery): Promise<TranslationStatus> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const targets: TargetLanguage[] = this.targetLanguages(novel);
    const language: TargetLanguage =
      query.language !== null && targets.includes(query.language) ? query.language : targets[0];
    const glossary: GlossaryRow[] = await this.glossaryRows(novel, language);
    const statuses = await this.deps.llm.status();
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
      run: null,
      llm: {
        glossary: this.llmState(resolveLlm(this.deps.settings.get().llm, 'glossaryTranslation', statuses)),
        content: this.llmState(resolveLlm(this.deps.settings.get().llm, 'contentTranslation', statuses)),
      },
    };
  }

  async glossary(query: InstructionRequest): Promise<GlossaryPage> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const analysed: boolean =
      readAnalysisIndex(this.folder(query.novelId))?.chapters.some((entry) => !entry.error) ?? false;
    return {
      novelId: query.novelId,
      language: query.language,
      analysed,
      rows: analysed ? await this.glossaryRows(novel, query.language) : [],
    };
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
    const folder: NovelFolder = this.folder(novel.id);
    return glossaryRows(await this.entities(folder, novel), await readGlossary(folder, language));
  }

  private async entities(folder: NovelFolder, novel: NovelMetadata): Promise<WorldEditEntity[]> {
    return (await this.snapshots.get(folder, novel)).model.state.entities;
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
    return novelFolder(this.session().paths, novelId);
  }
}
