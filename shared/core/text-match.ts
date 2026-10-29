import type { TextContext } from '../models/analysis';

export interface TextMatch {
  start: number;
  end: number;
}

export interface TextMatchOptions {
  fold?: boolean;
}

const SINGLE_QUOTES: RegExp = /[‘’‚‛′]/g;
const DOUBLE_QUOTES: RegExp = /[“”„‟«»″]/g;
const DASHES: RegExp = /[‐‑‒–—―−]/g;

const segmenter: Intl.Segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function foldPunctuation(value: string): string {
  return value.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(DASHES, '-').replace(/\s+/g, ' ');
}

export function findTextContext(
  paragraphs: string[],
  needle: string,
  options: TextMatchOptions = {},
): TextContext | null {
  const radius = 80;
  for (const paragraph of paragraphs) {
    const match: TextMatch | undefined = findTextMatches(paragraph, needle, options)[0];
    if (!match) continue;
    const chars: string[] = Array.from(paragraph);
    const start: number = Math.max(0, match.start - radius);
    const end: number = Math.min(chars.length, match.end + radius);
    return {
      before: (start > 0 ? '…' : '') + chars.slice(start, match.start).join(''),
      match: chars.slice(match.start, match.end).join(''),
      after: chars.slice(match.end, end).join('') + (end < chars.length ? '…' : ''),
    };
  }
  return null;
}

export function findTextMatches(text: string, query: string, options: TextMatchOptions = {}): TextMatch[] {
  const fold: boolean = options.fold === true;
  const starts: number[] = [];
  const ends: number[] = [];
  let lower = '';
  let index = 0;
  for (const { segment } of segmenter.segment(text)) {
    const end: number = index + Array.from(segment).length;
    const normalized: string = segment.normalize('NFC').toLocaleLowerCase();
    const value: string = fold ? foldPunctuation(normalized) : normalized;
    if (fold && value === ' ' && lower.endsWith(' ')) {
      ends[ends.length - 1] = end;
    } else {
      lower += value;
      for (let offset = 0; offset < value.length; offset += 1) {
        starts.push(index);
        ends.push(end);
      }
    }
    index = end;
  }
  const lowered: string = Array.from(query.normalize('NFC'))
    .map((character: string): string => character.toLocaleLowerCase())
    .join('');
  const needle: string = fold ? foldPunctuation(lowered).trim() : lowered;
  if (!needle) return [];
  const matches: TextMatch[] = [];
  let offset = 0;
  while (offset < lower.length) {
    const match: number = lower.indexOf(needle, offset);
    if (match < 0) break;
    matches.push({ start: starts[match], end: ends[match + needle.length - 1] });
    offset = match + needle.length;
  }
  return matches;
}

export function replaceTextMatches(text: string, query: string, replacement: string): string {
  const matches: TextMatch[] = findTextMatches(text, query);
  if (!matches.length) return text;
  const characters: string[] = Array.from(text);
  let result = '';
  let index = 0;
  for (const { start, end } of matches) {
    result += `${characters.slice(index, start).join('')}${replacement}`;
    index = end;
  }
  return `${result}${characters.slice(index).join('')}`;
}
