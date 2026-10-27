import { describe, expect, it } from 'vitest';
import { analysisLevel } from './library-format';

describe('analysisLevel', () => {
  it('REQ-032 AC-6: is full when every chapter is analysed', () => {
    expect(analysisLevel({ analysed: 5, total: 5 })).toBe('full');
  });

  it('REQ-032 AC-6: is partial when some chapters are analysed', () => {
    expect(analysisLevel({ analysed: 2, total: 5 })).toBe('partial');
  });

  it('REQ-032 AC-6: is none when no chapter is analysed', () => {
    expect(analysisLevel({ analysed: 0, total: 5 })).toBe('none');
  });

  it('REQ-032 AC-6: is none for a novel without chapters', () => {
    expect(analysisLevel({ analysed: 0, total: 0 })).toBe('none');
  });
});
