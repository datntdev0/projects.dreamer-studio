import { describe, expect, it } from 'vitest';
import { safeFileName } from './file-name';

describe('safeFileName', () => {
  it('replaces reserved characters and trims trailing dots', () => {
    expect(safeFileName('  A:B/C*\tD?.. ')).toBe('A B C D');
  });

  it('prefixes Windows reserved names', () => {
    expect(safeFileName('con.txt')).toBe('_con.txt');
  });

  it('falls back when nothing is left', () => {
    expect(safeFileName(' ... ')).toBe('novel');
  });
});
