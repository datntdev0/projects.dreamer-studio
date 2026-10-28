import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OntologyProblem } from '../models/analysis';
import type { OntologyProblemCode } from '../models/analysis';
import { parseOntology } from './ontology';
import { propertyTypes } from './ontology-rules';

const TASK: string = 'workflows: { analysis: { task: Extract facts. } }';

const HEAD: string[] = [
  'version: 1',
  TASK,
  'schema_entities:',
  '  Persona: { properties: { name: { required: true } } }',
  '  Location: { properties: { name: { required: true } } }',
];

function doc(...lines: string[]): string {
  return lines.join('\n');
}

function withScalars(...lines: string[]): string {
  return doc(...HEAD, 'schema_scalars:', ...lines);
}

function withConnections(...lines: string[]): string {
  return doc(...HEAD, 'schema_connections:', ...lines);
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
  const text: string = readFileSync(resolve(process.cwd(), 'electron/resources/ontology.format.yml'), 'utf8');
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

  it('gives predicates display names in every language', () => {
    expect(ontology.predicates.find((item) => item.name === 'appearance')?.display).toEqual({
      en: 'Appearance',
      vi: 'Ngoại hình',
    });
    for (const item of ontology.predicates) expect(Object.keys(item.display ?? {})).toEqual(['en', 'vi']);
  });
});

describe('parseOntology valid input', () => {
  it('returns every section', () => {
    const text: string = doc(
      'name: test',
      'version: 1',
      'schema_entities:',
      '  Persona:',
      '    description: A persona',
      '    examples: [Mai]',
      '    properties:',
      '      name:',
      '        required: true',
      '        description: The name',
      '      alias:',
      '        multiple: true',
      '  Location:',
      '    properties: { name: { required: true } }',
      'schema_scalars:',
      '  mood:',
      '    display: { en: Mood, vi: Tâm trạng }',
      '    domain: [Persona]',
      'schema_connections:',
      '  lives_in:',
      '    subject: [Persona]',
      '    object: [Location]',
      '    symmetric: false',
      '    description: Lives there',
      '  other:',
      '    subject: [Persona]',
      '    object: [Persona]',
      '    symmetric: true',
      '    labeled: true',
      'constraints:',
      '  extraction:',
      '    - Only stated facts.',
      '  structure: [Names are copied.]',
      'workflows:',
      '  analysis:',
      '    task: >',
      '      Extract facts.',
      '    steps: [candidates, predicates]',
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
          { name: 'mood', kind: 'scalar', subjectTypes: ['Persona'], display: { en: 'Mood', vi: 'Tâm trạng' } },
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

  it('allows the scalar, connection and constraint sections to be absent', () => {
    expect(parseOntology(doc(...HEAD)).problems).toEqual([]);
  });
});

describe('parseOntology problems', () => {
  it('reports YAML syntax errors', () => {
    expect(parseOntology('schema_entities: [Persona').problems[0].code).toBe('yaml-syntax');
  });

  it('reports a repeated key as a YAML error', () => {
    expect(parseOntology(doc(...HEAD, '  Persona: {}')).problems[0].code).toBe('yaml-syntax');
  });

  it('reports a root that is not a map', () => {
    expectProblem('- version: 1', 'root-not-map', 1);
  });

  it('reports an unsupported version and unknown keys', () => {
    const text: string = doc('version: 2', 'settings: {}', ...HEAD.slice(1));
    expectProblem(text, 'version-unsupported', 1);
    expectProblem(text, 'unknown-key', 2, { key: 'settings' });
    expectProblem(doc(...HEAD, 'constraints: { prompt: x }'), 'unknown-key', 6, { key: 'prompt' });
  });

  it('reports missing sections and task', () => {
    const keys: string[] = parseOntology('version: 1')
      .problems.filter((item: OntologyProblem): boolean => item.code === 'section-missing')
      .map((item: OntologyProblem): string => item.params.key);
    expect(keys).toEqual(['schema_entities', 'workflows']);
    expectProblem(doc(...HEAD.slice(2), 'workflows: { analysis: {} }'), 'section-missing', 0, {
      key: 'workflows.analysis.task',
    });
    expectProblem(doc('version: 1', TASK, 'schema_entities: {}'), 'section-missing', 3, { key: 'schema_entities' });
  });

  it('reports a section of the wrong shape and an item that is not a map', () => {
    expectProblem(doc(...HEAD, 'schema_scalars: []'), 'section-not-map', 6, { key: 'schema_scalars' });
    expectProblem(doc(...HEAD, 'constraints: { extraction: x }'), 'section-not-list', 6, { key: 'extraction' });
    expectProblem(withScalars('  gender: x'), 'item-not-map', 7, { key: 'schema_scalars' });
  });

  it('reports text fields that are not text', () => {
    expectProblem(doc('version: 1', 'workflows: { analysis: { task: 42 } }'), 'text-invalid', 2, {
      key: 'workflows.analysis.task',
    });
    expectProblem(doc(...HEAD, 'constraints: { extraction: [1] }'), 'text-invalid', 6, { key: 'extraction' });
  });

  it('reports an unknown entity type', () => {
    expectProblem(doc(...HEAD, '  Species: {}'), 'entity-type-unknown', 6, { type: 'Species' });
  });

  it('reports a type that is not listed', () => {
    expectProblem(withScalars('  mood:', '    domain: [Artifact]'), 'entity-type-not-listed', 8, {
      type: 'Artifact',
      key: 'domain',
      predicate: 'mood',
    });
  });

  it('reports empty and duplicate predicate names', () => {
    expectProblem(withScalars('  "": { domain: [Persona] }'), 'predicate-name-invalid', 7);
    const text: string = doc(
      ...HEAD,
      'schema_scalars:',
      '  mood: { domain: [Persona] }',
      'schema_connections:',
      '  mood: { subject: [Persona], object: [Persona] }',
    );
    expectProblem(text, 'predicate-duplicate', 9, { predicate: 'mood' });
  });

  it('reports entity property problems', () => {
    const text: string = doc(
      'version: 1',
      TASK,
      'schema_entities:',
      '  Persona:',
      '    properties:',
      '      nickname: {}',
      '      name: {}',
      '      alias: {}',
    );
    expectProblem(text, 'property-unknown', 6, { property: 'nickname', type: 'Persona' });
    expectProblem(text, 'name-property-invalid', 7, { type: 'Persona' });
    expectProblem(text, 'property-not-multiple', 8, { property: 'alias', type: 'Persona' });
  });

  it('reports a type without a name property', () => {
    const text: string = doc('version: 1', TASK, 'schema_entities:', '  Location: {}');
    expectProblem(text, 'name-property-invalid', 4, { type: 'Location' });
  });

  it('reports display names with an unknown language or no text', () => {
    const text: string = withScalars('  mood:', '    domain: [Persona]', '    display: { fr: Humeur, vi: "" }');
    expectProblem(text, 'unknown-key', 9, { key: 'fr', predicate: 'mood' });
    expectProblem(text, 'text-invalid', 9, { key: 'vi', predicate: 'mood' });
  });

  it('reports flags that are not booleans', () => {
    expectProblem(
      withConnections('  near:', '    subject: [Persona]', '    object: [Persona]', '    symmetric: yes'),
      'flag-invalid',
      10,
      { key: 'symmetric', predicate: 'near' },
    );
  });

  it('reports an invalid type list and unknown predicate keys', () => {
    const text: string = withConnections('  near:', '    subject: []', '    object: Location', '    to: x');
    const lists: OntologyProblem[] = parseOntology(text).problems.filter(
      (item: OntologyProblem): boolean => item.code === 'type-list-invalid',
    );
    expect(lists.map((item: OntologyProblem): number => item.line)).toEqual([8, 9]);
    expectProblem(text, 'unknown-key', 10, { key: 'to', predicate: 'near' });
  });

  it('reports a symmetric connection with different types', () => {
    expectProblem(
      withConnections('  near:', '    subject: [Persona]', '    object: [Location]', '    symmetric: true'),
      'symmetric-types-differ',
      10,
    );
  });

  it('enforces the persona rule', () => {
    const head: string[] = [
      'version: 1',
      TASK,
      'schema_entities:',
      '  Character: { properties: { name: { required: true } } }',
      '  Persona: { properties: { name: { required: true } } }',
    ];
    expectProblem(doc(...head), 'has-persona-missing', 0);
    expectProblem(
      doc(
        ...head,
        'schema_scalars:',
        '  age: { domain: [Character] }',
        'schema_connections:',
        '  has_persona: { subject: [Persona], object: [Character] }',
      ),
      'character-outside-has-persona',
      7,
      { predicate: 'age' },
    );
    expectProblem(
      doc(...head, 'schema_connections:', '  has_persona:', '    subject: [Persona]', '    object: [Character]'),
      'has-persona-invalid',
      7,
    );
    expectProblem(doc('version: 1', TASK, 'schema_entities:', '  Character: {}'), 'persona-missing', 0);
  });
});
