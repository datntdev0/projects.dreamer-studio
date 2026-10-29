import { describe, expect, it } from 'vitest';
import { decodeUtf8, normalizeChapterText, chapterStats } from './novel-text';

describe('[TH03-03] novel text contracts', () => {
  it('rejects malformed UTF-8 and normalizes line endings and blank paragraphs', () => {
    expect(decodeUtf8(new Uint8Array([0xff]))).toBeNull();
    expect(normalizeChapterText('  one\r\n\r two \n')).toBe('one\ntwo');
  });

  it('counts paragraphs and Unicode code points excluding separators', () => {
    expect(chapterStats('猫\n🙂')).toEqual({ paragraphs: 2, chars: 2 });
  });
});
