import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import { isEntityType } from '@dreamer/shared/core/ontology-rules';
import { AnalysisEditRequest, AnalysisPlan, AnalysisRunRequest, AnalysisStatus } from '@dreamer/shared/models/analysis';
import { WorldDraftEdit } from '@dreamer/shared/models/analysis';
import { Occurrence, OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import {
  OccurrenceQuery,
  QuoteMatch,
  QuoteQuery,
  ReviewQuery,
  World,
  WorldQuery,
} from '@dreamer/shared/models/analysis';
import {
  WorldEditPreview,
  WorldEditScope,
  WorldPreviewRequest,
  WorldScopeRequest,
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
    isChapterIndex(value.chapterIndex) &&
    (value.itemKind === 'entity' || value.itemKind === 'fact' || value.itemKind === 'all')
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string');
}

function isPositiveIndex(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isEditEntity(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    isEntityType(value.type) &&
    typeof value.name === 'string' &&
    isStringArray(value.aliases) &&
    isStringArray(value.titles) &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isPositiveIndex)
  );
}

function isFactRef(value: unknown): boolean {
  return isPlainObject(value) && isNonEmptyString(value.factId) && isPositiveIndex(value.chapterIndex);
}

function isFactRefArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isFactRef);
}

function isWorldFact(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    isFactRef({ factId: value.id, chapterIndex: value.chapterIndex }) &&
    (value.kind === 'relationship' || value.kind === 'scalar') &&
    isNonEmptyString(value.predicate) &&
    typeof value.subjectId === 'string' &&
    (value.quote === null || typeof value.quote === 'string')
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isEntityPatch(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    isOptionalString(value.name) &&
    (value.type === undefined || isEntityType(value.type)) &&
    (value.aliases === undefined || isStringArray(value.aliases)) &&
    (value.titles === undefined || isStringArray(value.titles))
  );
}

function isFactPatch(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    isOptionalString(value.subjectId) &&
    isOptionalString(value.predicate) &&
    isOptionalString(value.objectId) &&
    isOptionalString(value.label) &&
    (value.quote === undefined || value.quote === null || typeof value.quote === 'string')
  );
}

function isDraftEdit(value: unknown): value is WorldDraftEdit {
  if (!isPlainObject(value)) return false;
  switch (value.kind) {
    case 'entity-add':
      return isEditEntity(value.entity);
    case 'entity-edit':
      return isNonEmptyString(value.entityId) && isEntityPatch(value.patch);
    case 'entity-delete':
      return isNonEmptyString(value.entityId);
    case 'entity-merge':
      return isStringArray(value.sourceIds) && isNonEmptyString(value.targetId);
    case 'entity-split':
      return (
        isNonEmptyString(value.entityId) &&
        isEditEntity(value.newEntity) &&
        isStringArray(value.aliases) &&
        isFactRefArray(value.facts)
      );
    case 'fact-add':
      return isWorldFact(value.fact);
    case 'fact-edit':
      return isFactRef({ factId: value.factId, chapterIndex: value.chapterIndex }) && isFactPatch(value.patch);
    case 'fact-delete':
      return isFactRef({ factId: value.factId, chapterIndex: value.chapterIndex });
    default:
      return false;
  }
}

function isDraftEditArray(value: unknown): value is WorldDraftEdit[] {
  return Array.isArray(value) && value.every(isDraftEdit);
}

function isQuoteQuery(value: unknown): value is QuoteQuery {
  return isPlainObject(value) && isNovelIdValue(value.novelId) && typeof value.quote === 'string';
}

function isAnalysisEditRequest(value: unknown): value is AnalysisEditRequest {
  return isPlainObject(value) && isNovelIdValue(value.novelId) && isDraftEditArray(value.edits);
}

function isIssueKey(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isWorldScopeRequest(value: unknown): value is WorldScopeRequest {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isIssueKey(value.issueKey) &&
    isStringArray(value.entityIds)
  );
}

function isWorldPreviewRequest(value: unknown): value is WorldPreviewRequest {
  return (
    isPlainObject(value) && isNovelIdValue(value.novelId) && isIssueKey(value.issueKey) && isDraftEditArray(value.edits)
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
  handleValidated(AnalysisChannel.Scope, isWorldScopeRequest, (request: WorldScopeRequest): Promise<WorldEditScope> =>
    service.scope(request),
  );
  handleValidated(
    AnalysisChannel.Preview,
    isWorldPreviewRequest,
    (request: WorldPreviewRequest): Promise<WorldEditPreview> => service.preview(request),
  );
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
