import { describe, expect, it } from 'vitest';
import { contentHash, decodeUtf8, normalizeChapterText, normalizeLineEndings, splitParagraphs } from './novel-text';

describe('novel text', () => {
  it('removes a UTF-8 BOM', () => {
    const bytes: Uint8Array = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]);

    expect(decodeUtf8(bytes)).toBe('abc');
  });

  it('rejects invalid UTF-8', () => {
    const bytes: Uint8Array = new Uint8Array([0xc3, 0x28]);

    expect(decodeUtf8(bytes)).toBeNull();
  });

  it('normalizes CRLF and CR to LF', () => {
    expect(normalizeLineEndings('one\r\ntwo\rthree\nfour')).toBe('one\ntwo\nthree\nfour');
  });

  it('trims lines and drops blank paragraphs', () => {
    const text: string = '  first  \r\n\t\rsecond\n\u3000third\u3000\n   ';

    expect(splitParagraphs(text)).toEqual(['first', 'second', 'third']);
  });

  it('returns no paragraphs for empty text', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs(' \t\r\n\u3000')).toEqual([]);
  });

  it('normalizes chapter text to one paragraph per line', () => {
    expect(normalizeChapterText('  first  \r\n\r\n second\r third \n')).toBe('first\nsecond\nthird');
  });

  it('hashes UTF-8 text with SHA-256', async () => {
    expect(await contentHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns the same hash for the same text', async () => {
    const first: string = await contentHash('same text');
    const second: string = await contentHash('same text');

    expect(second).toBe(first);
  });
});
