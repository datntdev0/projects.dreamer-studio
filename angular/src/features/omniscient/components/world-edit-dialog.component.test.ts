import { describe, expect, it } from 'vitest';
import { chapterRanges } from './world-edit-dialog.component';

describe('chapterRanges', () => {
  it('collapses consecutive chapters into ranges', () => {
    expect(chapterRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 17])).toBe('1-10,12-13,15,17');
  });

  it('sorts and de-duplicates chapters before formatting', () => {
    expect(chapterRanges([13, 2, 1, 3, 2, 12])).toBe('1-3,12-13');
  });

  it('formats an empty chapter list', () => {
    expect(chapterRanges([])).toBe('');
  });
});
