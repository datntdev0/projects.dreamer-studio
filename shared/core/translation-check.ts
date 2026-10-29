import { glossaryTerm } from './glossary';
import { findTextMatches } from './text-match';
import type { GlossaryRow, GlossaryUsed, TranslationIssue } from '../models/translation';

function containsTerm(text: string, term: string): boolean {
  return findTextMatches(text, term, { fold: true }).length > 0;
}

export function foundGlossary(rows: GlossaryRow[], title: string, paragraphs: string[]): GlossaryUsed[] {
  return rows.flatMap((row: GlossaryRow): GlossaryUsed[] => {
    const term: string = glossaryTerm(row);
    if (!containsTerm(title, term) && !paragraphs.some((paragraph: string) => containsTerm(paragraph, term))) {
      return [];
    }
    const { entityType, entityName, term: rowTerm, kind } = row;
    return [{ key: { entityType, entityName, term: rowTerm, kind }, translation: row.translation }];
  });
}

function nameIssue(
  name: GlossaryUsed,
  id: string,
  inTitle: boolean,
  sourceParagraph: number | null,
  translatedParagraph: number | null,
): TranslationIssue {
  return {
    id,
    kind: name.translation === null ? 'untranslated-name' : 'missing-name',
    name: glossaryTerm(name.key),
    translation: name.translation,
    inTitle,
    sourceParagraph,
    translatedParagraph,
    sourceCount: null,
    translatedCount: null,
  };
}

function isMissing(name: GlossaryUsed, texts: string[]): boolean {
  const translation: string | null = name.translation;
  return translation === null || !texts.some((text: string): boolean => containsTerm(text, translation));
}

export function checkTranslation(input: {
  source: { title: string; paragraphs: string[] };
  translation: { title: string; paragraphs: string[] };
  names: GlossaryUsed[];
}): TranslationIssue[] {
  const { source, translation } = input;
  const issues: TranslationIssue[] = [];
  const checkedNames: Set<string> = new Set();
  input.names.forEach((name: GlossaryUsed, nameIndex: number): void => {
    const term: string = glossaryTerm(name.key);
    const namePair: string = JSON.stringify([term, name.translation]);
    if (checkedNames.has(namePair)) {
      return;
    }
    checkedNames.add(namePair);
    const paragraph: number = source.paragraphs.findIndex((text: string): boolean => containsTerm(text, term));
    if (paragraph >= 0 && isMissing(name, translation.paragraphs)) {
      const translated: number | null = paragraph < translation.paragraphs.length ? paragraph : null;
      issues.push(nameIssue(name, `name-body-${nameIndex}`, false, paragraph, translated));
    }
    if (containsTerm(source.title, term) && isMissing(name, [translation.title])) {
      issues.push(nameIssue(name, `name-title-${nameIndex}`, true, null, null));
    }
  });
  if (source.paragraphs.length !== translation.paragraphs.length) {
    issues.push({
      id: 'paragraph-count',
      kind: 'paragraph-count',
      name: null,
      translation: null,
      inTitle: false,
      sourceParagraph: null,
      translatedParagraph: null,
      sourceCount: source.paragraphs.length,
      translatedCount: translation.paragraphs.length,
    });
  }
  return issues;
}
