import { Injectable, signal } from '@angular/core';
import type { LibraryChapter, SearchChapterResult, SearchHit } from './library.models';

const BATCH_SIZE = 4;
const SEARCH_DELAY_MS = 16;
const SNIPPET_LENGTH = 48;

@Injectable()
export class NovelSearchStore {
  readonly query = signal<string>('');
  readonly done = signal<number>(0);
  readonly total = signal<number>(0);
  readonly results = signal<SearchChapterResult[]>([]);
  readonly running = signal<boolean>(false);
  readonly complete = signal<boolean>(false);

  private runId: number = 0;

  start(
    chapters: LibraryChapter[],
    paragraphs: (chapter: LibraryChapter) => string[],
    value: string,
    continueRunning: boolean = true,
  ): void {
    this.cancel();
    const query: string = value.trim();
    this.query.set(query);
    this.done.set(0);
    this.total.set(chapters.length);
    this.results.set([]);
    this.complete.set(false);
    if (!query) return;
    this.running.set(true);
    const id: number = ++this.runId;
    const next = (index: number): void => {
      if (id !== this.runId) return;
      const end: number = Math.min(index + BATCH_SIZE, chapters.length);
      const groups: SearchChapterResult[] = [];
      for (let position: number = index; position < end; position += 1) {
        const chapter: LibraryChapter = chapters[position];
        const hits: SearchHit[] = this.findChapter(chapter, paragraphs(chapter), query);
        if (hits.length) groups.push({ chapter, hits });
      }
      if (groups.length)
        this.results.update((results: SearchChapterResult[]): SearchChapterResult[] => [...results, ...groups]);
      this.done.set(end);
      if (end < chapters.length && continueRunning) {
        setTimeout(() => next(end), SEARCH_DELAY_MS);
      } else if (id === this.runId) {
        this.running.set(false);
        this.complete.set(true);
      }
    };
    setTimeout(() => next(0), SEARCH_DELAY_MS);
  }

  cancel(): void {
    this.runId += 1;
    this.running.set(false);
  }

  clear(): void {
    this.cancel();
    this.query.set('');
    this.done.set(0);
    this.total.set(0);
    this.results.set([]);
    this.complete.set(false);
  }

  private findChapter(chapter: LibraryChapter, paragraphs: string[], query: string): SearchHit[] {
    return [
      ...this.find(chapter.title, query, null, chapter.id),
      ...paragraphs.flatMap((text: string, index: number): SearchHit[] =>
        this.find(text, query, index + 1, chapter.id),
      ),
    ];
  }

  private find(text: string, query: string, paragraph: number | null, chapterId: string): SearchHit[] {
    const lower: string = text.toLocaleLowerCase();
    const needle: string = query.toLocaleLowerCase();
    const hits: SearchHit[] = [];
    let index: number = lower.indexOf(needle);
    while (index >= 0) {
      const start: number = Math.max(0, index - SNIPPET_LENGTH);
      const end: number = Math.min(text.length, index + query.length + SNIPPET_LENGTH);
      hits.push({
        chapterId,
        paragraph,
        pre: `${start ? '…' : ''}${text.slice(start, index)}`,
        hit: text.slice(index, index + query.length),
        post: `${text.slice(index + query.length, end)}${end < text.length ? '…' : ''}`,
      });
      index = lower.indexOf(needle, index + query.length);
    }
    return hits;
  }
}
