import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { NovelLock } from '@dreamer/shared/models/novel';
import type { I18nService, Language } from '@core/i18n/i18n.service';
import type { LibraryChapter } from './library.models';

export interface LanguageOption {
  code: string;
  label: string;
}

export type RequiredField = 'originalTitle' | 'title' | 'language';

export type TextField = RequiredField | 'author' | 'description';

const LANGUAGE_CODES: string[] = ['zh', 'ja', 'ko', 'en', 'vi'];

export const LOADING_MS = 500;

export const CHANGE_MS = 400;

export const LIST_LIMIT = 5;

const COVER_PALETTES: string[] = ['green', 'gold', 'jade', 'slate', 'rose', 'charcoal'];

export function chapterNumber(chapter: LibraryChapter): string {
  return String(chapter.position).padStart(4, '0');
}

export function lockKind(lock: NovelLock): 'export' | 'import' {
  return lock.type === 'novel-export' ? 'export' : 'import';
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

export function chapterLabel(i18n: I18nService, count: number): string {
  return count === 1
    ? i18n.t('library.novelDialog.chapterCount.one')
    : i18n.t('library.novelDialog.chapterCount.many', { count: new Intl.NumberFormat(i18n.language()).format(count) });
}

export function languageOptions(current: string, language: Language): LanguageOption[] {
  const names: Intl.DisplayNames = new Intl.DisplayNames([language], { type: 'language' });
  const codes: string[] = [...LANGUAGE_CODES];
  if (current && !codes.includes(current)) codes.push(current);
  return codes.map((code: string): LanguageOption => ({ code, label: `${names.of(code) ?? code} · ${code}` }));
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
