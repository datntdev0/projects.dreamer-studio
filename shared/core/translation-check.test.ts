import { describe, expect, it } from 'vitest';
import type { GlossaryUsed } from '../models/translation';
import { checkTranslation, foundGlossary } from './translation-check';

const name: GlossaryUsed = {
  key: { entityType: 'Persona', entityName: 'Mai', term: null, kind: 'name' },
  translation: 'May',
};

describe('[TH04-05] translation checks', () => {
  it('finds used glossary names and reports a missing translated name or paragraph mismatch', () => {
    const rows = [{ ...name.key, translation: name.translation, status: 'llm' as const, chapters: 1, chapterIndexes: [1] }];
    expect(foundGlossary(rows, 'Title', ['Mai arrived.'])).toEqual([name]);
    expect(checkTranslation({
      source: { title: 'Title', paragraphs: ['Mai arrived.', 'She left.'] },
      translation: { title: 'Title', paragraphs: ['She arrived.'] },
      names: [name],
    }).map(({ kind }) => kind)).toEqual(['missing-name', 'paragraph-count']);
  });
});
