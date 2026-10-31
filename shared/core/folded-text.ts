import type { TextContext } from '../models/analysis';
import { findTextContext, foldQuery, foldText } from './text-match';

const PARAGRAPH_BREAK = '\n';

export class FoldedText {
  private lowers: string[] | null = null;
  private joined = '';
  private readonly found: Map<string, boolean> = new Map<string, boolean>();

  constructor(readonly paragraphs: readonly string[]) {}

  has(word: string): boolean {
    const needle: string = foldQuery(word);
    if (!needle) return false;
    const known: boolean | undefined = this.found.get(needle);
    if (known !== undefined) return known;
    const result: boolean = this.text().includes(needle);
    this.found.set(needle, result);
    return result;
  }

  context(word: string): TextContext | null {
    const needle: string = foldQuery(word);
    if (!needle || !this.has(word)) return null;
    this.text();
    const position: number = this.lowers!.findIndex((lower: string): boolean => lower.includes(needle));
    return position < 0 ? null : findTextContext([this.paragraphs[position]], word, { fold: true });
  }

  private text(): string {
    if (this.lowers === null) {
      this.lowers = this.paragraphs.map(foldText);
      this.joined = this.lowers.join(PARAGRAPH_BREAK);
    }
    return this.joined;
  }
}

const cache: WeakMap<readonly string[], FoldedText> = new WeakMap<readonly string[], FoldedText>();

export function foldedText(paragraphs: readonly string[]): FoldedText {
  let text: FoldedText | undefined = cache.get(paragraphs);
  if (!text) {
    text = new FoldedText(paragraphs);
    cache.set(paragraphs, text);
  }
  return text;
}
