import { isMap } from 'yaml';
import { isScalar } from 'yaml';
import { isSeq } from 'yaml';
import { LineCounter } from 'yaml';
import { parseDocument } from 'yaml';
import type { Node } from 'yaml';
import type { Pair } from 'yaml';
import type { YAMLMap } from 'yaml';
import type { EntityType } from '../models/analysis';
import type { Ontology } from '../models/analysis';
import type { OntologyParseResult } from '../models/analysis';
import type { OntologyPredicate } from '../models/analysis';
import type { OntologyProblem } from '../models/analysis';
import type { OntologyProblemCode } from '../models/analysis';

export const ONTOLOGY_FILE = 'ontology.yml';

const ENTITY_TYPES: readonly EntityType[] = ['character', 'persona', 'location', 'organization', 'glossary'];
const ROOT_KEYS: readonly string[] = ['version', 'entityTypes', 'predicates'];
const PREDICATE_KEYS: readonly string[] = ['kind', 'subject', 'object', 'values', 'description'];

interface Context {
  lines: LineCounter;
  problems: OntologyProblem[];
  ontology: Ontology;
}

function lineOf(context: Context, node: Node | null | undefined): number {
  return node?.range ? context.lines.linePos(node.range[0]).line : 0;
}

function problem(
  context: Context,
  code: OntologyProblemCode,
  node: Node | null | undefined,
  params: Record<string, string> = {},
): void {
  context.problems.push({ line: lineOf(context, node), code, params });
}

function field(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((item: Pair): boolean => isScalar(item.key) && item.key.value === key);
}

function textValue(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === 'string' ? node.value : undefined;
}

function keyText(node: unknown): string {
  return textValue(node) ?? String(isScalar(node) ? node.value : node);
}

function byLine(problems: OntologyProblem[]): OntologyProblem[] {
  return problems.sort((a: OntologyProblem, b: OntologyProblem): number => a.line - b.line);
}

function checkKeys(context: Context, map: YAMLMap, allowed: readonly string[], predicate?: string): void {
  for (const item of map.items) {
    const key: string | undefined = textValue(item.key);
    if (key === undefined || !allowed.includes(key)) {
      problem(context, 'unknown-key', item.key as Node, {
        key: keyText(item.key),
        ...(predicate ? { predicate } : {}),
      });
    }
  }
}

export function isEntityType(value: unknown): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
}

function validateEntityTypes(context: Context, node: Node | null | undefined): void {
  if (!isMap(node)) {
    problem(context, node == null ? 'section-missing' : 'section-not-map', node, { key: 'entityTypes' });
    return;
  }
  for (const item of node.items) {
    const type: string | undefined = textValue(item.key);
    if (type === undefined || !isEntityType(type)) {
      problem(context, 'entity-type-unknown', item.key as Node, {
        type: keyText(item.key),
      });
      continue;
    }
    context.ontology.entityTypes.push(type);
    if (item.value == null || (isScalar(item.value) && item.value.value === null)) continue;
    const description: string | undefined = textValue(item.value);
    if (description === undefined) {
      problem(context, 'description-not-text', item.value as Node, { type });
    } else {
      context.ontology.entityTypeDescriptions[type] = description;
    }
  }
}

function validateTypeList(
  context: Context,
  node: Node | null | undefined,
  key: string,
  predicate: string,
): EntityType[] {
  if (!isSeq(node) || node.items.length === 0) {
    problem(context, 'type-list-invalid', node, { key, predicate });
    return [];
  }
  const types: EntityType[] = [];
  for (const item of node.items) {
    const type: string | undefined = textValue(item);
    if (type === undefined) {
      problem(context, 'type-list-invalid', item as Node, { key, predicate });
    } else if (!isEntityType(type)) {
      problem(context, 'entity-type-unknown', item as Node, { type, key, predicate });
    } else {
      if (type === 'character' && predicate !== 'persona of') {
        problem(context, 'character-outside-persona-of', item as Node, { predicate, key });
      }
      if (!context.ontology.entityTypes.includes(type)) {
        problem(context, 'entity-type-not-listed', item as Node, { type, key, predicate });
        continue;
      }
      if (!types.includes(type)) types.push(type);
    }
  }
  return types;
}

function validateValues(context: Context, node: Node | null | undefined, predicate: string): string[] {
  if (!isSeq(node) || node.items.length === 0) {
    problem(context, 'values-invalid', node, { predicate });
    return [];
  }
  const values: string[] = [];
  for (const item of node.items) {
    const value: string | undefined = textValue(item);
    if (value === undefined || value.trim().length === 0) {
      problem(context, 'values-invalid', item as Node, { predicate });
    } else if (values.includes(value)) {
      problem(context, 'value-duplicate', item as Node, { predicate, value });
    } else {
      values.push(value);
    }
  }
  return values;
}

function exactTypeList(node: unknown, type: EntityType): boolean {
  return isSeq(node) && node.items.length === 1 && textValue(node.items[0]) === type;
}

function validatePredicate(context: Context, name: string, map: YAMLMap, nameNode: Node): void {
  const before: number = context.problems.length;
  checkKeys(context, map, PREDICATE_KEYS, name);
  const kindNode: Node | null | undefined = field(map, 'kind')?.value as Node | null | undefined;
  const kind: string | undefined = textValue(kindNode);
  if (kind !== 'relationship' && kind !== 'scalar') {
    problem(context, 'kind-invalid', kindNode ?? nameNode, { predicate: name });
  }
  const subject: EntityType[] = validateTypeList(
    context,
    field(map, 'subject')?.value as Node | null | undefined,
    'subject',
    name,
  );
  const objectField: Pair | undefined = field(map, 'object');
  let object: EntityType[] | undefined;
  if (kind === 'relationship') {
    if (objectField === undefined) {
      problem(context, 'object-missing', nameNode, { predicate: name });
    } else {
      object = validateTypeList(context, objectField.value as Node | null, 'object', name);
    }
  } else if (objectField !== undefined) {
    problem(context, 'object-not-allowed', objectField.key as Node, { predicate: name });
  }
  const valuesField: Pair | undefined = field(map, 'values');
  let allowedValues: string[] | undefined;
  if (valuesField !== undefined) {
    if (kind !== 'scalar') {
      problem(context, 'values-not-allowed', valuesField.key as Node, { predicate: name });
    } else {
      allowedValues = validateValues(context, valuesField.value as Node | null, name);
    }
  }
  const descriptionField: Pair | undefined = field(map, 'description');
  const description: string | undefined = descriptionField ? textValue(descriptionField.value) : undefined;
  if (descriptionField !== undefined && description === undefined) {
    problem(context, 'description-not-text', descriptionField.value as Node, { predicate: name });
  }
  if (
    name === 'persona of' &&
    (kind !== 'relationship' ||
      !exactTypeList(field(map, 'subject')?.value, 'persona') ||
      !exactTypeList(objectField?.value, 'character'))
  ) {
    problem(context, 'persona-of-invalid', nameNode, { predicate: name });
  }
  if (context.problems.length !== before || (kind !== 'relationship' && kind !== 'scalar')) return;
  const predicate: OntologyPredicate = { name, kind, subjectTypes: subject };
  if (object !== undefined) predicate.objectTypes = object;
  if (allowedValues !== undefined) predicate.allowedValues = allowedValues;
  if (description !== undefined) predicate.description = description;
  context.ontology.predicates.push(predicate);
}

function validatePredicates(context: Context, node: Node | null | undefined): void {
  if (!isMap(node)) {
    problem(context, node == null ? 'section-missing' : 'section-not-map', node, { key: 'predicates' });
    return;
  }
  for (const item of node.items) {
    const name: string | undefined = textValue(item.key);
    if (name === undefined || name.trim().length === 0) {
      problem(context, 'predicate-name-empty', item.key as Node, {});
      continue;
    }
    if (!isMap(item.value)) {
      problem(context, 'predicate-not-map', item.value as Node, { predicate: name });
      if (name === 'persona of') problem(context, 'persona-of-invalid', item.key as Node, { predicate: name });
      continue;
    }
    validatePredicate(context, name, item.value, item.key as Node);
  }
}

function validatePersonaRule(context: Context, predicates: Node | null | undefined): void {
  if (!context.ontology.entityTypes.includes('character')) return;
  if (!isMap(predicates) || field(predicates, 'persona of') === undefined) {
    problem(context, 'persona-of-missing', null, { predicate: 'persona of' });
  }
  if (!context.ontology.entityTypes.includes('persona')) {
    problem(context, 'persona-missing', null, { type: 'persona' });
  }
}

function validateRoot(context: Context, root: Node | null | undefined): void {
  if (!isMap(root)) {
    problem(context, 'root-not-map', root);
    return;
  }
  checkKeys(context, root, ROOT_KEYS);
  const version: Pair | undefined = field(root, 'version');
  if (!isScalar(version?.value) || version.value.value !== 1) {
    problem(context, 'version-unsupported', (version?.value ?? version?.key) as Node | undefined, {});
  }
  const entityTypes: Node | null | undefined = field(root, 'entityTypes')?.value as Node | null | undefined;
  const predicates: Node | null | undefined = field(root, 'predicates')?.value as Node | null | undefined;
  validateEntityTypes(context, entityTypes);
  validatePredicates(context, predicates);
  validatePersonaRule(context, predicates);
}

export function parseOntology(text: string): OntologyParseResult {
  const lines: LineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines, uniqueKeys: true, prettyErrors: false });
  const ontology: Ontology = { entityTypes: [], entityTypeDescriptions: {}, predicates: [] };
  const problems: OntologyProblem[] = document.errors
    .map((error): OntologyProblem => ({
      line: error.linePos?.[0].line ?? lines.linePos(error.pos[0]).line,
      code: 'yaml-syntax',
      params: { detail: error.message },
    }))
    .filter(
      (item: OntologyProblem, index: number, all: OntologyProblem[]): boolean =>
        all.findIndex((other: OntologyProblem): boolean => other.line === item.line) === index,
    );
  if (problems.length > 0) return { ontology, problems: byLine(problems) };
  const context: Context = { lines, problems, ontology };
  validateRoot(context, document.contents);
  return { ontology, problems: byLine(problems) };
}
