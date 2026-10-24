import { readFile } from 'node:fs/promises';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { findTextMatches } from '@dreamer/shared/core/text-match';
import type { TextMatch } from '@dreamer/shared/core/text-match';
import { NovelChapter, SearchHit, SearchProgress, SearchRequest } from '@dreamer/shared/models/novel';
import type { WebContents } from 'electron';
import { LibraryChannel } from '@dreamer/shared/ipc/channels';
import { AppPaths } from '@storage/paths';
import { createLogger } from '../../logging/logger';
import type { Logger } from '../../logging/logger';
import { chapterPath, novelFolder, NovelFolder } from './library-files';
import { LibraryIndex } from './library-index';

const BATCH_SIZE = 20;
const HIT_LIMIT = 1000;
const SNIPPET_LENGTH = 40;

interface RunningSearch {
  searchId: string;
  controller: AbortController;
  destroyed: () => void;
}

function findHits(
  text: string,
  query: string,
  chapter: NovelChapter,
  paragraph: number | null,
  signal: AbortSignal,
  count: () => boolean,
  found: (hit: SearchHit) => void,
): void {
  const characters: string[] = Array.from(text);
  for (const match of findTextMatches(text, query)) {
    if (signal.aborted) return;
    if (!count()) continue;
    const { start, end }: TextMatch = match;
    const preStart: number = Math.max(0, start - SNIPPET_LENGTH);
    const postEnd: number = Math.min(characters.length, end + SNIPPET_LENGTH);
    found({
      position: chapter.position,
      file: chapter.file,
      paragraph,
      pre: `${preStart > 0 ? '…' : ''}${characters.slice(preStart, start).join('')}`,
      hit: characters.slice(start, end).join(''),
      post: `${characters.slice(end, postEnd).join('')}${postEnd < characters.length ? '…' : ''}`,
    });
  }
}

export class NovelSearch {
  constructor(
    private readonly paths: AppPaths,
    private readonly index: LibraryIndex,
  ) {}

  search(request: SearchRequest, send: (progress: SearchProgress) => void, signal: AbortSignal): Promise<void> {
    const chapters: NovelChapter[] = this.index.get(request.novelId).chapters;
    const query: string = request.query;
    if (!request.query.trim() || signal.aborted) return Promise.resolve();
    return this.run(request, chapters, query, send, signal);
  }

  private async run(
    request: SearchRequest,
    chapters: NovelChapter[],
    query: string,
    send: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const folder: NovelFolder = novelFolder(this.paths, request.novelId);
    let done = 0;
    let totalHits = 0;
    let totalChapters = 0;
    for (let batch = 0; batch < Math.max(1, Math.ceil(chapters.length / BATCH_SIZE)); batch += 1) {
      const hits: SearchHit[] = [];
      const count = (): boolean => {
        totalHits += 1;
        return totalHits <= HIT_LIMIT;
      };
      const found = (hit: SearchHit): void => {
        hits.push(hit);
      };
      for (const chapter of chapters.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE)) {
        if (signal.aborted) return;
        let text: string;
        try {
          text = await readFile(chapterPath(folder, chapter.file), 'utf-8');
        } catch {
          done += 1;
          continue;
        }
        if (signal.aborted) return;
        const previousHits: number = totalHits;
        findHits(chapter.title, query, chapter, null, signal, count, found);
        const paragraphs: string[] = splitParagraphs(text);
        for (let paragraph = 0; paragraph < paragraphs.length && !signal.aborted; paragraph += 1) {
          findHits(paragraphs[paragraph], query, chapter, paragraph, signal, count, found);
        }
        if (signal.aborted) return;
        if (totalHits > previousHits) totalChapters += 1;
        done += 1;
      }
      if (signal.aborted) return;
      send({
        searchId: request.searchId,
        done,
        total: chapters.length,
        hits,
        totalHits,
        totalChapters,
        finished: done === chapters.length,
      });
      await new Promise<void>((resolve: () => void): void => {
        setImmediate(resolve);
      });
    }
  }
}

export class NovelSearches {
  private readonly running: WeakMap<WebContents, RunningSearch> = new WeakMap();
  private readonly logger: Logger = createLogger('library-search');

  constructor(private readonly createSearch: () => NovelSearch) {}

  start(sender: WebContents, request: SearchRequest): void {
    this.stop(sender);
    const search: NovelSearch = this.createSearch();
    if (!request.query.trim() || sender.isDestroyed()) return;
    const controller: AbortController = new AbortController();
    const destroyed = (): void => this.stop(sender);
    const current: RunningSearch = { searchId: request.searchId, controller, destroyed };
    const send = (progress: SearchProgress): void => {
      if (!controller.signal.aborted && !sender.isDestroyed()) sender.send(LibraryChannel.SearchProgress, progress);
    };
    const task: Promise<void> = search.search(request, send, controller.signal);
    this.running.set(sender, current);
    sender.once('destroyed', destroyed);
    void task
      .catch((error: unknown): void => this.logger.error('Novel search failed', error))
      .finally((): void => {
        if (this.running.get(sender) !== current) return;
        sender.removeListener('destroyed', destroyed);
        this.running.delete(sender);
      });
  }

  cancel(sender: WebContents, searchId: string): void {
    if (this.running.get(sender)?.searchId === searchId) this.stop(sender);
  }

  private stop(sender: WebContents): void {
    const current: RunningSearch | undefined = this.running.get(sender);
    if (!current) return;
    current.controller.abort();
    sender.removeListener('destroyed', current.destroyed);
    this.running.delete(sender);
  }
}
