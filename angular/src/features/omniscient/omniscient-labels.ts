import type { ChapterAnalysisStatus, EntityType, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';
import type { OntologyProblemCode } from '@dreamer/shared/models/analysis';

export const ENTITY_TYPES: EntityType[] = ['character', 'persona', 'location', 'organization', 'glossary'];

export type FilterEntityType = Exclude<EntityType, 'persona'>;

export type EntityTypeFilter = FilterEntityType | 'all';

export const ENTITY_TYPE_FILTERS: FilterEntityType[] = ['character', 'location', 'organization', 'glossary'];

export function filterEntityTypes(filter: EntityTypeFilter): EntityType[] {
  if (filter === 'all') return [];
  return filter === 'character' ? ['character', 'persona'] : [filter];
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
  character: 'analysis.pipeline.entityType.character',
  persona: 'analysis.pipeline.entityType.persona',
  location: 'analysis.pipeline.entityType.location',
  organization: 'analysis.pipeline.entityType.organization',
  glossary: 'analysis.pipeline.entityType.glossary',
  artifact: 'analysis.pipeline.entityType.artifact',
};
export const entityTypeIcons: Record<EntityType | 'artifact', string> = {
  character: 'user',
  persona: 'eye',
  location: 'pin',
  organization: 'building',
  glossary: 'tag',
  artifact: 'box',
};
export const reasonKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.pipeline.reason.wordsNotFound',
  'quote-not-found': 'analysis.pipeline.reason.quoteNotFound',
  'type-not-in-ontology': 'analysis.pipeline.reason.typeNotInOntology',
  'predicate-not-in-ontology': 'analysis.pipeline.reason.predicateNotInOntology',
  'value-not-allowed': 'analysis.pipeline.reason.valueNotAllowed',
  'entity-not-found': 'analysis.pipeline.reason.entityNotFound',
  'type-not-allowed': 'analysis.pipeline.reason.typeNotAllowed',
};

export const ontologyProblemKeys: Record<OntologyProblemCode, string> = {
  'yaml-syntax': 'analysis.ontology.problem.yamlSyntax',
  'file-unreadable': 'analysis.ontology.problem.fileUnreadable',
  'root-not-map': 'analysis.ontology.problem.rootNotMap',
  'version-unsupported': 'analysis.ontology.problem.versionUnsupported',
  'section-missing': 'analysis.ontology.problem.sectionMissing',
  'section-not-map': 'analysis.ontology.problem.sectionNotMap',
  'unknown-key': 'analysis.ontology.problem.unknownKey',
  'entity-type-unknown': 'analysis.ontology.problem.entityTypeUnknown',
  'entity-type-not-listed': 'analysis.ontology.problem.entityTypeNotListed',
  'description-not-text': 'analysis.ontology.problem.descriptionNotText',
  'predicate-name-empty': 'analysis.ontology.problem.predicateNameEmpty',
  'predicate-not-map': 'analysis.ontology.problem.predicateNotMap',
  'kind-invalid': 'analysis.ontology.problem.kindInvalid',
  'type-list-invalid': 'analysis.ontology.problem.typeListInvalid',
  'object-missing': 'analysis.ontology.problem.objectMissing',
  'object-not-allowed': 'analysis.ontology.problem.objectNotAllowed',
  'values-not-allowed': 'analysis.ontology.problem.valuesNotAllowed',
  'values-invalid': 'analysis.ontology.problem.valuesInvalid',
  'value-duplicate': 'analysis.ontology.problem.valueDuplicate',
  'character-outside-persona-of': 'analysis.ontology.problem.characterOutsidePersonaOf',
  'persona-of-invalid': 'analysis.ontology.problem.personaOfInvalid',
  'persona-of-missing': 'analysis.ontology.problem.personaOfMissing',
  'persona-missing': 'analysis.ontology.problem.personaMissing',
};
