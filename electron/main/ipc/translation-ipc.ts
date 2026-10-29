import { TranslationChannel } from '@dreamer/shared/ipc/channels';
import { ENTITY_TYPES, EntityType } from '@dreamer/shared/models/analysis';
import { GlossaryEditRequest } from '@dreamer/shared/models/translation';
import { GlossaryPage, InstructionRequest, InstructionSaveRequest } from '@dreamer/shared/models/translation';
import { TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { TranslationInstruction, TranslationStatus, TranslationStatusQuery } from '@dreamer/shared/models/translation';
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

export function registerTranslationIpc(service: TranslationService): void {
  handleValidated(
    TranslationChannel.Status,
    isStatusQuery,
    (query: TranslationStatusQuery): Promise<TranslationStatus> => service.status(query),
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
}
