import { ENTITY_PROPERTIES, ENTITY_TYPES } from '../models/analysis';
import type { EntityPropertyName, EntityType } from '../models/analysis';
import type { Ontology } from '../models/analysis';

export const HAS_PERSONA = 'has_persona';
export const NAME_PROPERTY: EntityPropertyName = 'name';

export function isEntityType(value: unknown): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value as string);
}

export function isEntityProperty(value: unknown): value is EntityPropertyName {
  return (ENTITY_PROPERTIES as readonly string[]).includes(value as string);
}

export function hasProperty(
  ontology: Ontology | null,
  type: string | undefined,
  property: EntityPropertyName,
): boolean {
  return (ontology?.entityTypeProperties[type as EntityType] ?? []).some((item) => item.name === property);
}

export function propertyTypes(ontology: Ontology, property: EntityPropertyName): EntityType[] {
  return ontology.entityTypes.filter((type: EntityType): boolean => hasProperty(ontology, type, property));
}
