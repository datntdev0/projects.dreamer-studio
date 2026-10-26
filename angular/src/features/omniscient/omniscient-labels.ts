import type { ChapterAnalysisStatus, EntityType, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';

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
};
