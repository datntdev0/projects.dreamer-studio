import { describe, expect, it } from 'vitest';
import type { NovelChapterEntry } from '../models/novel-store';
import type { GlossaryEntry, GlossaryKey, TranslationIndexFile } from '../models/translation';
import { chapterTranslationStatuses, contentRunQueue, translatedCount } from './translation-status';

const chapters = [{ file: 'chapter-a', title: 'A' }, { file: 'chapter-b', title: 'B' }] as NovelChapterEntry[];

describe('[TH04-05] translation status rules', () => {
  it('queues untranslated chapters and counts only completed translations', () => {
    const statuses = chapterTranslationStatuses(chapters, null, [], 'instruction');
    expect(statuses.map(({ status }) => status)).toEqual(['not-translated', 'not-translated']);
    expect(contentRunQueue({ mode: 'missing', from: null, to: null, overwrite: false, language: 'vi' }, statuses)).toEqual([1, 2]);
    expect(translatedCount(statuses)).toBe(0);
  });

  it('marks a translation stale when a glossary entry it used changes', () => {
    const key: GlossaryKey = { entityType: 'Persona', entityName: 'Mai', term: null, kind: 'name' };
    const index: TranslationIndexFile = {
      version: 1,
      chapters: [{
        index: 1, file: 'chapter-a', title: 'May', issues: 0, edited: true, instructionHash: 'old-hash',
        glossaryUsed: [{ key, translation: 'May' }], translatedAt: '2026-01-01T00:00:00.000Z',
      }],
    };
    const glossary: GlossaryEntry[] = [{ ...key, translation: 'Mây', source: 'user', updatedAt: '2026-01-02T00:00:00.000Z' }];

    const statuses = chapterTranslationStatuses(chapters, index, glossary, 'new-hash');

    expect(statuses[0]).toMatchObject({ status: 'stale', staleReason: 'glossary', edited: true, instructionChanged: true });
    expect(contentRunQueue({ mode: 'missing', from: null, to: null, overwrite: false, language: 'vi' }, statuses)).toEqual([1, 2]);
  });

  it('includes already translated chapters only when overwrite is selected', () => {
    const index: TranslationIndexFile = {
      version: 1,
      chapters: chapters.map((chapter, position) => ({
        index: position + 1, file: chapter.file, title: `Translated ${position + 1}`, issues: 0,
        edited: position === 0, instructionHash: 'same', glossaryUsed: [], translatedAt: '2026-01-01T00:00:00.000Z',
      })),
    };
    const statuses = chapterTranslationStatuses(chapters, index, [], 'same');

    expect(contentRunQueue({ mode: 'full', from: null, to: null, overwrite: false, language: 'vi' }, statuses)).toEqual([]);
    expect(contentRunQueue({ mode: 'full', from: null, to: null, overwrite: true, language: 'vi' }, statuses)).toEqual([1, 2]);
  });
});
