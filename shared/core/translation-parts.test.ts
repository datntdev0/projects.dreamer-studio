import { describe, expect, it } from 'vitest';
import { translationParts } from './translation-parts';

describe('[TH04-05] translationParts', () => {
  it('groups whole paragraphs by character limit and keeps an oversized paragraph intact', () => {
    expect(translationParts(['ab', 'cd', '12345', 'x'], 4)).toEqual([['ab', 'cd'], ['12345'], ['x']]);
  });
});
