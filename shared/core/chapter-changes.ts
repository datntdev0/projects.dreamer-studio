import { CodedError } from '../errors/app-error';
import { ErrorCode } from '../errors/app-error';
import { CHAPTER_TITLE_MAX } from '../models/novel';
import type { ChapterChange } from '../models/novel';
import type { ChapterRef } from '../models/novel';
import type { NovelChapterEntry } from '../models/novel-store';
import type { ChapterStats } from './novel-text';
import { splitParagraphs } from './novel-text';
import { replaceTextMatches } from './text-match';

export interface ChapterFile extends ChapterStats {
  file: string;
}

export interface ChapterTexts {
  read(file: string): Promise<string[]>;
  write(paragraphs: string[]): Promise<ChapterFile>;
}

function invalid(reason: string): CodedError {
  return new CodedError(ErrorCode.ChapterChangeInvalid, `Chapter change invalid: ${reason}`);
}

function checkedTitle(value: string): string {
  const trimmed: string = value.trim();
  const length: number = Array.from(trimmed).length;
  if (length < 1 || length > CHAPTER_TITLE_MAX) {
    throw invalid(`title must be 1 to ${CHAPTER_TITLE_MAX} characters`);
  }
  return trimmed;
}

function checkedPositions(chapters: NovelChapterEntry[], refs: ChapterRef[], minimum: number): number[] {
  const seen: Set<number> = new Set();
  for (const ref of refs) {
    if (!Number.isInteger(ref.position) || chapters[ref.position - 1]?.file !== ref.file || seen.has(ref.position)) {
      throw invalid('chapter references no longer match');
    }
    seen.add(ref.position);
  }
  if (seen.size < minimum) {
    throw invalid(`at least ${minimum} chapters required`);
  }
  return [...seen].sort((a: number, b: number): number => a - b);
}

function isConsecutive(positions: number[]): boolean {
  return positions.every(
    (position: number, index: number): boolean => index === 0 || position === positions[index - 1] + 1,
  );
}

export async function applyChapterChange(
  chapters: NovelChapterEntry[],
  change: ChapterChange,
  texts: ChapterTexts,
): Promise<NovelChapterEntry[]> {
  switch (change.kind) {
    case 'rename': {
      const [position] = checkedPositions(chapters, [change.chapter], 1);
      const title: string = checkedTitle(change.title);
      return chapters.map((entry: NovelChapterEntry, index: number): NovelChapterEntry =>
        index === position - 1 ? { ...entry, title } : entry,
      );
    }
    case 'edit': {
      const [position] = checkedPositions(chapters, [change.chapter], 1);
      const title: string = checkedTitle(change.title);
      const paragraphs: string[] = splitParagraphs(change.paragraphs.join('\n'));
      if (paragraphs.length === 0) {
        throw invalid('at least one paragraph required');
      }
      const edited: ChapterFile = await texts.write(paragraphs);
      return chapters.map((entry: NovelChapterEntry, index: number): NovelChapterEntry =>
        index === position - 1 ? { title, ...edited } : entry,
      );
    }
    case 'move': {
      const moving: Set<number> = new Set(checkedPositions(chapters, change.chapters, 1));
      const moved: NovelChapterEntry[] = chapters.filter((_, index: number): boolean => moving.has(index + 1));
      const rest: NovelChapterEntry[] = chapters.filter((_, index: number): boolean => !moving.has(index + 1));
      if (!Number.isInteger(change.toIndex) || change.toIndex < 0 || change.toIndex > rest.length) {
        throw invalid('move destination is out of range');
      }
      return [...rest.slice(0, change.toIndex), ...moved, ...rest.slice(change.toIndex)];
    }
    case 'merge': {
      const positions: number[] = checkedPositions(chapters, change.chapters, 2);
      if (!isConsecutive(positions)) {
        throw invalid('merged chapters must be consecutive');
      }
      const first: number = positions[0] - 1;
      const end: number = positions[positions.length - 1];
      const parts: string[][] = await Promise.all(
        chapters.slice(first, end).map((entry: NovelChapterEntry): Promise<string[]> => texts.read(entry.file)),
      );
      const merged: ChapterFile = await texts.write(parts.flat());
      return [...chapters.slice(0, first), { title: chapters[first].title, ...merged }, ...chapters.slice(end)];
    }
    case 'split': {
      const [position] = checkedPositions(chapters, [change.chapter], 1);
      const title: string = checkedTitle(change.title);
      const source: NovelChapterEntry = chapters[position - 1];
      const paragraphs: string[] = await texts.read(source.file);
      if (!Number.isInteger(change.atParagraph) || change.atParagraph < 1 || change.atParagraph >= paragraphs.length) {
        throw invalid('split paragraph is out of range');
      }
      const head: ChapterFile = await texts.write(paragraphs.slice(0, change.atParagraph));
      const tail: ChapterFile = await texts.write(paragraphs.slice(change.atParagraph));
      return [
        ...chapters.slice(0, position - 1),
        { title: source.title, ...head },
        { title, ...tail },
        ...chapters.slice(position),
      ];
    }
    case 'delete': {
      const removed: Set<number> = new Set(checkedPositions(chapters, change.chapters, 1));
      return chapters.filter((_, index: number): boolean => !removed.has(index + 1));
    }
    case 'replace': {
      const replaced: Set<number> = new Set(checkedPositions(chapters, change.chapters, 1));
      if (!change.query.trim()) {
        throw invalid('search text required');
      }
      const replace = (text: string): string => replaceTextMatches(text, change.query, change.replacement);
      const result: NovelChapterEntry[] = [];
      for (const [index, entry] of chapters.entries()) {
        if (!replaced.has(index + 1)) {
          result.push(entry);
          continue;
        }
        const source: string = (await texts.read(entry.file)).join('\n');
        const title: string = replace(entry.title);
        const paragraphs: string[] = splitParagraphs(replace(source));
        if (title === entry.title && paragraphs.join('\n') === source) {
          result.push(entry);
          continue;
        }
        if (paragraphs.length === 0) {
          throw invalid('at least one paragraph required');
        }
        result.push({ title: checkedTitle(title), ...(await texts.write(paragraphs)) });
      }
      return result;
    }
  }
}
