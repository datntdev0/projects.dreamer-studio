import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OntologyProblem } from '../models/analysis';
import type { OntologyProblemCode } from '../models/analysis';
import { parseOntology } from './ontology';

const HEAD: string[] = ['version: 1', 'entityTypes:', '  persona: A persona', '  location: A place', 'predicates:'];

function doc(...lines: string[]): string {
  return lines.join('\n');
}

function withPredicates(...lines: string[]): string {
  return doc(...HEAD, ...lines);
}

function problemOf(text: string, code: OntologyProblemCode): OntologyProblem {
  const found: OntologyProblem | undefined = parseOntology(text).problems.find(
    (item: OntologyProblem): boolean => item.code === code,
  );
  if (!found) throw new Error(`no ${code} problem`);
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

  it('parses without problems and lists five entity types', () => {
    expect(problems).toEqual([]);
    expect(ontology.entityTypes).toEqual(['character', 'persona', 'location', 'organization', 'glossary']);
  });

  it('defines persona of as persona to character', () => {
    const personaOf = ontology.predicates.find((item) => item.name === 'persona of');

    expect(personaOf).toMatchObject({ kind: 'relationship', subjectTypes: ['persona'], objectTypes: ['character'] });
  });

  it('uses character in no other predicate', () => {
    const others = ontology.predicates.filter((item) => item.name !== 'persona of');

    expect(others.length).toBeGreaterThan(0);
    for (const item of others) {
      expect(item.subjectTypes).not.toContain('character');
      expect(item.objectTypes ?? []).not.toContain('character');
    }
  });
});

describe('parseOntology valid input', () => {
  it('returns entity types, descriptions and predicates', () => {
    const text: string = withPredicates(
      '  lives in:',
      '    kind: relationship',
      '    subject: [persona]',
      '    object: [location]',
      '    description: Lives there',
      '  mood:',
      '    kind: scalar',
      '    subject: [persona, location]',
      '    values: [happy, sad]',
    );

    expect(parseOntology(text)).toEqual({
      problems: [],
      ontology: {
        entityTypes: ['persona', 'location'],
        entityTypeDescriptions: { persona: 'A persona', location: 'A place' },
        predicates: [
          {
            name: 'lives in',
            kind: 'relationship',
            subjectTypes: ['persona'],
            objectTypes: ['location'],
            description: 'Lives there',
          },
          { name: 'mood', kind: 'scalar', subjectTypes: ['persona', 'location'], allowedValues: ['happy', 'sad'] },
        ],
      },
    });
  });
});

describe('parseOntology problems', () => {
  it('reports yaml syntax errors', () => {
    expectProblem('version: [1', 'yaml-syntax', 1);
  });

  it('reports one yaml syntax error per line', () => {
    const lines: number[] = parseOntology(withPredicates('  a:', '    subject: [persona')).problems.map(
      (item: OntologyProblem): number => item.line,
    );

    expect(lines).toEqual([...new Set(lines)]);
  });

  it('reports a duplicate key as a yaml syntax error', () => {
    expectProblem(doc('version: 1', 'version: 1'), 'yaml-syntax', 2);
  });

  it('reports a root that is not a map', () => {
    expectProblem('- a', 'root-not-map', 1);
  });

  it('reports an unsupported version', () => {
    expectProblem(doc('version: 2', 'entityTypes:', '  persona: x', 'predicates:'), 'version-unsupported', 1);
  });

  it('reports a missing section', () => {
    expectProblem(doc('version: 1', 'entityTypes:', '  persona: x'), 'section-missing', 0, { key: 'predicates' });
  });

  it('reports a section that is not a map', () => {
    expectProblem(doc('version: 1', 'entityTypes: [persona]', 'predicates:'), 'section-not-map', 2, {
      key: 'entityTypes',
    });
  });

  it('reports an unknown root key', () => {
    expectProblem(doc(...HEAD, 'extra: 1'), 'unknown-key', 6, { key: 'extra' });
  });

  it('reports an unknown predicate key', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: [persona]', '    color: red');

    expectProblem(text, 'unknown-key', 9, { key: 'color', predicate: 'mood' });
  });

  it('reports an unknown entity type', () => {
    expectProblem(doc('version: 1', 'entityTypes:', '  dragon: x', 'predicates:'), 'entity-type-unknown', 3, {
      type: 'dragon',
    });
  });

  it('reports an unknown entity type inside a predicate', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: [dragon]');

    expectProblem(text, 'entity-type-unknown', 8, { type: 'dragon', key: 'subject', predicate: 'mood' });
  });

  it('reports an entity type that is not listed', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: [glossary]');

    expectProblem(text, 'entity-type-not-listed', 8, { type: 'glossary', predicate: 'mood' });
  });

  it('reports an entity description that is not text', () => {
    expectProblem(doc('version: 1', 'entityTypes:', '  persona: [a]', 'predicates:'), 'description-not-text', 3, {
      type: 'persona',
    });
  });

  it('reports a predicate description that is not text', () => {
    const text: string = withPredicates(
      '  mood:',
      '    kind: scalar',
      '    subject: [persona]',
      '    description: [a]',
    );

    expectProblem(text, 'description-not-text', 9, { predicate: 'mood' });
  });

  it('reports an empty predicate name', () => {
    expectProblem(withPredicates("  '':", '    kind: scalar', '    subject: [persona]'), 'predicate-name-empty', 6);
  });

  it('reports a predicate that is not a map', () => {
    expectProblem(withPredicates('  mood: 5'), 'predicate-not-map', 6, { predicate: 'mood' });
  });

  it('reports an invalid kind', () => {
    const text: string = withPredicates('  mood:', '    kind: other', '    subject: [persona]');

    expectProblem(text, 'kind-invalid', 7, { predicate: 'mood' });
  });

  it('reports an invalid type list', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: persona');

    expectProblem(text, 'type-list-invalid', 8, { key: 'subject', predicate: 'mood' });
  });

  it('reports a relationship without object', () => {
    const text: string = withPredicates('  knows:', '    kind: relationship', '    subject: [persona]');

    expectProblem(text, 'object-missing', 6, { predicate: 'knows' });
  });

  it('reports an object on a scalar', () => {
    const text: string = withPredicates(
      '  mood:',
      '    kind: scalar',
      '    subject: [persona]',
      '    object: [location]',
    );

    expectProblem(text, 'object-not-allowed', 9, { predicate: 'mood' });
  });

  it('reports values on a relationship', () => {
    const text: string = withPredicates(
      '  knows:',
      '    kind: relationship',
      '    subject: [persona]',
      '    object: [persona]',
      '    values: [a]',
    );

    expectProblem(text, 'values-not-allowed', 10, { predicate: 'knows' });
  });

  it('reports invalid values', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: [persona]', '    values: []');

    expectProblem(text, 'values-invalid', 9, { predicate: 'mood' });
  });

  it('reports a duplicate value', () => {
    const text: string = withPredicates('  mood:', '    kind: scalar', '    subject: [persona]', '    values: [a, a]');

    expectProblem(text, 'value-duplicate', 9, { predicate: 'mood', value: 'a' });
  });

  it('reports character outside persona of', () => {
    const text: string = doc(
      'version: 1',
      'entityTypes:',
      '  character: c',
      '  persona: p',
      'predicates:',
      '  mood:',
      '    kind: scalar',
      '    subject: [character]',
    );

    expectProblem(text, 'character-outside-persona-of', 8, { predicate: 'mood', key: 'subject' });
  });

  it('reports an invalid persona of', () => {
    const text: string = doc(
      'version: 1',
      'entityTypes:',
      '  character: c',
      '  persona: p',
      'predicates:',
      '  persona of:',
      '    kind: relationship',
      '    subject: [persona]',
      '    object: [persona]',
    );

    expectProblem(text, 'persona-of-invalid', 6, { predicate: 'persona of' });
  });

  it('reports a missing persona of', () => {
    const text: string = doc('version: 1', 'entityTypes:', '  character: c', '  persona: p', 'predicates:', '  a: {}');

    expectProblem(text, 'persona-of-missing', 0, { predicate: 'persona of' });
  });

  it('reports a missing persona type', () => {
    const text: string = doc('version: 1', 'entityTypes:', '  character: c', 'predicates:');

    expectProblem(text, 'persona-missing', 0, { type: 'persona' });
  });

  it('sorts problems by line', () => {
    const text: string = doc('version: 1', 'entityTypes:', '  character: c', 'predicates:', 'extra: 1');
    const lines: number[] = parseOntology(text).problems.map((item: OntologyProblem): number => item.line);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines).toEqual([...lines].sort((a: number, b: number): number => a - b));
  });

  it('keeps valid predicates when another predicate is invalid', () => {
    const text: string = withPredicates(
      '  bad:',
      '    kind: other',
      '    subject: [persona]',
      '  good:',
      '    kind: scalar',
      '    subject: [persona]',
    );
    const { ontology, problems } = parseOntology(text);

    expect(problems.map((item: OntologyProblem): string => item.code)).toContain('kind-invalid');
    expect(ontology.predicates.map((item) => item.name)).toEqual(['good']);
  });
});
