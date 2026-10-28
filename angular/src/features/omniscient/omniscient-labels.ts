import type { ChapterAnalysisStatus, EntityType, FailReason, IssueSeverity } from '@dreamer/shared/models/analysis';
import type { OntologyProblemCode, WorldDraftEdit } from '@dreamer/shared/models/analysis';
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
  analysed: 'analysis.pipeline.status.analysed',
  stale: 'analysis.pipeline.status.stale',
  failed: 'analysis.pipeline.status.failed',
};
export const chapterStatusIcons: Record<ChapterAnalysisStatus, string> = {
  'not-analysed': 'record',
  analysed: 'check',
  stale: 'clock',
  failed: 'alert-circle',
};
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

export const issueDetailKeys: Record<FailReason, string> = {
  'words-not-found': 'analysis.edit.detail.wordsNotFound',
  'quote-not-found': 'analysis.edit.detail.quoteNotFound',
  'entity-not-in-ontology': 'analysis.edit.detail.entityNotInOntology',
  'predicate-not-in-ontology': 'analysis.edit.detail.predicateNotInOntology',
  'entity-not-found': 'analysis.edit.detail.entityNotFound',
  'type-not-allowed': 'analysis.edit.detail.typeNotAllowed',
  'label-missing': 'analysis.edit.detail.labelMissing',
  'name-conflict': 'analysis.edit.detail.nameConflict',
  'alias-conflict': 'analysis.edit.detail.aliasConflict',
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
  'section-not-map': 'analysis.ontology.problem.sectionNotMap',
  'item-not-map': 'analysis.ontology.problem.itemNotMap',
  'unknown-key': 'analysis.ontology.problem.unknownKey',
  'text-invalid': 'analysis.ontology.problem.textInvalid',
  'flag-invalid': 'analysis.ontology.problem.flagInvalid',
  'entity-type-unknown': 'analysis.ontology.problem.entityTypeUnknown',
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
  'name-property-invalid': 'analysis.ontology.problem.namePropertyInvalid',
  'property-not-multiple': 'analysis.ontology.problem.propertyNotMultiple',
};

export const orphanKindKeys: Record<WorldDraftEdit['kind'], string> = {
  'entity-add': 'analysis.orphans.kind.entityAdd',
  'entity-edit': 'analysis.orphans.kind.entityEdit',
  'entity-delete': 'analysis.orphans.kind.entityDelete',
  'entity-merge': 'analysis.orphans.kind.entityMerge',
  'entity-split': 'analysis.orphans.kind.entitySplit',
  'fact-add': 'analysis.orphans.kind.factAdd',
  'fact-edit': 'analysis.orphans.kind.factEdit',
  'fact-delete': 'analysis.orphans.kind.factDelete',
};

function factDetail(predicate: string | undefined, quote: string | null | undefined): string {
  return [predicate, quote ? `"${quote}"` : ''].filter(Boolean).join(' ');
}

export function orphanDetail(edit: WorldDraftEdit): string {
  switch (edit.kind) {
    case 'entity-add':
      return edit.entity.name;
    case 'entity-edit':
    case 'entity-delete':
      return edit.entityId;
    case 'entity-merge':
      return `${edit.sourceIds.join(', ')} → ${edit.targetId}`;
    case 'entity-split':
      return `${edit.entityId} → ${edit.newEntity.name}`;
    case 'fact-add':
      return factDetail(edit.fact.predicate, edit.fact.quote);
    case 'fact-edit':
      return factDetail(edit.patch.predicate, edit.patch.quote) || edit.factId;
    case 'fact-delete':
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
} satisfies Record<string, PluralKeys>;

export type PluralName = keyof typeof PLURAL_KEYS;

export function pluralKey(name: PluralName, count: number): string {
  return PLURAL_KEYS[name][count === 1 ? 'one' : 'many'];
}

export const issueIcons: Record<IssueSeverity, string> = {
  error: 'alert-circle',
  warning: 'alert-triangle',
};
export const issuePillKinds = {
  error: 'danger',
  warning: 'warning',
} as const;
export const issueLabelKeys: Record<IssueSeverity, string> = {
  error: 'analysis.world.issueError',
  warning: 'analysis.world.issueWarning',
};
export const issueRanks: Record<IssueSeverity | 'none', number> = {
  none: 0,
  warning: 1,
  error: 2,
};
