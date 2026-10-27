import { describe, expect, it } from 'vitest';
import { findTextContext, findTextMatches } from './text-match';

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

describe('findTextMatches with fold', () => {
  const fold = { fold: true };

  it('matches case-insensitively', () => {
    expect(findTextMatches('Mai Linh', 'MAI LINH', fold)).toEqual([{ start: 0, end: 8 }]);
  });

  it('matches NFC against NFD', () => {
    expect(findTextMatches('Café open', 'café', fold)).toEqual([{ start: 0, end: 5 }]);
    expect(findTextMatches('Café open', 'café', fold)).toEqual([{ start: 0, end: 4 }]);
  });

  it('treats a whitespace run or newline as one space and maps offsets to the original', () => {
    const text: string = 'Say  hello \n\t world';
    expect(findTextMatches(text, 'hello world', fold)).toEqual([{ start: 5, end: 19 }]);
    expect(findTextMatches('a b', 'a   b', fold)).toEqual([{ start: 0, end: 3 }]);
  });

  it('trims the query', () => {
    expect(findTextMatches('Mai Linh', '  Mai  ', fold)).toEqual([{ start: 0, end: 3 }]);
    expect(findTextMatches('Mai Linh', '   ', fold)).toEqual([]);
  });

  it('folds curly, low and angle quotes', () => {
    expect(findTextMatches('It’s fine', "it's", fold)).toEqual([{ start: 0, end: 4 }]);
    expect(findTextMatches('He said "go"', '“go”', fold)).toEqual([{ start: 8, end: 12 }]);
    expect(findTextMatches('«go»', '"go"', fold)).toEqual([{ start: 0, end: 4 }]);
    expect(findTextMatches('‚go‘', "'go'", fold)).toEqual([{ start: 0, end: 4 }]);
  });

  it('folds en and em dashes and the minus sign', () => {
    expect(findTextMatches('a–b — c−d', 'a-b - c-d', fold)).toEqual([{ start: 0, end: 9 }]);
  });

  it('highlights the original characters', () => {
    const text: string = 'He said “hello—world”.';
    const [match] = findTextMatches(text, '"hello-world"', fold);
    expect(text.slice(match.start, match.end)).toBe('“hello—world”');
  });

  it('keeps the old behaviour without fold', () => {
    expect(findTextMatches('It’s', "it's")).toEqual([]);
    expect(findTextMatches('It’s', "it's", {})).toEqual([]);
    expect(findTextMatches('a  b', 'a b')).toEqual([]);
    expect(findTextMatches('a–b', 'a-b')).toEqual([]);
  });
});

describe('findTextContext', () => {
  it('finds a folded quote and returns the original text', () => {
    const paragraphs: string[] = ['Nothing.', 'She said “go” now.'];
    expect(findTextContext(paragraphs, '"go"', { fold: true })).toEqual({
      before: 'She said ',
      match: '“go”',
      after: ' now.',
    });
  });

  it('does not find a folded quote without fold', () => {
    expect(findTextContext(['She said “go” now.'], '"go"')).toBeNull();
  });
});
