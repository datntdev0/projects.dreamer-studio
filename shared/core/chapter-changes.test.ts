import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors/app-error';
import type { NovelChapterEntry } from '../models/novel-store';
import type { ChapterChange } from '../models/novel';
import { applyChapterChange } from './chapter-changes';
import type { ChapterFile, ChapterTexts } from './chapter-changes';

const CHAPTERS: NovelChapterEntry[] = [
  { title: 'One', file: 'f1', paragraphs: 2, chars: 4 },
  { title: 'Two', file: 'f2', paragraphs: 1, chars: 2 },
  { title: 'Three', file: 'f3', paragraphs: 1, chars: 2 },
];

function memoryTexts(): ChapterTexts & { written: string[][] } {
  const files: Record<string, string[]> = { f1: ['a1', 'a2'], f2: ['b1'], f3: ['c1'] };
  const written: string[][] = [];
  return {
    written,
    read: async (file: string): Promise<string[]> => files[file],
    write: async (paragraphs: string[]): Promise<ChapterFile> => {
      written.push(paragraphs);
      return { file: `new${written.length}`, paragraphs: paragraphs.length, chars: paragraphs.join('').length };
    },
  };
}

describe('applyChapterChange', () => {
  it('renames a chapter with a trimmed title', async () => {
    const result = await applyChapterChange(
      CHAPTERS,
      { kind: 'rename', chapter: { position: 2, file: 'f2' }, title: '  Second  ' },
      memoryTexts(),
    );

    expect(result.map((entry) => entry.title)).toEqual(['One', 'Second', 'Three']);
  });

  it('edits a chapter into a new file', async () => {
    const texts = memoryTexts();
    const result = await applyChapterChange(
      CHAPTERS,
      { kind: 'edit', chapter: { position: 1, file: 'f1' }, title: 'One', paragraphs: [' x ', '', 'y'] },
      texts,
    );

    expect(texts.written).toEqual([['x', 'y']]);
    expect(result[0]).toEqual({ title: 'One', file: 'new1', paragraphs: 2, chars: 2 });
  });

  it('moves chapters to a new index', async () => {
    const result = await applyChapterChange(
      CHAPTERS,
      { kind: 'move', chapters: [{ position: 3, file: 'f3' }], toIndex: 0 },
      memoryTexts(),
    );

    expect(result.map((entry) => entry.file)).toEqual(['f3', 'f1', 'f2']);
  });

  it('merges consecutive chapters under the first title', async () => {
    const texts = memoryTexts();
    const result = await applyChapterChange(
      CHAPTERS,
      {
        kind: 'merge',
        chapters: [
          { position: 2, file: 'f2' },
          { position: 1, file: 'f1' },
        ],
      },
      texts,
    );

    expect(texts.written).toEqual([['a1', 'a2', 'b1']]);
    expect(result.map((entry) => [entry.title, entry.file])).toEqual([
      ['One', 'new1'],
      ['Three', 'f3'],
    ]);
  });

  it('splits a chapter at a paragraph', async () => {
    const texts = memoryTexts();
    const result = await applyChapterChange(
      CHAPTERS,
      { kind: 'split', chapter: { position: 1, file: 'f1' }, atParagraph: 1, title: 'One b' },
      texts,
    );

    expect(texts.written).toEqual([['a1'], ['a2']]);
    expect(result.map((entry) => [entry.title, entry.file])).toEqual([
      ['One', 'new1'],
      ['One b', 'new2'],
      ['Two', 'f2'],
      ['Three', 'f3'],
    ]);
  });

  it('deletes chapters', async () => {
    const result = await applyChapterChange(
      CHAPTERS,
      {
        kind: 'delete',
        chapters: [
          { position: 1, file: 'f1' },
          { position: 3, file: 'f3' },
        ],
      },
      memoryTexts(),
    );

    expect(result.map((entry) => entry.file)).toEqual(['f2']);
  });

  it.each<[string, ChapterChange]>([
    ['a stale reference', { kind: 'delete', chapters: [{ position: 1, file: 'f2' }] }],
    ['an empty title', { kind: 'rename', chapter: { position: 1, file: 'f1' }, title: '   ' }],
    ['an empty edit', { kind: 'edit', chapter: { position: 1, file: 'f1' }, title: 'One', paragraphs: [' '] }],
    ['a destination out of range', { kind: 'move', chapters: [{ position: 1, file: 'f1' }], toIndex: 3 }],
    ['a single merged chapter', { kind: 'merge', chapters: [{ position: 1, file: 'f1' }] }],
    [
      'non-consecutive merged chapters',
      {
        kind: 'merge',
        chapters: [
          { position: 1, file: 'f1' },
          { position: 3, file: 'f3' },
        ],
      },
    ],
    [
      'a split at the last paragraph',
      { kind: 'split', chapter: { position: 2, file: 'f2' }, atParagraph: 1, title: 'X' },
    ],
  ])('rejects %s', async (_, change) => {
    await expect(applyChapterChange(CHAPTERS, change, memoryTexts())).rejects.toMatchObject({
      code: ErrorCode.ChapterChangeInvalid,
    });
  });
});
