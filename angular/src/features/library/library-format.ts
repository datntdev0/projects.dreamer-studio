import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { I18nService, Language } from '../../core/i18n/i18n.service';
import type { LanguageOption, LibraryChapter, LibraryNovel, NovelDraft, ReadingSettings } from './library.models';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'zh', label: '中文 · zh' },
  { code: 'ja', label: '日本語 · ja' },
  { code: 'ko', label: '한국어 · ko' },
  { code: 'en', label: 'English · en' },
  { code: 'vi', label: 'Tiếng Việt · vi' },
];

export const EXPORT_MS = 6000;

export const LOADING_MS = 500;

export const CHANGE_MS = 400;

export const LIST_LIMIT = 5;

export const DEFAULT_READING_SETTINGS: ReadingSettings = { font: 'serif', size: 18, leading: 1.75, width: 72 };

const COVER_PALETTES: string[] = ['green', 'gold', 'jade', 'slate', 'rose', 'charcoal'];
const PACKAGE_EXTENSION = '.zip';
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*]+/g;

export function chapterNumber(chapter: LibraryChapter): string {
  return String(chapter.position).padStart(4, '0');
}

export function toParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map((paragraph: string): string => paragraph.trim())
    .filter(Boolean);
}

export function toggled(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item: string): boolean => item !== value) : [...values, value];
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export function isConsecutive(chapters: LibraryChapter[]): boolean {
  return chapters.every(
    (chapter: LibraryChapter, index: number): boolean =>
      index === 0 || chapter.position === chapters[index - 1].position + 1,
  );
}

export function renumber(chapters: LibraryChapter[]): LibraryChapter[] {
  return chapters.map((chapter: LibraryChapter, index: number): LibraryChapter => ({
    ...chapter,
    position: index + 1,
  }));
}

export function byPosition(chapters: LibraryChapter[]): LibraryChapter[] {
  return [...chapters].sort((a: LibraryChapter, b: LibraryChapter): number => a.position - b.position);
}

export function totalChars(chapters: LibraryChapter[]): number {
  return chapters.reduce((sum: number, chapter: LibraryChapter): number => sum + chapter.chars, 0);
}

export function packageFileName(novel: LibraryNovel): string {
  const base: string = novel.title
    .replace(UNSAFE_FILE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return `${base || novel.id}${PACKAGE_EXTENSION}`;
}

export function chapterLabel(i18n: I18nService, count: number): string {
  return count === 1
    ? i18n.t('library.novelDialog.chapterCount.one')
    : i18n.t('library.novelDialog.chapterCount.many', { count: new Intl.NumberFormat(i18n.language()).format(count) });
}

export function withExtension(name: string): string {
  return name.toLowerCase().endsWith(PACKAGE_EXTENSION) ? name : `${name}${PACKAGE_EXTENSION}`;
}

export function toDraft(novel: LibraryNovel, language: string): NovelDraft {
  return {
    originalTitle: novel.originalTitle,
    title: novel.title,
    author: novel.author,
    description: language === 'vi' ? novel.descriptionVi : novel.description,
    language: novel.language,
    tags: [...novel.tags],
    cover: novel.cover,
    publication: novel.publication,
  };
}

export function sameDraft(a: NovelDraft, b: NovelDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function languageOptions(current: string): LanguageOption[] {
  const known: boolean = LANGUAGE_OPTIONS.some((option: LanguageOption): boolean => option.code === current);
  return current && !known ? [...LANGUAGE_OPTIONS, { code: current, label: current }] : LANGUAGE_OPTIONS;
}

export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export function matches(novel: { title: string; originalTitle: string; author: string }, query: string): boolean {
  return [novel.title, novel.originalTitle, novel.author].some((value: string): boolean => fold(value).includes(query));
}

export function coverUrl(novel: NovelSummary): string | null {
  return novel.hasCover ? `library-file://cover/${novel.id}?v=${encodeURIComponent(novel.updatedAt)}` : null;
}

export function coverPalette(id: string): string {
  const hash: number = [...id].reduce((sum: number, char: string): number => sum + char.charCodeAt(0), 0);
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}

export function languageName(code: string, language: Language): string {
  try {
    return new Intl.DisplayNames(language, { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
