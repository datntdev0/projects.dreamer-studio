import type { ChapterAnalysisStatus, EntityType, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';
import type { OntologyProblemCode } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES as ONTOLOGY_ENTITY_TYPES } from '@dreamer/shared/models/analysis';

export const ENTITY_TYPES: EntityType[] = [...ONTOLOGY_ENTITY_TYPES];

export type FilterEntityType = Exclude<EntityType, 'Persona'>;

export type EntityTypeFilter = FilterEntityType | 'all';

export const ENTITY_TYPE_FILTERS: FilterEntityType[] = [
  'Character',
  'Location',
  'Organization',
  'Artifact',
  'Glossary',
];

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
export const entityTypeKeys: Record<EntityType | 'unknown', string> = {
  Character: 'analysis.pipeline.entityType.character',
  Persona: 'analysis.pipeline.entityType.persona',
  Location: 'analysis.pipeline.entityType.location',
  Organization: 'analysis.pipeline.entityType.organization',
  Artifact: 'analysis.pipeline.entityType.artifact',
  Glossary: 'analysis.pipeline.entityType.glossary',
  unknown: 'analysis.pipeline.entityType.unknown',
};
export const entityTypeIcons: Record<EntityType | 'unknown', string> = {
  Character: 'user',
  Persona: 'eye',
  Location: 'pin',
  Organization: 'building',
  Artifact: 'cube',
  Glossary: 'tag',
  unknown: 'box',
};
export const reasonKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.pipeline.reason.wordsNotFound',
  'quote-not-found': 'analysis.pipeline.reason.quoteNotFound',
  'entity-not-in-ontology': 'analysis.pipeline.reason.entityNotInOntology',
  'predicate-not-in-ontology': 'analysis.pipeline.reason.predicateNotInOntology',
  'entity-not-found': 'analysis.pipeline.reason.entityNotFound',
  'type-not-allowed': 'analysis.pipeline.reason.typeNotAllowed',
  'label-missing': 'analysis.pipeline.reason.labelMissing',
  'name-conflict': 'analysis.pipeline.reason.nameConflict',
  'alias-conflict': 'analysis.pipeline.reason.aliasConflict',
};

export const REASON_ORDER: FailReason[] = [
  'entity-not-in-ontology',
  'predicate-not-in-ontology',
  'entity-not-found',
  'type-not-allowed',
  'words-not-found',
  'quote-not-found',
  'name-conflict',
  'alias-conflict',
  'label-missing',
];

export const reasonHintKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.review.hint.wordsNotFound',
  'quote-not-found': 'analysis.review.hint.quoteNotFound',
  'entity-not-in-ontology': 'analysis.review.hint.entityNotInOntology',
  'predicate-not-in-ontology': 'analysis.review.hint.predicateNotInOntology',
  'entity-not-found': 'analysis.review.hint.entityNotFound',
  'type-not-allowed': 'analysis.review.hint.typeNotAllowed',
  'label-missing': 'analysis.review.hint.labelMissing',
  'name-conflict': 'analysis.review.hint.nameConflict',
  'alias-conflict': 'analysis.review.hint.aliasConflict',
};

export const reasonIcons: Record<FailReason, string> = {
  'words-not-found': 'book',
  'quote-not-found': 'message',
  'entity-not-in-ontology': 'type',
  'predicate-not-in-ontology': 'nodes',
  'entity-not-found': 'search',
  'type-not-allowed': 'shield',
  'label-missing': 'tag',
  'name-conflict': 'layers',
  'alias-conflict': 'link',
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
  'symmetric-types-differ': 'analysis.ontology.problem.symmetricTypesDiffer',
  'character-outside-has-persona': 'analysis.ontology.problem.characterOutsideHasPersona',
  'has-persona-invalid': 'analysis.ontology.problem.hasPersonaInvalid',
  'has-persona-missing': 'analysis.ontology.problem.hasPersonaMissing',
  'persona-missing': 'analysis.ontology.problem.personaMissing',
  'property-unknown': 'analysis.ontology.problem.propertyUnknown',
  'property-duplicate': 'analysis.ontology.problem.propertyDuplicate',
  'name-property-invalid': 'analysis.ontology.problem.namePropertyInvalid',
  'property-not-multiple': 'analysis.ontology.problem.propertyNotMultiple',
};
