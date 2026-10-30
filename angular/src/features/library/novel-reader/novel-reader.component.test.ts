import { describe, expect, it } from 'vitest';
import type { ChapterTranslation } from '@dreamer/shared/models/translation';
import type { LibraryChapter } from '../library.models';
import type { TranslationStore } from '../translation.store';
import { isTypingTarget } from '../library-format';
import { chapterTranslation, readerTextParts } from './novel-reader.component';

describe('[TH04-05] reader translation selection', () => {
  it('[L2-TH04-05-03] returns only the translation matching selected chapter and target language', () => {
    const translation: ChapterTranslation = {
      index: 1, file: 'chapter-a', title: 'A', paragraphs: ['translated'], language: 'vi',
      status: 'translated', issues: 0, issueList: [], edited: false, staleReason: null,
      instructionChanged: false, error: null, translatedAt: null,
    };
    const store = { chapter: () => translation, chapterFile: () => 'chapter-a', language: () => 'vi', chapterStatus: () => null } as unknown as TranslationStore;
    const selected = { file: 'chapter-a', position: 1 } as LibraryChapter;
    expect(chapterTranslation(store, selected)).toBe(translation);
    expect(chapterTranslation({ ...store, language: () => 'en' } as TranslationStore, selected)).toBeNull();
  });

});

describe('[TH03-03] reader search and keyboard behavior', () => {
  it('[L2-TH03-03-01] highlights only the selected search occurrence in its chapter and paragraph', () => {
    const highlight = { chapterId: 'chapter-a', query: 'moon', paragraph: 1, occurrence: 1 };
    const parts = readerTextParts('moon over moon', highlight, 'chapter-a', 1, 'source');
    expect(parts.filter((part) => part.current).map((part) => part.text)).toEqual(['moon']);
    expect(parts.filter((part) => part.highlighted).map((part) => part.text)).toEqual(['moon', 'moon']);
    expect(readerTextParts('moon over moon', highlight, 'chapter-b', 1, 'source').some((part) => part.highlighted)).toBe(false);
  });

  it('[L2-TH03-03-01] does not route reader keyboard shortcuts from editable controls', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    expect(isTypingTarget(editor)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});
