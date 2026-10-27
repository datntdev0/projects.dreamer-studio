import type { ChapterAnalysisStatus, EntityType, FailReason, ItemStatus } from '@dreamer/shared/models/analysis';
import type { OntologyProblemCode, OverlayEdit } from '@dreamer/shared/models/analysis';
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

export const orphanKindKeys: Record<OverlayEdit['kind'], string> = {
  'entity-add': 'analysis.orphans.kind.entityAdd',
  'entity-rename': 'analysis.orphans.kind.entityRename',
  'entity-change-type': 'analysis.orphans.kind.entityChangeType',
  'entity-add-alias': 'analysis.orphans.kind.entityAddAlias',
  'entity-remove-alias': 'analysis.orphans.kind.entityRemoveAlias',
  'entity-merge': 'analysis.orphans.kind.entityMerge',
  'entity-split': 'analysis.orphans.kind.entitySplit',
  'entity-delete': 'analysis.orphans.kind.entityDelete',
  'entity-reset': 'analysis.orphans.kind.entityReset',
  'entity-restore': 'analysis.orphans.kind.entityRestore',
  'fact-add': 'analysis.orphans.kind.factAdd',
  'fact-edit': 'analysis.orphans.kind.factEdit',
  'fact-delete': 'analysis.orphans.kind.factDelete',
  'fact-reset': 'analysis.orphans.kind.factReset',
  'fact-restore': 'analysis.orphans.kind.factRestore',
};

function factDetail(predicate: string | undefined, quote: string | null | undefined): string {
  return [predicate, quote ? `"${quote}"` : ''].filter(Boolean).join(' ');
}

export function orphanDetail(edit: OverlayEdit): string {
  switch (edit.kind) {
    case 'entity-add':
      return edit.entity.name;
    case 'entity-rename':
      return `${edit.entityId} → ${edit.name}`;
    case 'entity-change-type':
      return `${edit.entityId} → ${edit.entityType}`;
    case 'entity-add-alias':
    case 'entity-remove-alias':
      return `${edit.entityId}: ${edit.alias}`;
    case 'entity-merge':
      return `${edit.sourceIds.join(', ')} → ${edit.targetId}`;
    case 'entity-split':
      return `${edit.entityId} → ${edit.newEntity.name}`;
    case 'entity-delete':
    case 'entity-reset':
    case 'entity-restore':
      return edit.entityId;
    case 'fact-add':
      return factDetail(edit.fact.predicate, edit.fact.quote);
    case 'fact-edit':
      return factDetail(edit.base?.predicate ?? edit.patch.predicate, edit.base?.quote ?? edit.patch.quote);
    case 'fact-delete':
      return factDetail(edit.base?.predicate, edit.base?.quote);
    case 'fact-reset':
    case 'fact-restore':
      return edit.factId;
  }
}

interface PluralKeys {
  one: string;
  many: string;
}

const PLURAL_KEYS = {
  orphanRow: { one: 'analysis.orphans.row.one', many: 'analysis.orphans.row.many' },
  entityChapters: { one: 'analysis.entity.chapterCount.one', many: 'analysis.entity.chapterCount.many' },
  entitiesChapters: { one: 'analysis.entities.chapterCount.one', many: 'analysis.entities.chapterCount.many' },
  inChapters: { one: 'analysis.entity.inChapters.one', many: 'analysis.entity.inChapters.many' },
  quotePick: { one: 'analysis.entity.quotePick.one', many: 'analysis.entity.quotePick.many' },
  mergeAliases: { one: 'analysis.entity.mergeAliases.one', many: 'analysis.entity.mergeAliases.many' },
  mergeValues: { one: 'analysis.entity.mergeValues.one', many: 'analysis.entity.mergeValues.many' },
  mergeRelations: { one: 'analysis.entity.mergeRelations.one', many: 'analysis.entity.mergeRelations.many' },
  mergeConfirm: { one: 'analysis.entity.mergeConfirmTitle.one', many: 'analysis.entity.mergeConfirmTitle.many' },
} satisfies Record<string, PluralKeys>;

export type PluralName = keyof typeof PLURAL_KEYS;

export function pluralKey(name: PluralName, count: number): string {
  return PLURAL_KEYS[name][count === 1 ? 'one' : 'many'];
}
