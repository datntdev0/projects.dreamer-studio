import { isMap } from 'yaml';
import { isScalar } from 'yaml';
import { isSeq } from 'yaml';
import { LineCounter } from 'yaml';
import { parseDocument } from 'yaml';
import type { Node } from 'yaml';
import type { Pair } from 'yaml';
import type { YAMLMap } from 'yaml';
import { isLanguage } from '../i18n/translate';
import type { Language } from '../i18n/translate';
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
  'schema_entities',
  'schema_scalars',
  'schema_connections',
  'constraints',
  'workflows',
];
const ENTITY_TYPE_KEYS: readonly string[] = ['description', 'examples', 'properties'];
const PROPERTY_KEYS: readonly string[] = ['required', 'multiple', 'description'];
const SCALAR_KEYS: readonly string[] = ['domain', 'description', 'display'];
const CONNECTION_KEYS: readonly string[] = ['subject', 'object', 'symmetric', 'labeled', 'description', 'display'];
const CONSTRAINT_KEYS: readonly string[] = ['extraction', 'structure'];
const WORKFLOW_KEYS: readonly string[] = ['analysis'];
const ANALYSIS_KEYS: readonly string[] = ['task', 'steps'];

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
    if (required) problem(context, 'section-missing', null, { key, ...params });
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

function readDisplay(context: Context, map: YAMLMap, predicate: string): Partial<Record<Language, string>> {
  const display: Partial<Record<Language, string>> = {};
  for (const pair of readMap(context, map, 'display', false)?.items ?? []) {
    const language: string | undefined = textValue(pair.key);
    const text: string | undefined = textValue(pair.value)?.trim();
    if (!isLanguage(language)) problem(context, 'unknown-key', pair.key as Node, { key: keyText(pair.key), predicate });
    else if (!text) problem(context, 'text-invalid', (pair.value ?? pair.key) as Node, { key: language, predicate });
    else display[language] = text;
  }
  return display;
}

function readMap(
  context: Context,
  map: YAMLMap,
  key: string,
  required: boolean,
  path: string = key,
): YAMLMap | undefined {
  const pair: Pair | undefined = field(map, key);
  if (pair === undefined) {
    if (required) problem(context, 'section-missing', null, { key: path });
    return undefined;
  }
  if (!isMap(pair.value)) {
    problem(context, 'section-not-map', (pair.value ?? pair.key) as Node, { key: path });
    return undefined;
  }
  return pair.value;
}

function itemMap(context: Context, pair: Pair, section: string): YAMLMap | undefined {
  if (isMap(pair.value)) return pair.value;
  problem(context, 'item-not-map', pair.key as Node, { key: section });
  return undefined;
}

function validateEntityType(context: Context, pair: Pair): void {
  const type: string | undefined = textValue(pair.key);
  if (type === undefined || !isEntityType(type)) {
    problem(context, 'entity-type-unknown', pair.key as Node, { type: keyText(pair.key) });
    return;
  }
  const map: YAMLMap | undefined = itemMap(context, pair, 'schema_entities');
  if (map === undefined) return;
  checkKeys(context, map, ENTITY_TYPE_KEYS);
  context.ontology.entityTypes.push(type);
  const description: string | undefined = readText(context, map, 'description', false, { type });
  const examples: string[] = readTextList(context, map, 'examples', { type });
  if (description) context.ontology.entityTypeDescriptions[type] = description;
  if (examples.length > 0) context.ontology.entityTypeExamples[type] = examples;
  context.ontology.entityTypeProperties[type] = validateProperties(context, map, type, pair.key as Node);
}

function validateProperty(context: Context, pair: Pair, type: EntityType, properties: EntityProperty[]): void {
  const node: Node = pair.key as Node;
  const name: string | undefined = textValue(node);
  if (!isEntityProperty(name)) {
    problem(context, 'property-unknown', node, { property: keyText(node), type });
    return;
  }
  const map: YAMLMap | undefined = itemMap(context, pair, 'properties');
  if (map === undefined) return;
  checkKeys(context, map, PROPERTY_KEYS);
  const required: boolean = readFlag(context, map, 'required', name);
  const multiple: boolean = readFlag(context, map, 'multiple', name);
  const description: string | undefined = readText(context, map, 'description', false, { property: name, type });
  if (name === NAME_PROPERTY && (!required || multiple)) problem(context, 'name-property-invalid', node, { type });
  if (name !== NAME_PROPERTY && !multiple) problem(context, 'property-not-multiple', node, { property: name, type });
  properties.push({ name, required, multiple, ...(description ? { description } : {}) });
}

function validateProperties(context: Context, map: YAMLMap, type: EntityType, typeNode: Node): EntityProperty[] {
  const properties: EntityProperty[] = [];
  readMap(context, map, 'properties', false)?.items.forEach((pair: Pair): void =>
    validateProperty(context, pair, type, properties),
  );
  if (!properties.some((property: EntityProperty): boolean => property.name === NAME_PROPERTY))
    problem(context, 'name-property-invalid', typeNode, { type });
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

function readPredicateName(context: Context, pair: Pair): string | undefined {
  const name: string | undefined = textValue(pair.key)?.trim();
  if (!name) {
    problem(context, 'predicate-name-invalid', pair.key as Node);
    return undefined;
  }
  if (context.names.has(name)) {
    problem(context, 'predicate-duplicate', pair.key as Node, { predicate: name });
    return undefined;
  }
  context.names.add(name);
  return name;
}

function validateScalar(context: Context, pair: Pair): void {
  const before: number = context.problems.length;
  const name: string | undefined = readPredicateName(context, pair);
  const map: YAMLMap | undefined = itemMap(context, pair, 'schema_scalars');
  if (name === undefined || map === undefined) return;
  checkKeys(context, map, SCALAR_KEYS, name);
  const subjectTypes: EntityType[] = validateTypeList(context, map, 'domain', name, false);
  const description: string | undefined = readText(context, map, 'description', false, { predicate: name });
  const display: Partial<Record<Language, string>> = readDisplay(context, map, name);
  if (context.problems.length !== before) return;
  const predicate: OntologyPredicate = { name, kind: 'scalar', subjectTypes };
  if (description !== undefined) predicate.description = description;
  addDisplay(predicate, display);
  context.ontology.predicates.push(predicate);
}

function addDisplay(predicate: OntologyPredicate, display: Partial<Record<Language, string>>): void {
  if (Object.keys(display).length > 0) predicate.display = display;
}

function exactTypeList(node: unknown, type: EntityType): boolean {
  return isSeq(node) && node.items.length === 1 && textValue(node.items[0]) === type;
}

function sameTypes(a: EntityType[], b: EntityType[]): boolean {
  return a.length === b.length && a.every((type: EntityType): boolean => b.includes(type));
}

function validateConnection(context: Context, pair: Pair): void {
  const before: number = context.problems.length;
  const name: string | undefined = readPredicateName(context, pair);
  const map: YAMLMap | undefined = itemMap(context, pair, 'schema_connections');
  if (name === undefined || map === undefined) return;
  checkKeys(context, map, CONNECTION_KEYS, name);
  const isHasPersona: boolean = name === HAS_PERSONA;
  const subjectTypes: EntityType[] = validateTypeList(context, map, 'subject', name, isHasPersona);
  const objectTypes: EntityType[] = validateTypeList(context, map, 'object', name, isHasPersona);
  const symmetric: boolean = readFlag(context, map, 'symmetric', name);
  const labeled: boolean = readFlag(context, map, 'labeled', name);
  const description: string | undefined = readText(context, map, 'description', false, { predicate: name });
  const display: Partial<Record<Language, string>> = readDisplay(context, map, name);
  if (symmetric && !sameTypes(subjectTypes, objectTypes)) {
    problem(context, 'symmetric-types-differ', valueOf(map, 'symmetric'), { predicate: name });
  }
  if (
    isHasPersona &&
    (symmetric ||
      !exactTypeList(valueOf(map, 'subject'), 'Character') ||
      !exactTypeList(valueOf(map, 'object'), 'Persona'))
  ) {
    problem(context, 'has-persona-invalid', pair.key as Node, { predicate: name });
  }
  if (context.problems.length !== before) return;
  const predicate: OntologyPredicate = { name, kind: 'relationship', subjectTypes, objectTypes };
  if (symmetric) predicate.symmetric = true;
  if (labeled) predicate.labeled = true;
  if (description !== undefined) predicate.description = description;
  addDisplay(predicate, display);
  context.ontology.predicates.push(predicate);
}

function validateEntities(context: Context, root: YAMLMap): void {
  const entities: YAMLMap | undefined = readMap(context, root, 'schema_entities', true);
  if (entities === undefined) return;
  if (entities.items.length === 0) {
    problem(context, 'section-missing', field(root, 'schema_entities')?.key as Node, { key: 'schema_entities' });
  }
  entities.items.forEach((pair: Pair): void => validateEntityType(context, pair));
}

function validateConstraints(context: Context, root: YAMLMap): void {
  const constraints: YAMLMap | undefined = readMap(context, root, 'constraints', false);
  if (constraints === undefined) return;
  checkKeys(context, constraints, CONSTRAINT_KEYS);
  context.ontology.rules = readTextList(context, constraints, 'extraction');
  readTextList(context, constraints, 'structure');
}

function validateWorkflows(context: Context, root: YAMLMap): void {
  const workflows: YAMLMap | undefined = readMap(context, root, 'workflows', true);
  if (workflows === undefined) return;
  checkKeys(context, workflows, WORKFLOW_KEYS);
  const analysis: YAMLMap | undefined = readMap(context, workflows, 'analysis', true, 'workflows.analysis');
  if (analysis === undefined) return;
  checkKeys(context, analysis, ANALYSIS_KEYS);
  context.ontology.task = readText(context, analysis, 'task', true, { key: 'workflows.analysis.task' }) ?? '';
  readTextList(context, analysis, 'steps');
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
  validateEntities(context, root);
  readMap(context, root, 'schema_scalars', false)?.items.forEach((pair: Pair): void => validateScalar(context, pair));
  readMap(context, root, 'schema_connections', false)?.items.forEach((pair: Pair): void =>
    validateConnection(context, pair),
  );
  validateConstraints(context, root);
  validateWorkflows(context, root);
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
