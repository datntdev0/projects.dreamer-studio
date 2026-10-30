import { describe, expect, it } from 'vitest';
import { findTextContext, findTextMatches, replaceTextMatches } from './text-match';

describe('[TH03-03] text matching contracts', () => {
  it('matches normalized Unicode and folded punctuation while returning source offsets', () => {
    expect(findTextMatches('Cafe\u0301 — Mai', 'Café - mai', { fold: true })).toEqual([{ start: 0, end: 11 }]);
  });

  it('returns no match for an empty query and replaces every non-overlapping match', () => {
    expect(findTextMatches('abc', '  ')).toEqual([]);
    expect(replaceTextMatches('Mai met Mai', 'Mai', 'Lan')).toBe('Lan met Lan');
  });

  it('returns context using the original paragraph text', () => {
    expect(findTextContext(['A “quote” here.'], '"quote"', { fold: true })?.match).toBe('“quote”');
  });
});
