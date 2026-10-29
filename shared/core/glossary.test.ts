import { describe, expect, it } from 'vitest';
import type { GlossaryRow } from '../models/translation';
import { glossaryBatches, glossaryRunRows } from './glossary';

function row(entityName: string, kind: GlossaryRow['kind'], status: GlossaryRow['status'] = 'untranslated'): GlossaryRow {
  return { entityType: 'Persona', entityName, term: kind === 'name' ? null : `${entityName} ${kind}`, kind,
    translation: null, status, chapters: 1, chapterIndexes: [1] };
}

describe('[TH04-05] glossary rules', () => {
  it('keeps an entity and its terms together across batches and skips user-authored entries', () => {
    const prior = Array.from({ length: 49 }, (_, index) => row(`Entity ${index}`, 'name'));
    const grouped = [row('Mai', 'name'), row('Mai', 'alias')];
    const rows = [...prior, ...grouped, row('Lan', 'name', 'user')];
    expect(glossaryRunRows(rows, 'untranslated')).toEqual([...prior, ...grouped]);
    expect(glossaryBatches([...prior, ...grouped], 50)).toEqual([prior, grouped]);
  });
});
