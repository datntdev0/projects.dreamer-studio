import { ENTITY_TYPES } from '../models/analysis';
import type { EntityType } from '../models/analysis';
import type { Ontology } from '../models/analysis';
import type { OntologyPredicate } from '../models/analysis';

export const HAS_PERSONA = 'has_persona';
export const NAME_PREDICATE = 'name';
export const ALIAS_PREDICATE = 'alias';

export function isEntityType(value: unknown): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value as string);
}

export function factPredicates(ontology: Ontology): OntologyPredicate[] {
  return ontology.predicates.filter(
    (predicate: OntologyPredicate): boolean => predicate.name !== NAME_PREDICATE && predicate.name !== ALIAS_PREDICATE,
  );
}

export function aliasTypes(ontology: Ontology): EntityType[] {
  return (
    ontology.predicates.find((predicate: OntologyPredicate): boolean => predicate.name === ALIAS_PREDICATE)
      ?.subjectTypes ?? []
  );
}
