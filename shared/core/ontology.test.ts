import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OntologyProblem } from '../models/analysis';
import type { OntologyProblemCode } from '../models/analysis';
import { parseOntology } from './ontology';
import { propertyTypes } from './ontology-rules';

const HEAD: string[] = [
  'version: 1',
  'task: Extract facts.',
  'entity_schema:',
  '  - type: Persona',
  '    properties: [{ property: name, required: true }]',
  '  - { type: Location, properties: [{ property: name, required: true }] }',
];

function doc(...lines: string[]): string {
  return lines.join('\n');
}

function withScalars(...lines: string[]): string {
  return doc(...HEAD, 'scalar_predicates:', ...lines, 'connection_predicates: []');
}

function withConnections(...lines: string[]): string {
  return doc(...HEAD, 'scalar_predicates: []', 'connection_predicates:', ...lines);
}

function problemOf(text: string, code: OntologyProblemCode): OntologyProblem {
  const found: OntologyProblem | undefined = parseOntology(text).problems.find(
    (item: OntologyProblem): boolean => item.code === code,
  );
  if (!found) throw new Error(`no ${code} problem in ${JSON.stringify(parseOntology(text).problems)}`);
  return found;
}

function expectProblem(
  text: string,
  code: OntologyProblemCode,
  line: number,
  params: Record<string, string> = {},
): void {
  const found: OntologyProblem = problemOf(text, code);
  expect(found.line).toBe(line);
  expect(found.params).toMatchObject(params);
}

describe('parseOntology default file', () => {
  const text: string = readFileSync(resolve(process.cwd(), 'electron/resources/ontology.default.yml'), 'utf8');
  const { ontology, problems } = parseOntology(text);

  it('parses without problems and lists six entity types', () => {
    expect(problems).toEqual([]);
    expect(ontology.entityTypes).toEqual(['Character', 'Persona', 'Location', 'Organization', 'Artifact', 'Glossary']);
    expect(ontology.task).not.toBe('');
    expect(ontology.rules.length).toBeGreaterThan(0);
  });

  it('defines has_persona as character to persona', () => {
    const hasPersona = ontology.predicates.find((item) => item.name === 'has_persona');

    expect(hasPersona).toMatchObject({ kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Persona'] });
  });

  it('uses character only in has_persona', () => {
    const others = ontology.predicates.filter((item) => item.name !== 'has_persona');

    expect(others.length).toBeGreaterThan(0);
    for (const item of others) {
      expect(item.subjectTypes).not.toContain('Character');
      expect(item.objectTypes ?? []).not.toContain('Character');
    }
  });

  it('gives every type a required name and only personas aliases and titles', () => {
    expect(propertyTypes(ontology, 'name')).toEqual(ontology.entityTypes);
    expect(propertyTypes(ontology, 'alias')).toEqual(['Persona']);
    expect(propertyTypes(ontology, 'title')).toEqual(['Persona']);
    expect(ontology.entityTypeProperties.Persona).toContainEqual(
      expect.objectContaining({ name: 'name', required: true }),
    );
    expect(ontology.predicates.map((item) => item.name)).not.toContain('title');
  });
});

describe('parseOntology valid input', () => {
  it('returns every section', () => {
    const text: string = doc(
      'name: test',
      'version: 1',
      'task: >',
      '  Extract facts.',
      'rules:',
      '  - Only stated facts.',
      'entity_schema:',
      '  - type: Persona',
      '    description: A persona',
      '    examples: [Mai]',
      '    properties:',
      '      - property: name',
      '        required: true',
      '        description: The name',
      '      - property: alias',
      '        multiple: true',
      '  - type: Location',
      '    properties: [{ property: name, required: true }]',
      'scalar_predicates:',
      '  - predicate: mood',
      '    domain: [Persona]',
      'connection_predicates:',
      '  - predicate: lives_in',
      '    subject: [Persona]',
      '    object: [Location]',
      '    symmetric: false',
      '    description: Lives there',
      '  - predicate: other',
      '    subject: [Persona]',
      '    object: [Persona]',
      '    symmetric: true',
      '    labeled: true',
    );

    expect(parseOntology(text)).toEqual({
      problems: [],
      ontology: {
        name: 'test',
        task: 'Extract facts.',
        rules: ['Only stated facts.'],
        entityTypes: ['Persona', 'Location'],
        entityTypeDescriptions: { Persona: 'A persona' },
        entityTypeExamples: { Persona: ['Mai'] },
        entityTypeProperties: {
          Persona: [
            { name: 'name', required: true, multiple: false, description: 'The name' },
            { name: 'alias', required: false, multiple: true },
          ],
          Location: [{ name: 'name', required: true, multiple: false }],
        },
        predicates: [
          { name: 'mood', kind: 'scalar', subjectTypes: ['Persona'] },
          {
            name: 'lives_in',
            kind: 'relationship',
            subjectTypes: ['Persona'],
            objectTypes: ['Location'],
            description: 'Lives there',
          },
          {
            name: 'other',
            kind: 'relationship',
            subjectTypes: ['Persona'],
            objectTypes: ['Persona'],
            symmetric: true,
            labeled: true,
          },
        ],
      },
    });
  });
});

describe('parseOntology problems', () => {
  it('reports YAML syntax errors', () => {
    expect(parseOntology('entity_schema: [Persona').problems[0].code).toBe('yaml-syntax');
  });

  it('reports a root that is not a map', () => {
    expectProblem('- version: 1', 'root-not-map', 1);
  });

  it('reports an unsupported version and unknown root keys', () => {
    const text: string = doc('version: 2', 'settings: {}', ...HEAD.slice(1));
    expectProblem(text, 'version-unsupported', 1);
    expectProblem(text, 'unknown-key', 2, { key: 'settings' });
  });

  it('reports missing sections and task', () => {
    const keys: string[] = parseOntology('version: 1')
      .problems.filter((item: OntologyProblem): boolean => item.code === 'section-missing')
      .map((item: OntologyProblem): string => item.params.key);
    expect(keys).toEqual(['task', 'entity_schema', 'scalar_predicates', 'connection_predicates']);
  });

  it('reports a section that is not a list and an item that is not a map', () => {
    expectProblem(doc(...HEAD, 'scalar_predicates: {}', 'connection_predicates: []'), 'section-not-list', 7, {
      key: 'scalar_predicates',
    });
    expectProblem(withScalars('  - gender'), 'item-not-map', 8, { key: 'scalar_predicates' });
  });

  it('reports text fields that are not text', () => {
    expectProblem(doc('version: 1', 'task: 42'), 'text-invalid', 2, { key: 'task' });
    expectProblem(doc('version: 1', 'task: x', 'rules: [1]'), 'text-invalid', 3, { key: 'rules' });
  });

  it('reports unknown and duplicate entity types', () => {
    const text: string = doc(...HEAD, '  - type: Species', '  - type: Persona');
    expectProblem(text, 'entity-type-unknown', 7, { type: 'Species' });
    expectProblem(text, 'entity-type-duplicate', 8, { type: 'Persona' });
  });

  it('reports a type that is not listed', () => {
    expectProblem(withScalars('  - predicate: mood', '    domain: [Artifact]'), 'entity-type-not-listed', 9, {
      type: 'Artifact',
      key: 'domain',
      predicate: 'mood',
    });
  });

  it('reports empty and duplicate predicate names', () => {
    expectProblem(withScalars('  - domain: [Persona]'), 'predicate-name-invalid', 8);
    const text: string = withScalars(
      '  - predicate: mood',
      '    domain: [Persona]',
      '  - predicate: mood',
      '    domain: [Persona]',
    );
    expectProblem(text, 'predicate-duplicate', 10, { predicate: 'mood' });
  });

  it('reports entity property problems', () => {
    const text: string = doc(
      'version: 1',
      'task: x',
      'entity_schema:',
      '  - type: Persona',
      '    properties:',
      '      - property: nickname',
      '      - property: name',
      '      - property: name',
      '      - property: alias',
      'scalar_predicates: []',
      'connection_predicates: []',
    );
    expectProblem(text, 'property-unknown', 6, { property: 'nickname', type: 'Persona' });
    expectProblem(text, 'name-property-invalid', 7, { type: 'Persona' });
    expectProblem(text, 'property-duplicate', 8, { property: 'name', type: 'Persona' });
    expectProblem(text, 'property-not-multiple', 9, { property: 'alias', type: 'Persona' });
  });

  it('reports a type without a name property', () => {
    const text: string = doc('version: 1', 'task: x', 'entity_schema:', '  - type: Location', 'scalar_predicates: []');
    expectProblem(text, 'name-property-invalid', 4, { type: 'Location' });
  });

  it('reports flags that are not booleans', () => {
    expectProblem(
      withConnections('  - predicate: near', '    subject: [Persona]', '    object: [Persona]', '    symmetric: yes'),
      'flag-invalid',
      12,
      { key: 'symmetric', predicate: 'near' },
    );
  });

  it('reports an invalid type list and unknown predicate keys', () => {
    const text: string = withConnections('  - predicate: near', '    subject: []', '    object: Location', '    to: x');
    const lists: OntologyProblem[] = parseOntology(text).problems.filter(
      (item: OntologyProblem): boolean => item.code === 'type-list-invalid',
    );
    expect(lists.map((item: OntologyProblem): number => item.line)).toEqual([10, 11]);
    expectProblem(text, 'unknown-key', 12, { key: 'to', predicate: 'near' });
  });

  it('reports a symmetric connection with different types', () => {
    expectProblem(
      withConnections('  - predicate: near', '    subject: [Persona]', '    object: [Location]', '    symmetric: true'),
      'symmetric-types-differ',
      12,
    );
  });

  it('enforces the persona rule', () => {
    const head: string[] = ['version: 1', 'task: x', 'entity_schema:', '  - type: Character', '  - type: Persona'];
    expectProblem(doc(...head, 'scalar_predicates: []', 'connection_predicates: []'), 'has-persona-missing', 0);
    expectProblem(
      doc(
        ...head,
        'scalar_predicates:',
        '  - predicate: age',
        '    domain: [Character]',
        'connection_predicates:',
        '  - predicate: has_persona',
        '    subject: [Persona]',
        '    object: [Character]',
      ),
      'character-outside-has-persona',
      8,
      { predicate: 'age' },
    );
    expectProblem(
      doc(
        ...head,
        'scalar_predicates: []',
        'connection_predicates:',
        '  - predicate: has_persona',
        '    subject: [Persona]',
        '    object: [Character]',
      ),
      'has-persona-invalid',
      8,
    );
    expectProblem(
      doc('version: 1', 'task: x', 'entity_schema:', '  - type: Character', 'scalar_predicates: []'),
      'persona-missing',
      0,
    );
  });
});
