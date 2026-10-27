import type { ChapterAnalysisStatus, EntityType, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';
import type { OntologyProblemCode } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES as ONTOLOGY_ENTITY_TYPES } from '@dreamer/shared/models/analysis';

export const ENTITY_TYPES: EntityType[] = [...ONTOLOGY_ENTITY_TYPES];

export type FilterEntityType = Exclude<EntityType, 'Persona'>;

export type EntityTypeFilter = FilterEntityType | 'all';

export const ENTITY_TYPE_FILTERS: FilterEntityType[] = ['Character', 'Location', 'Organization', 'Item', 'Glossary'];

export function filterEntityTypes(filter: EntityTypeFilter): EntityType[] {
  if (filter === 'all') return [];
  return filter === 'Character' ? ['Character', 'Persona'] : [filter];
}

export const chapterStatusKeys: Record<ChapterAnalysisStatus, string> = {
  'not-analysed': 'analysis.pipeline.status.notAnalysed',
  clean: 'analysis.pipeline.status.clean',
  'has-issues': 'analysis.pipeline.status.hasIssues',
  reviewed: 'analysis.pipeline.status.reviewed',
  stale: 'analysis.pipeline.status.stale',
  failed: 'analysis.pipeline.status.failed',
};
export const chapterStatusIcons: Record<ChapterAnalysisStatus, string> = {
  'not-analysed': 'record',
  clean: 'check',
  'has-issues': 'alert-triangle',
  reviewed: 'shield',
  stale: 'clock',
  failed: 'alert-circle',
};
export const itemStatusKeys: Record<ItemStatus, string> = {
  verified: 'analysis.pipeline.itemStatus.verified',
  failed: 'analysis.pipeline.itemStatus.failed',
  accepted: 'analysis.pipeline.itemStatus.accepted',
  rejected: 'analysis.pipeline.itemStatus.rejected',
};
export const itemStatusKinds = {
  verified: 'success',
  failed: 'danger',
  accepted: 'info',
  rejected: 'neutral',
} as const;
export const entityTypeKeys: Record<EntityType | 'artifact', string> = {
  Character: 'analysis.pipeline.entityType.character',
  Persona: 'analysis.pipeline.entityType.persona',
  Location: 'analysis.pipeline.entityType.location',
  Organization: 'analysis.pipeline.entityType.organization',
  Item: 'analysis.pipeline.entityType.item',
  Glossary: 'analysis.pipeline.entityType.glossary',
  artifact: 'analysis.pipeline.entityType.artifact',
};
export const entityTypeIcons: Record<EntityType | 'artifact', string> = {
  Character: 'user',
  Persona: 'eye',
  Location: 'pin',
  Organization: 'building',
  Item: 'cube',
  Glossary: 'tag',
  artifact: 'box',
};
export const reasonKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.pipeline.reason.wordsNotFound',
  'quote-not-found': 'analysis.pipeline.reason.quoteNotFound',
  'entity-not-in-ontology': 'analysis.pipeline.reason.entityNotInOntology',
  'predicate-not-in-ontology': 'analysis.pipeline.reason.predicateNotInOntology',
  'value-missing': 'analysis.pipeline.reason.valueMissing',
  'value-not-allowed': 'analysis.pipeline.reason.valueNotAllowed',
  'entity-not-found': 'analysis.pipeline.reason.entityNotFound',
  'type-not-allowed': 'analysis.pipeline.reason.typeNotAllowed',
  'label-missing': 'analysis.pipeline.reason.labelMissing',
  'name-conflict': 'analysis.pipeline.reason.nameConflict',
  'alias-conflict': 'analysis.pipeline.reason.aliasConflict',
  'value-conflict': 'analysis.pipeline.reason.valueConflict',
};

export const REASON_ORDER: FailReason[] = [
  'entity-not-in-ontology',
  'predicate-not-in-ontology',
  'entity-not-found',
  'type-not-allowed',
  'value-missing',
  'words-not-found',
  'quote-not-found',
  'name-conflict',
  'alias-conflict',
  'value-conflict',
  'value-not-allowed',
  'label-missing',
];

export const reasonHintKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.review.hint.wordsNotFound',
  'quote-not-found': 'analysis.review.hint.quoteNotFound',
  'entity-not-in-ontology': 'analysis.review.hint.entityNotInOntology',
  'predicate-not-in-ontology': 'analysis.review.hint.predicateNotInOntology',
  'value-missing': 'analysis.review.hint.valueMissing',
  'value-not-allowed': 'analysis.review.hint.valueNotAllowed',
  'entity-not-found': 'analysis.review.hint.entityNotFound',
  'type-not-allowed': 'analysis.review.hint.typeNotAllowed',
  'label-missing': 'analysis.review.hint.labelMissing',
  'name-conflict': 'analysis.review.hint.nameConflict',
  'alias-conflict': 'analysis.review.hint.aliasConflict',
  'value-conflict': 'analysis.review.hint.valueConflict',
};

export const reasonIcons: Record<FailReason, string> = {
  'words-not-found': 'book',
  'quote-not-found': 'message',
  'entity-not-in-ontology': 'type',
  'predicate-not-in-ontology': 'nodes',
  'value-missing': 'hash',
  'value-not-allowed': 'hash',
  'entity-not-found': 'search',
  'type-not-allowed': 'shield',
  'label-missing': 'tag',
  'name-conflict': 'layers',
  'alias-conflict': 'link',
  'value-conflict': 'columns',
};

export const ontologyProblemKeys: Record<OntologyProblemCode, string> = {
  'yaml-syntax': 'analysis.ontology.problem.yamlSyntax',
  'file-unreadable': 'analysis.ontology.problem.fileUnreadable',
  'root-not-map': 'analysis.ontology.problem.rootNotMap',
  'version-unsupported': 'analysis.ontology.problem.versionUnsupported',
  'section-missing': 'analysis.ontology.problem.sectionMissing',
  'section-not-list': 'analysis.ontology.problem.sectionNotList',
  'item-not-map': 'analysis.ontology.problem.itemNotMap',
  'unknown-key': 'analysis.ontology.problem.unknownKey',
  'text-invalid': 'analysis.ontology.problem.textInvalid',
  'flag-invalid': 'analysis.ontology.problem.flagInvalid',
  'entity-type-unknown': 'analysis.ontology.problem.entityTypeUnknown',
  'entity-type-duplicate': 'analysis.ontology.problem.entityTypeDuplicate',
  'entity-type-not-listed': 'analysis.ontology.problem.entityTypeNotListed',
  'predicate-name-invalid': 'analysis.ontology.problem.predicateNameInvalid',
  'predicate-duplicate': 'analysis.ontology.problem.predicateDuplicate',
  'type-list-invalid': 'analysis.ontology.problem.typeListInvalid',
  'value-type-invalid': 'analysis.ontology.problem.valueTypeInvalid',
  'values-missing': 'analysis.ontology.problem.valuesMissing',
  'values-not-allowed': 'analysis.ontology.problem.valuesNotAllowed',
  'values-invalid': 'analysis.ontology.problem.valuesInvalid',
  'value-duplicate': 'analysis.ontology.problem.valueDuplicate',
  'symmetric-types-differ': 'analysis.ontology.problem.symmetricTypesDiffer',
  'character-outside-has-persona': 'analysis.ontology.problem.characterOutsideHasPersona',
  'has-persona-invalid': 'analysis.ontology.problem.hasPersonaInvalid',
  'has-persona-missing': 'analysis.ontology.problem.hasPersonaMissing',
  'persona-missing': 'analysis.ontology.problem.personaMissing',
};
