import { describe, expect, it } from 'vitest';
import { findTextMatches } from './text-match';

describe('findTextMatches', () => {
  it('finds every case-insensitive match', () => {
    expect(findTextMatches('Dream a dream', 'DREAM')).toEqual([
      { start: 0, end: 5 },
      { start: 8, end: 13 },
    ]);
  });

  it('matches composed and decomposed accents in code point offsets', () => {
    const text: string = '😀 Café café';

    expect(findTextMatches(text, 'café')).toEqual([
      { start: 2, end: 7 },
      { start: 8, end: 12 },
    ]);
  });

  it('returns no matches for an empty query', () => {
    expect(findTextMatches('text', '')).toEqual([]);
  });
});
