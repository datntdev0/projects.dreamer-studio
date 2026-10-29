import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { ENTITY_TYPES, EntityType } from '@dreamer/shared/models/analysis';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { ContentRunPlan, ContentRunRequest } from '@dreamer/shared/models/translation';
import { GlossaryRunPlan, GlossaryRunRequest } from '@dreamer/shared/models/translation';
import { GlossaryPage, InstructionRequest, InstructionSaveRequest } from '@dreamer/shared/models/translation';
import {
  GLOSSARY_BATCH_SIZES,
  GlossaryBatchSize,
  TARGET_LANGUAGES,
  TargetLanguage,
} from '@dreamer/shared/models/translation';
import { TranslationInstruction, TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';
import { ChapterTranslation } from '@dreamer/shared/models/translation';
import { TranslationChapterRequest, TranslationSaveRequest } from '@dreamer/shared/models/translation';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { isPlainObject } from '@dreamer/shared/models/validation';
import { TranslationService } from '../features/translation/translation-service';
import { handleValidated } from './handle';
import { isNovelIdValue } from './library-ipc';

function isTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === 'string' && TARGET_LANGUAGES.includes(value as TargetLanguage);
}

function isStatusQuery(value: unknown): value is TranslationStatusQuery {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    (value.language === null || isTargetLanguage(value.language))
  );
}

function isInstructionRequest(value: unknown): value is InstructionRequest {
  return isPlainObject(value) && isNovelIdValue(value.novelId) && isTargetLanguage(value.language);
}

function isInstructionSaveRequest(value: unknown): value is InstructionSaveRequest {
  return isInstructionRequest(value) && 'text' in value && typeof value.text === 'string' && value.text.trim() !== '';
}

function isChapterRequest(value: unknown): value is TranslationChapterRequest {
  return isInstructionRequest(value) && 'file' in value && typeof value.file === 'string' && isContentHash(value.file);
}

function isSaveRequest(value: unknown): value is TranslationSaveRequest {
  return (
    isChapterRequest(value) &&
    'title' in value &&
    typeof value.title === 'string' &&
    value.title.trim() !== '' &&
    'paragraphs' in value &&
    Array.isArray(value.paragraphs) &&
    value.paragraphs.every((paragraph: unknown): boolean => typeof paragraph === 'string') &&
    value.paragraphs.some((paragraph: string): boolean => paragraph.trim() !== '')
  );
}

function isGlossaryEditRequest(value: unknown): value is GlossaryEditRequest {
  if (!isInstructionRequest(value) || !('key' in value) || !isPlainObject(value.key)) return false;
  const { key } = value;
  const validKind: boolean = key.kind === 'name' || key.kind === 'alias' || key.kind === 'title';
  const validTerm: boolean =
    key.kind === 'name' ? key.term === null : typeof key.term === 'string' && key.term.trim() !== '';
  return (
    typeof key.entityType === 'string' &&
    ENTITY_TYPES.includes(key.entityType as EntityType) &&
    typeof key.entityName === 'string' &&
    key.entityName.trim() !== '' &&
    validKind &&
    validTerm &&
    'translation' in value &&
    (value.translation === null || typeof value.translation === 'string')
  );
}

function isGlossaryRunRequest(value: unknown): value is GlossaryRunRequest {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isTargetLanguage(value.language) &&
    (value.scope === 'untranslated' || value.scope === 'all') &&
    GLOSSARY_BATCH_SIZES.includes(value.batchSize as GlossaryBatchSize) &&
    (value.instruction === null || typeof value.instruction === 'string')
  );
}

function isChapterIndex(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

function isContentRunRequest(value: unknown): value is ContentRunRequest {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isTargetLanguage(value.language) &&
    (value.mode === 'missing' || value.mode === 'range' || value.mode === 'full') &&
    isChapterIndex(value.from) &&
    isChapterIndex(value.to) &&
    (value.mode !== 'range' || (value.from !== null && value.to !== null && value.from <= value.to)) &&
    typeof value.overwrite === 'boolean' &&
    (value.instruction === null || typeof value.instruction === 'string')
  );
}

export function registerTranslationIpc(service: TranslationService): void {
  handleValidated(
    TranslationChannel.Status,
    isStatusQuery,
    (query: TranslationStatusQuery): Promise<TranslationStatus> => service.status(query),
  );
  handleValidated(
    TranslationChannel.Chapter,
    isChapterRequest,
    (request: TranslationChapterRequest): Promise<ChapterTranslation | null> => service.chapter(request),
  );
  handleValidated(
    TranslationChannel.Save,
    isSaveRequest,
    (request: TranslationSaveRequest): Promise<ChapterTranslation> => service.save(request),
  );
  handleValidated(
    TranslationChannel.Glossary,
    isInstructionRequest,
    (query: InstructionRequest): Promise<GlossaryPage> => service.glossary(query),
  );
  handleValidated(
    TranslationChannel.EditGlossary,
    isGlossaryEditRequest,
    (request: GlossaryEditRequest): Promise<void> => service.editGlossary(request),
  );
  handleValidated(
    TranslationChannel.Instruction,
    isInstructionRequest,
    (request: InstructionRequest): Promise<TranslationInstruction> => service.instruction(request),
  );
  handleValidated(
    TranslationChannel.SaveInstruction,
    isInstructionSaveRequest,
    (request: InstructionSaveRequest): Promise<TranslationInstruction> => service.saveInstruction(request),
  );
  handleValidated(
    TranslationChannel.ResetInstruction,
    isInstructionRequest,
    (request: InstructionRequest): Promise<TranslationInstruction> => service.resetInstruction(request),
  );
  handleValidated(
    TranslationChannel.PlanGlossary,
    isGlossaryRunRequest,
    (request: GlossaryRunRequest): Promise<GlossaryRunPlan> => service.planGlossary(request),
  );
  handleValidated(
    TranslationChannel.StartGlossary,
    isGlossaryRunRequest,
    (request: GlossaryRunRequest): Promise<void> => service.startGlossary(request),
  );
  handleValidated(
    TranslationChannel.PlanContent,
    isContentRunRequest,
    (request: ContentRunRequest): Promise<ContentRunPlan> => service.planContent(request),
  );
  handleValidated(TranslationChannel.StartContent, isContentRunRequest, (request: ContentRunRequest): Promise<void> =>
    service.startContent(request),
  );
  handleValidated(TranslationChannel.Cancel, isNovelIdValue, (novelId: string): void => service.cancel(novelId));
}
