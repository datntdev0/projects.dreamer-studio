import { isMap } from 'yaml';
import { isScalar } from 'yaml';
import { isSeq } from 'yaml';
import { LineCounter } from 'yaml';
import { parseDocument } from 'yaml';
import type { Node } from 'yaml';
import type { Pair } from 'yaml';
import type { YAMLMap } from 'yaml';
import type { EntityProperty, EntityType } from '../models/analysis';
import type { Ontology } from '../models/analysis';
import type { OntologyParseResult } from '../models/analysis';
import type { OntologyPredicate } from '../models/analysis';
import type { OntologyProblem } from '../models/analysis';
import type { OntologyProblemCode } from '../models/analysis';
import { HAS_PERSONA, isEntityProperty, isEntityType, NAME_PROPERTY } from './ontology-rules';

export const ONTOLOGY_FILE = 'ontology.yml';

const ROOT_KEYS: readonly string[] = [
  'name',
  'version',
  'task',
  'rules',
  'entity_schema',
  'scalar_predicates',
  'connection_predicates',
];
const ENTITY_TYPE_KEYS: readonly string[] = ['type', 'description', 'examples', 'properties'];
const PROPERTY_KEYS: readonly string[] = ['property', 'required', 'multiple', 'description'];
const SCALAR_KEYS: readonly string[] = ['predicate', 'domain', 'description'];
const CONNECTION_KEYS: readonly string[] = ['predicate', 'subject', 'object', 'symmetric', 'labeled', 'description'];

type MaybeNode = Node | null | undefined;

interface Context {
  lines: LineCounter;
  problems: OntologyProblem[];
  ontology: Ontology;
  names: Set<string>;
}

export function emptyOntology(): Ontology {
  return {
    name: '',
    task: '',
    rules: [],
    entityTypes: [],
    entityTypeDescriptions: {},
    entityTypeExamples: {},
    entityTypeProperties: {},
    predicates: [],
  };
}

function lineOf(context: Context, node: MaybeNode): number {
  return node?.range ? context.lines.linePos(node.range[0]).line : 0;
}

function problem(
  context: Context,
  code: OntologyProblemCode,
  node: MaybeNode,
  params: Record<string, string> = {},
): void {
  context.problems.push({ line: lineOf(context, node), code, params });
}

function field(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((item: Pair): boolean => isScalar(item.key) && item.key.value === key);
}

function valueOf(map: YAMLMap, key: string): MaybeNode {
  return field(map, key)?.value as MaybeNode;
}

function textValue(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === 'string' ? node.value : undefined;
}

function keyText(node: unknown): string {
  if (node == null) return '';
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

function readText(
  context: Context,
  map: YAMLMap,
  key: string,
  required: boolean,
  params: Record<string, string> = {},
): string | undefined {
  const pair: Pair | undefined = field(map, key);
  if (pair === undefined) {
    if (required) problem(context, 'section-missing', null, { key });
    return undefined;
  }
  const text: string | undefined = textValue(pair.value)?.trim();
  if (!text) {
    problem(context, 'text-invalid', (pair.value ?? pair.key) as Node, { key, ...params });
    return undefined;
  }
  return text;
}

function readTextList(context: Context, map: YAMLMap, key: string, params: Record<string, string> = {}): string[] {
  const pair: Pair | undefined = field(map, key);
  if (pair === undefined) return [];
  if (!isSeq(pair.value)) {
    problem(context, 'section-not-list', (pair.value ?? pair.key) as Node, { key });
    return [];
  }
  const texts: string[] = [];
  for (const item of pair.value.items) {
    const text: string | undefined = textValue(item)?.trim();
    if (text) texts.push(text);
    else problem(context, 'text-invalid', item as Node, { key, ...params });
  }
  return texts;
}

function readFlag(context: Context, map: YAMLMap, key: string, predicate: string): boolean {
  const pair: Pair | undefined = field(map, key);
  if (pair === undefined) return false;
  if (isScalar(pair.value) && typeof pair.value.value === 'boolean') return pair.value.value;
  problem(context, 'flag-invalid', (pair.value ?? pair.key) as Node, { key, predicate });
  return false;
}

function readList(context: Context, root: YAMLMap, key: string): YAMLMap[] {
  const pair: Pair | undefined = field(root, key);
  if (pair === undefined) {
    problem(context, 'section-missing', null, { key });
    return [];
  }
  if (!isSeq(pair.value)) {
    problem(context, 'section-not-list', (pair.value ?? pair.key) as Node, { key });
    return [];
  }
  const maps: YAMLMap[] = [];
  for (const item of pair.value.items) {
    if (isMap(item)) maps.push(item);
    else problem(context, 'item-not-map', item as Node, { key });
  }
  return maps;
}

function validateEntityType(context: Context, map: YAMLMap): void {
  checkKeys(context, map, ENTITY_TYPE_KEYS);
  const typeNode: MaybeNode = valueOf(map, 'type');
  const type: string | undefined = textValue(typeNode);
  if (type === undefined || !isEntityType(type)) {
    problem(context, 'entity-type-unknown', typeNode ?? map, { type: keyText(typeNode) });
    return;
  }
  if (context.ontology.entityTypes.includes(type)) {
    problem(context, 'entity-type-duplicate', typeNode, { type });
    return;
  }
  context.ontology.entityTypes.push(type);
  const description: string | undefined = readText(context, map, 'description', false, { type });
  const examples: string[] = readTextList(context, map, 'examples', { type });
  if (description) context.ontology.entityTypeDescriptions[type] = description;
  if (examples.length > 0) context.ontology.entityTypeExamples[type] = examples;
  context.ontology.entityTypeProperties[type] = validateProperties(context, map, type);
}

function validateProperty(context: Context, map: YAMLMap, type: EntityType, properties: EntityProperty[]): void {
  checkKeys(context, map, PROPERTY_KEYS);
  const node: MaybeNode = valueOf(map, 'property');
  const name: string | undefined = textValue(node);
  if (!isEntityProperty(name)) {
    problem(context, 'property-unknown', node ?? map, { property: keyText(node), type });
    return;
  }
  if (properties.some((property: EntityProperty): boolean => property.name === name)) {
    problem(context, 'property-duplicate', node, { property: name, type });
    return;
  }
  const required: boolean = readFlag(context, map, 'required', name);
  const multiple: boolean = readFlag(context, map, 'multiple', name);
  const description: string | undefined = readText(context, map, 'description', false, { property: name, type });
  if (name === NAME_PROPERTY && (!required || multiple)) problem(context, 'name-property-invalid', node, { type });
  if (name !== NAME_PROPERTY && !multiple) problem(context, 'property-not-multiple', node, { property: name, type });
  properties.push({ name, required, multiple, ...(description ? { description } : {}) });
}

function validateProperties(context: Context, map: YAMLMap, type: EntityType): EntityProperty[] {
  const properties: EntityProperty[] = [];
  if (field(map, 'properties') !== undefined)
    readList(context, map, 'properties').forEach((item: YAMLMap): void =>
      validateProperty(context, item, type, properties),
    );
  if (!properties.some((property: EntityProperty): boolean => property.name === NAME_PROPERTY))
    problem(context, 'name-property-invalid', valueOf(map, 'type'), { type });
  return properties;
}

function validateTypeList(
  context: Context,
  map: YAMLMap,
  key: string,
  predicate: string,
  allowsCharacter: boolean,
): EntityType[] {
  const node: MaybeNode = valueOf(map, key);
  if (!isSeq(node) || node.items.length === 0) {
    problem(context, 'type-list-invalid', node ?? map, { key, predicate });
    return [];
  }
  const types: EntityType[] = [];
  for (const item of node.items) {
    const type: string | undefined = textValue(item);
    if (type === undefined) {
      problem(context, 'type-list-invalid', item as Node, { key, predicate });
    } else if (!isEntityType(type)) {
      problem(context, 'entity-type-unknown', item as Node, { type, key, predicate });
    } else if (!context.ontology.entityTypes.includes(type)) {
      problem(context, 'entity-type-not-listed', item as Node, { type, key, predicate });
    } else {
      if (type === 'Character' && !allowsCharacter) {
        problem(context, 'character-outside-has-persona', item as Node, { predicate, key });
      }
      if (!types.includes(type)) types.push(type);
    }
  }
  return types;
}

function readPredicateName(context: Context, map: YAMLMap): string | undefined {
  const node: MaybeNode = valueOf(map, 'predicate');
  const name: string | undefined = textValue(node)?.trim();
  if (!name) {
    problem(context, 'predicate-name-invalid', node ?? map);
    return undefined;
  }
  if (context.names.has(name)) {
    problem(context, 'predicate-duplicate', node, { predicate: name });
    return undefined;
  }
  context.names.add(name);
  return name;
}

function validateScalar(context: Context, map: YAMLMap): void {
  const before: number = context.problems.length;
  const name: string | undefined = readPredicateName(context, map);
  checkKeys(context, map, SCALAR_KEYS, name);
  if (name === undefined) return;
  const subjectTypes: EntityType[] = validateTypeList(context, map, 'domain', name, false);
  const description: string | undefined = readText(context, map, 'description', false, { predicate: name });
  if (context.problems.length !== before) return;
  const predicate: OntologyPredicate = { name, kind: 'scalar', subjectTypes };
  if (description !== undefined) predicate.description = description;
  context.ontology.predicates.push(predicate);
}

function exactTypeList(node: unknown, type: EntityType): boolean {
  return isSeq(node) && node.items.length === 1 && textValue(node.items[0]) === type;
}

function sameTypes(a: EntityType[], b: EntityType[]): boolean {
  return a.length === b.length && a.every((type: EntityType): boolean => b.includes(type));
}

function validateConnection(context: Context, map: YAMLMap): void {
  const before: number = context.problems.length;
  const name: string | undefined = readPredicateName(context, map);
  checkKeys(context, map, CONNECTION_KEYS, name);
  if (name === undefined) return;
  const isHasPersona: boolean = name === HAS_PERSONA;
  const subjectTypes: EntityType[] = validateTypeList(context, map, 'subject', name, isHasPersona);
  const objectTypes: EntityType[] = validateTypeList(context, map, 'object', name, isHasPersona);
  const symmetric: boolean = readFlag(context, map, 'symmetric', name);
  const labeled: boolean = readFlag(context, map, 'labeled', name);
  const description: string | undefined = readText(context, map, 'description', false, { predicate: name });
  if (symmetric && !sameTypes(subjectTypes, objectTypes)) {
    problem(context, 'symmetric-types-differ', valueOf(map, 'symmetric'), { predicate: name });
  }
  if (
    isHasPersona &&
    (symmetric ||
      !exactTypeList(valueOf(map, 'subject'), 'Character') ||
      !exactTypeList(valueOf(map, 'object'), 'Persona'))
  ) {
    problem(context, 'has-persona-invalid', valueOf(map, 'predicate'), { predicate: name });
  }
  if (context.problems.length !== before) return;
  const predicate: OntologyPredicate = { name, kind: 'relationship', subjectTypes, objectTypes };
  if (symmetric) predicate.symmetric = true;
  if (labeled) predicate.labeled = true;
  if (description !== undefined) predicate.description = description;
  context.ontology.predicates.push(predicate);
}

function validatePersonaRule(context: Context): void {
  if (!context.ontology.entityTypes.includes('Character')) return;
  if (!context.names.has(HAS_PERSONA)) problem(context, 'has-persona-missing', null, { predicate: HAS_PERSONA });
  if (!context.ontology.entityTypes.includes('Persona')) problem(context, 'persona-missing', null, { type: 'Persona' });
}

function validateRoot(context: Context, root: MaybeNode): void {
  if (!isMap(root)) {
    problem(context, 'root-not-map', root);
    return;
  }
  checkKeys(context, root, ROOT_KEYS);
  const version: Pair | undefined = field(root, 'version');
  if (!isScalar(version?.value) || version.value.value !== 1) {
    problem(context, 'version-unsupported', (version?.value ?? version?.key) as Node | undefined, {});
  }
  context.ontology.name = readText(context, root, 'name', false) ?? '';
  context.ontology.task = readText(context, root, 'task', true) ?? '';
  context.ontology.rules = readTextList(context, root, 'rules');
  readList(context, root, 'entity_schema').forEach((map: YAMLMap): void => validateEntityType(context, map));
  readList(context, root, 'scalar_predicates').forEach((map: YAMLMap): void => validateScalar(context, map));
  readList(context, root, 'connection_predicates').forEach((map: YAMLMap): void => validateConnection(context, map));
  validatePersonaRule(context);
}

export function parseOntology(text: string): OntologyParseResult {
  const lines: LineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines, uniqueKeys: true, prettyErrors: false });
  const ontology: Ontology = emptyOntology();
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
  const context: Context = { lines, problems, ontology, names: new Set<string>() };
  validateRoot(context, document.contents);
  return { ontology, problems: byLine(problems) };
}
