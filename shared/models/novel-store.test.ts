import { describe, expect, it } from 'vitest';
import { isContentHash, isNovelId, normalizeTags, NovelMetadata, parseNovelMetadata } from './novel-store';

const novelId: string = '12345678-1234-4abc-8def-1234567890ab';
const contentHash: string = 'a'.repeat(64);

function sampleMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    id: novelId,
    originalTitle: 'Original title',
    title: 'Display title',
    author: 'Author',
    description: 'Description',
    language: 'en',
    publication: 'ongoing',
    tags: ['Fantasy'],
    cover: 'cover.png',
    importedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    chapters: [{ title: 'Chapter one', file: contentHash, paragraphs: 2, chars: 20 }],
    ...overrides,
  };
}

describe('novel store metadata', () => {
  it('parses valid metadata into a new object and drops unknown fields', () => {
    const chapter: Record<string, unknown> = {
      title: 'Chapter one',
      file: contentHash,
      paragraphs: 2,
      chars: 20,
      ignored: true,
    };
    const input: Record<string, unknown> = sampleMetadata({ chapters: [chapter], ignored: 'value' });

    const parsed: NovelMetadata | null = parseNovelMetadata(input);

    expect(parsed).toEqual({
      formatVersion: 1,
      id: novelId,
      originalTitle: 'Original title',
      title: 'Display title',
      author: 'Author',
      description: 'Description',
      language: 'en',
      publication: 'ongoing',
      tags: ['Fantasy'],
      cover: 'cover.png',
      importedAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
      chapters: [{ title: 'Chapter one', file: contentHash, paragraphs: 2, chars: 20 }],
    });
    expect(parsed).not.toBe(input);
    expect(parsed?.tags).not.toBe(input.tags);
    expect(parsed?.chapters).not.toBe(input.chapters);
    expect(parsed?.chapters[0]).not.toBe(chapter);
  });

  it.each<[string, unknown]>([
    ['formatVersion', 2],
    ['id', '1234'],
    ['originalTitle', ''],
    ['title', null],
    ['author', 10],
    ['description', false],
    ['language', ''],
    ['publication', 'draft'],
    ['tags', 'Fantasy'],
    ['tags', ['Fantasy', 3]],
    ['cover', 'portrait.png'],
    ['importedAt', 'not-a-date'],
    ['updatedAt', 'not-a-date'],
    ['chapters', null],
  ])('returns null for invalid %s', (field: string, value: unknown) => {
    expect(parseNovelMetadata(sampleMetadata({ [field]: value }))).toBeNull();
  });

  it.each<[string, Record<string, unknown>]>([
    ['title', { title: 3 }],
    ['file', { file: 'bad-hash' }],
    ['paragraphs', { paragraphs: -1 }],
    ['paragraphs', { paragraphs: 1.5 }],
    ['chars', { chars: -1 }],
    ['chars', { chars: 1.5 }],
  ])('returns null for an invalid chapter %s', (_field: string, overrides: Record<string, unknown>) => {
    const chapter: Record<string, unknown> = {
      title: 'Chapter one',
      file: contentHash,
      paragraphs: 2,
      chars: 20,
      ...overrides,
    };

    expect(parseNovelMetadata(sampleMetadata({ chapters: [chapter] }))).toBeNull();
  });

  it.each<unknown>([null, [], 'metadata', 1])('returns null when the metadata is not an object', (value: unknown) => {
    expect(parseNovelMetadata(value)).toBeNull();
  });
});

describe('novel store values', () => {
  it('normalizes tags and keeps the first case-insensitive duplicate', () => {
    expect(normalizeTags([' Fantasy ', '', 'fantasy', ' Sci-Fi ', 'SCI-FI', 'Drama'])).toEqual([
      'Fantasy',
      'Sci-Fi',
      'Drama',
    ]);
  });

  it.each<[string, boolean]>([
    [novelId, true],
    ['00000000-0000-0000-0000-000000000000', true],
    ['12345678-1234-4ABC-8def-1234567890ab', false],
    ['{12345678-1234-4abc-8def-1234567890ab}', false],
    ['12345678-1234-4abc-8def-1234567890a', false],
    ['../12345678-1234-4abc-8def-1234567890ab', false],
  ])('validates novel id %s', (value: string, valid: boolean) => {
    expect(isNovelId(value)).toBe(valid);
  });

  it.each<[string, boolean]>([
    [contentHash, true],
    ['0'.repeat(64), true],
    ['A'.repeat(64), false],
    ['a'.repeat(63), false],
    ['g'.repeat(64), false],
    [`../${'a'.repeat(64)}`, false],
  ])('validates content hash %s', (value: string, valid: boolean) => {
    expect(isContentHash(value)).toBe(valid);
  });
});
