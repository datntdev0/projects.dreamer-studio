import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { formatLlmChoice, LlmResolution, resolveLlm } from '@dreamer/shared/models/llm';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { GlossaryPage, InstructionRequest, InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { LlmChoiceState, TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { TranslationInstruction, TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { readAnalysisIndex } from '../analysis/analysis-files';
import { WorldAnalysisDeps } from '../analysis/world-analysis-pipeline';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { loadInstruction, resetInstruction, saveInstruction } from './translation-instruction';

export type TranslationDeps = Pick<WorldAnalysisDeps, 'llm' | 'settings'>;

export class TranslationService {
  constructor(
    private readonly session: () => AppDataSession,
    private readonly deps: TranslationDeps,
  ) {}

  async status(query: TranslationStatusQuery): Promise<TranslationStatus> {
    const novel: NovelMetadata = this.readNovel(query.novelId);
    const targets: TargetLanguage[] = TARGET_LANGUAGES.filter(
      (language: TargetLanguage): boolean => language !== novel.language.split('-')[0].toLowerCase(),
    );
    const language: TargetLanguage =
      query.language !== null && targets.includes(query.language) ? query.language : targets[0];
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
      glossary: { total: 0, untranslated: 0 },
      run: null,
      llm: {
        glossary: this.llmState(resolveLlm(this.deps.settings.get().llm, 'glossaryTranslation', statuses)),
        content: this.llmState(resolveLlm(this.deps.settings.get().llm, 'contentTranslation', statuses)),
      },
    };
  }

  async glossary(query: InstructionRequest): Promise<GlossaryPage> {
    this.readNovel(query.novelId);
    return {
      novelId: query.novelId,
      language: query.language,
      analysed: readAnalysisIndex(this.folder(query.novelId))?.chapters.some((entry) => !entry.error) ?? false,
      rows: [],
    };
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

  private readNovel(novelId: string): NovelMetadata {
    const metadata: NovelMetadata | null = readMetadata(this.folder(novelId));
    if (metadata === null) throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
    return metadata;
  }

  private folder(novelId: string): NovelFolder {
    return novelFolder(this.session().paths, novelId);
  }
}
