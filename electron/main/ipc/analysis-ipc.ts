import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import { isEntityType } from '@dreamer/shared/core/ontology-rules';
import { AnalysisEditRequest, AnalysisPlan, AnalysisRunRequest, AnalysisStatus } from '@dreamer/shared/models/analysis';
import { Occurrence, OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import {
  OccurrenceQuery,
  QuoteMatch,
  QuoteQuery,
  ReviewQuery,
  World,
  WorldQuery,
} from '@dreamer/shared/models/analysis';
import { isPlainObject } from '@dreamer/shared/models/validation';
import { AnalysisService } from '../features/analysis/analysis-service';
import { handleValidated } from './handle';
import { isNovelIdValue } from './library-ipc';

function isChapterIndex(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

export function isAnalysisRunRequest(value: unknown): value is AnalysisRunRequest {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    (value.mode === 'missing' || value.mode === 'range' || value.mode === 'full') &&
    isChapterIndex(value.from) &&
    isChapterIndex(value.to) &&
    typeof value.overwrite === 'boolean' &&
    (value.stage === 'all' || isEntityType(value.stage)) &&
    (value.batchSize === 1 || value.batchSize === 3 || value.batchSize === 5 || value.batchSize === 10)
  );
}

function isWorldQuery(value: unknown): value is WorldQuery {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isChapterIndex(value.chapter) &&
    typeof value.only === 'boolean'
  );
}

function isOccurrenceQuery(value: unknown): value is OccurrenceQuery {
  return (
    isPlainObject(value) && isNovelIdValue(value.novelId) && typeof value.entityId === 'string' && value.entityId !== ''
  );
}

function isReviewQuery(value: unknown): value is ReviewQuery {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    (value.status === 'verified' ||
      value.status === 'failed' ||
      value.status === 'accepted' ||
      value.status === 'rejected' ||
      value.status === 'open' ||
      value.status === 'all') &&
    isChapterIndex(value.chapterIndex) &&
    (value.itemKind === 'entity' || value.itemKind === 'fact' || value.itemKind === 'all')
  );
}

const REVIEW_KINDS: string[] = ['review-reject', 'review-fix', 'review-accept'];

function isReviewEditShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.kind === 'string' &&
    REVIEW_KINDS.includes(value.kind) &&
    typeof value.chapterIndex === 'number' &&
    Number.isInteger(value.chapterIndex) &&
    value.chapterIndex >= 1 &&
    (value.itemKind === 'entity' || value.itemKind === 'fact') &&
    typeof value.itemId === 'string' &&
    (value.entity === undefined || isPlainObject(value.entity)) &&
    (value.fact === undefined || isPlainObject(value.fact))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string');
}

function isNewEntity(value: unknown): boolean {
  return (
    isPlainObject(value) && isNonEmptyString(value.id) && isEntityType(value.type) && typeof value.name === 'string'
  );
}

function isPositiveIndex(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isFactTarget(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.factId) && isPositiveIndex(value.chapterIndex);
}

function isFactRefArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item: unknown): boolean => isPlainObject(item) && isFactTarget(item));
}

function isEntityAddShape(value: Record<string, unknown>): boolean {
  return (
    isNewEntity(value.entity) &&
    (!isPlainObject(value.entity) || value.entity.aliases === undefined || isStringArray(value.entity.aliases))
  );
}

function isOverlayEditShape(value: Record<string, unknown>): boolean {
  switch (value.kind) {
    case 'entity-add':
      return isEntityAddShape(value);
    case 'entity-rename':
      return isNonEmptyString(value.entityId) && typeof value.name === 'string';
    case 'entity-change-type':
      return isNonEmptyString(value.entityId) && isEntityType(value.entityType);
    case 'entity-add-alias':
    case 'entity-remove-alias':
      return isNonEmptyString(value.entityId) && typeof value.alias === 'string';
    case 'entity-merge':
      return isStringArray(value.sourceIds) && isNonEmptyString(value.targetId);
    case 'entity-split':
      return (
        isNonEmptyString(value.entityId) &&
        isNewEntity(value.newEntity) &&
        isStringArray(value.aliases) &&
        isFactRefArray(value.facts)
      );
    case 'entity-delete':
    case 'entity-reset':
    case 'entity-restore':
      return isNonEmptyString(value.entityId);
    case 'fact-add':
      return isPlainObject(value.fact) && isPositiveIndex(value.chapterIndex);
    case 'fact-edit':
      return isFactTarget(value) && isPlainObject(value.patch);
    case 'fact-delete':
    case 'fact-reset':
    case 'fact-restore':
      return isFactTarget(value);
    default:
      return false;
  }
}

function isQuoteQuery(value: unknown): value is QuoteQuery {
  return isPlainObject(value) && isNovelIdValue(value.novelId) && typeof value.quote === 'string';
}

function isAnalysisEditRequest(value: unknown): value is AnalysisEditRequest {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isPlainObject(value.edit) &&
    typeof value.edit.kind === 'string' &&
    (REVIEW_KINDS.includes(value.edit.kind) ? isReviewEditShape(value.edit) : isOverlayEditShape(value.edit))
  );
}

export function registerAnalysisIpc(service: AnalysisService): void {
  handleValidated(AnalysisChannel.Status, isNovelIdValue, (novelId: string): Promise<AnalysisStatus> =>
    service.status(novelId),
  );
  handleValidated(AnalysisChannel.Plan, isAnalysisRunRequest, (request: AnalysisRunRequest): Promise<AnalysisPlan> =>
    service.plan(request),
  );
  handleValidated(AnalysisChannel.Start, isAnalysisRunRequest, (request: AnalysisRunRequest): Promise<void> =>
    service.start(request),
  );
  handleValidated(AnalysisChannel.Cancel, isNovelIdValue, (novelId: string): void => service.cancel(novelId));
  handleValidated(AnalysisChannel.World, isWorldQuery, (query: WorldQuery): Promise<World> => service.world(query));
  handleValidated(AnalysisChannel.Review, isReviewQuery, (query: ReviewQuery): Promise<ReviewPage> =>
    service.review(query),
  );
  handleValidated(AnalysisChannel.Occurrences, isOccurrenceQuery, (query: OccurrenceQuery): Promise<Occurrence[]> =>
    service.occurrences(query),
  );
  handleValidated(AnalysisChannel.Edit, isAnalysisEditRequest, (request: AnalysisEditRequest): Promise<void> =>
    service.edit(request),
  );
  handleValidated(AnalysisChannel.FindQuote, isQuoteQuery, (query: QuoteQuery): Promise<QuoteMatch[]> =>
    service.findQuote(query),
  );
  handleValidated(AnalysisChannel.Merge, isNovelIdValue, (novelId: string): Promise<void> => service.merge(novelId));
  handleValidated(AnalysisChannel.OntologyOpen, isNovelIdValue, (novelId: string): Promise<void> =>
    service.ontologyOpen(novelId),
  );
  handleValidated(AnalysisChannel.OntologyReset, isNovelIdValue, (novelId: string): Promise<OntologyProblem[]> =>
    service.ontologyReset(novelId),
  );
  handleValidated(AnalysisChannel.OntologyCheck, isNovelIdValue, (novelId: string): Promise<OntologyProblem[]> =>
    service.ontologyCheck(novelId),
  );
}
