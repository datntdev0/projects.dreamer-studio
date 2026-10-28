import { parse } from 'yaml';
import { PACKAGE_METADATA_FIELDS, PACKAGE_PROBLEM_CODES } from '../models/novel-package';
import { PACKAGE_REFUSALS, PACKAGE_WARNING_CODES } from '../models/novel-package';
import type { PackageParams } from '../models/novel-package';

export type FieldType = 'string' | 'number' | 'array' | 'object' | 'null';

export interface FieldGate {
  code: string;
  param: string;
}

export interface FieldSchema {
  types: FieldType[];
  required: boolean;
  uniqueItems: boolean;
  default?: unknown;
  const?: string | number;
  enum?: (string | number)[];
  minLength?: number;
  minItems?: number;
  pattern?: RegExp;
  format?: 'bcp47';
  items?: FieldSchema;
  fields?: FieldSchemas;
  gate?: FieldGate;
}

export type FieldSchemas = Record<string, FieldSchema>;

export interface PackageFormat {
  extension: string;
  encrypted: boolean;
  maxBytes: number;
  maxUnpackedBytes: number;
  maxEntries: number;
  metadataFile: string;
  metadataMaxBytes: number;
  chapterDir: string;
  chapterMaxBytes: number;
  coverMimes: string[];
  coverMaxBytes: number;
  metadata: FieldSchemas;
  exportSeparator: string;
}

export interface FieldProblem {
  code: 'fieldMissing' | 'fieldInvalid' | 'languageInvalid';
  field: string;
  params: PackageParams;
}

export interface FieldsCheck {
  value: Record<string, unknown>;
  problems: FieldProblem[];
  kept: Map<string, number[]>;
}

export type GateCheck =
  | { status: 'ok' }
  | { status: 'missing'; field: string }
  | { status: 'mismatch'; field: string; gate: FieldGate; value: string | number };

type Raw = Record<string, unknown>;

const FIELD_TYPES: FieldType[] = ['string', 'number', 'array', 'object', 'null'];
const FIELD_KEYS: string[] = [
  'type',
  'required',
  'uniqueItems',
  'default',
  'const',
  'enum',
  'minLength',
  'minItems',
  'pattern',
  'format',
  'items',
  'fields',
  'gate',
  'unknownFields',
];

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, reason: string): never {
  throw new Error(`package.format.yml · ${path}: ${reason}`);
}

function map(value: unknown, path: string): Raw {
  return isRecord(value) ? value : fail(path, 'expected a map');
}

function text(value: unknown, path: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fail(path, 'expected a non-empty string');
}

function count(value: unknown, path: string): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fail(path, 'expected a whole number');
}

function flag(value: unknown, path: string): boolean {
  if (value === undefined) return false;
  return typeof value === 'boolean' ? value : fail(path, 'expected true or false');
}

function list(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(path, 'expected a list');
}

function scalar(value: unknown, path: string): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : fail(path, 'expected a string or a number');
}

function fieldType(value: unknown, path: string): FieldType {
  return FIELD_TYPES.includes(value as FieldType) ? (value as FieldType) : fail(path, `unknown type ${String(value)}`);
}

function pattern(value: unknown, path: string): RegExp {
  try {
    return new RegExp(text(value, path));
  } catch {
    return fail(path, 'invalid regular expression');
  }
}

function gate(value: unknown, path: string): FieldGate {
  const raw: Raw = map(value, path);
  const code: string = text(raw.code, `${path}.code`);
  const codes: string[] = [...PACKAGE_REFUSALS, ...PACKAGE_PROBLEM_CODES];
  if (!codes.includes(code)) fail(`${path}.code`, `unknown code ${code}`);
  return { code, param: text(raw.param, `${path}.param`) };
}

function parseField(value: unknown, path: string): FieldSchema {
  const raw: Raw = map(value, path);
  const unknownKey: string | undefined = Object.keys(raw).find((key: string): boolean => !FIELD_KEYS.includes(key));
  if (unknownKey) fail(`${path}.${unknownKey}`, 'unknown key');
  const types: unknown[] = Array.isArray(raw.type) ? raw.type : [raw.type];
  const field: FieldSchema = {
    types: types.map((type: unknown): FieldType => fieldType(type, `${path}.type`)),
    required: flag(raw.required, `${path}.required`),
    uniqueItems: flag(raw.uniqueItems, `${path}.uniqueItems`),
  };
  if ('default' in raw) field.default = raw.default;
  if (raw.const !== undefined) field.const = scalar(raw.const, `${path}.const`);
  if (raw.enum !== undefined)
    field.enum = list(raw.enum, `${path}.enum`).map((item: unknown) => scalar(item, `${path}.enum`));
  if (raw.minLength !== undefined) field.minLength = count(raw.minLength, `${path}.minLength`);
  if (raw.minItems !== undefined) field.minItems = count(raw.minItems, `${path}.minItems`);
  if (raw.pattern !== undefined) field.pattern = pattern(raw.pattern, `${path}.pattern`);
  if (raw.format !== undefined) field.format = raw.format === 'bcp47' ? 'bcp47' : fail(`${path}.format`, 'unknown');
  if (raw.items !== undefined) field.items = parseField(raw.items, `${path}.items`);
  if (raw.fields !== undefined) field.fields = parseFields(raw.fields, `${path}.fields`);
  if (raw.gate !== undefined) field.gate = gate(raw.gate, `${path}.gate`);
  if (raw.unknownFields !== undefined && raw.unknownFields !== 'ignored') fail(`${path}.unknownFields`, 'only ignored');
  return field;
}

function parseFields(value: unknown, path: string): FieldSchemas {
  const raw: Raw = map(value, path);
  return Object.fromEntries(
    Object.entries(raw).map(([name, field]: [string, unknown]) => [name, parseField(field, `${path}.${name}`)]),
  );
}

function checkCodes(constraints: Raw, key: string, codes: readonly string[]): void {
  const listed: unknown[] = list(constraints[key], `constraints.${key}`);
  const missing: string[] = codes.filter((code: string): boolean => !listed.includes(code));
  const extra: unknown[] = listed.filter((code: unknown): boolean => !codes.includes(code as string));
  if (missing.length || extra.length)
    fail(`constraints.${key}`, `codes differ from the app (missing: ${missing}; unknown: ${extra})`);
}

export function parsePackageFormat(source: string): PackageFormat {
  const root: Raw = map(parse(source), 'root');
  const pkg: Raw = map(root.schema_package, 'schema_package');
  const entries: Raw = map(pkg.entries, 'schema_package.entries');
  const metadataEntry: Raw = map(entries.metadata, 'schema_package.entries.metadata');
  const chapterEntry: Raw = map(entries.chapter, 'schema_package.entries.chapter');
  const coverEntry: Raw = map(entries.cover, 'schema_package.entries.cover');
  const metadataRoot: FieldSchema = parseField(root.schema_metadata_json, 'schema_metadata_json');
  const metadata: FieldSchemas = metadataRoot.fields ?? fail('schema_metadata_json.fields', 'missing');
  const chapterText: Raw = map(root.schema_chapter_text, 'schema_chapter_text');
  const constraints: Raw = map(root.constraints, 'constraints');
  PACKAGE_METADATA_FIELDS.forEach((name: string): void => {
    if (!metadata[name]) fail(`schema_metadata_json.fields.${name}`, 'missing; the app reads this field');
  });
  checkCodes(constraints, 'refusal', PACKAGE_REFUSALS);
  checkCodes(constraints, 'problem', PACKAGE_PROBLEM_CODES);
  checkCodes(constraints, 'warning', PACKAGE_WARNING_CODES);
  return {
    extension: text(pkg.extension, 'schema_package.extension'),
    encrypted: flag(pkg.encrypted, 'schema_package.encrypted'),
    maxBytes: count(pkg.maxBytes, 'schema_package.maxBytes'),
    maxUnpackedBytes: count(pkg.maxUnpackedBytes, 'schema_package.maxUnpackedBytes'),
    maxEntries: count(pkg.maxEntries, 'schema_package.maxEntries'),
    metadataFile: text(metadataEntry.path, 'schema_package.entries.metadata.path'),
    metadataMaxBytes: count(metadataEntry.maxBytes, 'schema_package.entries.metadata.maxBytes'),
    chapterDir: text(chapterEntry.dir, 'schema_package.entries.chapter.dir'),
    chapterMaxBytes: count(chapterEntry.maxBytes, 'schema_package.entries.chapter.maxBytes'),
    coverMimes: list(coverEntry.mime, 'schema_package.entries.cover.mime').map((mime: unknown): string =>
      text(mime, 'schema_package.entries.cover.mime'),
    ),
    coverMaxBytes: count(coverEntry.maxBytes, 'schema_package.entries.cover.maxBytes'),
    metadata,
    exportSeparator: text(chapterText.exportSeparator, 'schema_chapter_text.exportSeparator'),
  };
}

function typeOf(value: unknown): FieldType | null {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : null;
  return isRecord(value) ? 'object' : null;
}

function emptyValue(schema: FieldSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.types.includes('string')) return '';
  if (schema.types.includes('array')) return [];
  return null;
}

function allowed(value: string | number, schema: FieldSchema): boolean {
  return (schema.const === undefined || value === schema.const) && (!schema.enum || schema.enum.includes(value));
}

class FieldChecker {
  readonly problems: FieldProblem[] = [];
  readonly kept: Map<string, number[]> = new Map();

  fields(value: Raw, fields: FieldSchemas, prefix: string = ''): Raw {
    return Object.fromEntries(
      Object.entries(fields).map(([name, schema]: [string, FieldSchema]) => [
        name,
        this.field(`${prefix}${name}`, value[name], schema),
      ]),
    );
  }

  field(path: string, raw: unknown, schema: FieldSchema): unknown {
    if (raw === undefined) return schema.required ? this.fail('fieldMissing', path, schema) : emptyValue(schema);
    const type: FieldType | null = typeOf(raw);
    if (type === null || !schema.types.includes(type)) return this.fail('fieldInvalid', path, schema);
    if (type === 'string') return this.string(path, raw as string, schema);
    if (type === 'array') return this.array(path, raw as unknown[], schema);
    if (type === 'object') return schema.fields ? this.fields(raw as Raw, schema.fields, `${path}.`) : raw;
    if (type === 'number' && !allowed(raw as number, schema)) return this.fail('fieldInvalid', path, schema);
    return raw;
  }

  private string(path: string, raw: string, schema: FieldSchema): unknown {
    const value: string = raw.trim();
    if (schema.required && !value) return this.fail('fieldMissing', path, schema);
    const invalid: boolean =
      value.length < (schema.minLength ?? 0) || !allowed(value, schema) || !(schema.pattern?.test(value) ?? true);
    if (invalid) return this.fail('fieldInvalid', path, schema);
    if (schema.format !== 'bcp47') return value;
    try {
      return Intl.getCanonicalLocales(value)[0];
    } catch {
      this.problems.push({ code: 'languageInvalid', field: path, params: { value } });
      return value;
    }
  }

  private array(path: string, raw: unknown[], schema: FieldSchema): unknown {
    if (raw.length < (schema.minItems ?? 0)) return this.fail('fieldInvalid', path, schema);
    const items: FieldSchema | undefined = schema.items;
    if (!items) return raw;
    if (items.types.includes('object')) return this.objectItems(path, raw, items);
    const checker: FieldChecker = new FieldChecker();
    const values: unknown[] = raw.map((item: unknown, index: number) =>
      checker.field(`${path}[${index}]`, item, items),
    );
    if (checker.problems.length) return this.fail('fieldInvalid', path, schema);
    return schema.uniqueItems ? uniqueValues(values) : values.filter((value: unknown): boolean => value !== '');
  }

  private objectItems(path: string, raw: unknown[], items: FieldSchema): unknown[] {
    const values: unknown[] = [];
    const kept: number[] = [];
    raw.forEach((item: unknown, index: number): void => {
      const checker: FieldChecker = new FieldChecker();
      const value: unknown = checker.field(`${path}[${index}]`, item, items);
      if (checker.problems.length) {
        this.problems.push({ code: 'fieldInvalid', field: `${path}[${index}]`, params: {} });
        return;
      }
      values.push(value);
      kept.push(index);
    });
    this.kept.set(path, kept);
    return values;
  }

  private fail(code: FieldProblem['code'], path: string, schema: FieldSchema): unknown {
    this.problems.push({ code, field: path, params: {} });
    return emptyValue(schema);
  }
}

function uniqueValues(values: unknown[]): unknown[] {
  const seen: Set<string> = new Set();
  return values.filter((value: unknown): boolean => {
    const key: string = String(value).toLocaleLowerCase('en-US');
    if (value === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkFields(value: Raw, fields: FieldSchemas): FieldsCheck {
  const checker: FieldChecker = new FieldChecker();
  const checked: Raw = checker.fields(value, fields);
  return { value: checked, problems: checker.problems, kept: checker.kept };
}

export function checkGates(value: Raw, fields: FieldSchemas): GateCheck {
  for (const [name, schema] of Object.entries(fields)) {
    if (!schema.gate) continue;
    const raw: unknown = value[name];
    if (raw === undefined) return { status: 'missing', field: name };
    const checker: FieldChecker = new FieldChecker();
    checker.field(name, raw, schema);
    if (checker.problems.length) {
      return { status: 'mismatch', field: name, gate: schema.gate, value: typeof raw === 'number' ? raw : String(raw) };
    }
  }
  return { status: 'ok' };
}
