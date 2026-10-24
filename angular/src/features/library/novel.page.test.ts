import { Component } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { DesktopApi } from '@core/desktop-api';
import { CodedError } from '@dreamer/shared/errors/app-error';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { LibraryChangedEvent } from '@dreamer/shared/models/novel';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { SearchProgress } from '@dreamer/shared/models/novel';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelOutletComponent } from '@shell/layout/panel-outlet.component';
import { PageCrumbService } from '@shell/page-crumb.service';
import { BehaviorSubject } from 'rxjs';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { CHAPTER_PARAGRAPHS } from '../../../stories/fixtures/library';
import { makeChapters } from '../../../stories/fixtures/library';
import { NOVELS } from '../../../stories/fixtures/library';
import { SAMPLE_PARAGRAPHS } from '../../../stories/fixtures/library';
import { toNovelSummary } from '../../../stories/fixtures/library-list-api';
import type { LibraryChapter } from './library.models';
import type { LibraryNovel } from './library.models';
import { NovelPage } from './novel.page';
import { NovelStore } from './novel.store';

const NOVEL: LibraryNovel = NOVELS.find((novel: LibraryNovel): boolean => novel.id === 'n-0001')!;
const CHAPTERS: LibraryChapter[] = makeChapters(NOVEL);
const DETAIL: NovelDetail = {
  ...toNovelSummary(NOVEL),
  chapterCount: CHAPTERS.length,
  description: NOVEL.description,
  chapters: CHAPTERS.map((chapter: LibraryChapter) => ({
    position: chapter.position,
    title: chapter.title,
    file: chapter.file,
    paragraphs: chapter.paragraphCount,
    chars: chapter.chars,
  })),
};

@Component({
  imports: [NovelPage, PanelOutletComponent],
  template: '<ds-panel-outlet edge="left" /><ds-novel-page /><ds-panel-outlet edge="right" />',
})
class NovelTestHost {}

interface TestOptions {
  id?: string;
  chapter?: number | string;
  lock?: boolean;
  missing?: number;
  error?: boolean;
}

interface PageTest {
  fixture: ComponentFixture<NovelTestHost>;
  api: Partial<DesktopApi>;
  changed: (event: LibraryChangedEvent) => void;
  progress: (event: SearchProgress) => void;
  router: Router;
}

function query(fixture: ComponentFixture<NovelTestHost>, testId: string): HTMLElement {
  const element: HTMLElement | null = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing ${testId}`);
  return element;
}

function rows(fixture: ComponentFixture<NovelTestHost>): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="novel-chapters-row"]'));
}

async function settle(fixture: ComponentFixture<NovelTestHost>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function createPage(options: TestOptions = {}): Promise<PageTest> {
  const id: string = options.id ?? NOVEL.id;
  let changed: (event: LibraryChangedEvent) => void = () => undefined;
  let progress: (event: SearchProgress) => void = () => undefined;
  const detail: NovelDetail = {
    ...DETAIL,
    lock: options.lock ? { type: 'novel-export', runId: 'run-export', label: NOVEL.title, status: 'running' } : null,
  };
  const api: Partial<DesktopApi> = {
    getNovel: vi.fn(async (requested: string): Promise<NovelDetail | null> => {
      if (requested !== NOVEL.id) throw new CodedError(ErrorCode.NovelNotFound, 'Novel not found');
      if (options.error) throw new Error('Read failed');
      return detail;
    }),
    getChapter: vi.fn(async (request): Promise<{ paragraphs: string[] }> => {
      const chapter: LibraryChapter | undefined = CHAPTERS.find(
        (item: LibraryChapter): boolean => item.file === request.file,
      );
      if (chapter?.position === options.missing) throw new CodedError(ErrorCode.ChapterFileMissing, 'Missing chapter');
      return { paragraphs: CHAPTER_PARAGRAPHS[chapter?.id ?? ''] ?? SAMPLE_PARAGRAPHS };
    }),
    onLibraryChanged: (listener): (() => void) => {
      changed = listener;
      return () => undefined;
    },
    onPipelineUpdate: (): (() => void) => () => undefined,
    onSearchProgress: (listener): (() => void) => {
      progress = listener;
      return () => undefined;
    },
    search: vi.fn(async (): Promise<void> => undefined),
    cancelSearch: vi.fn(async (): Promise<void> => undefined),
    changeChapters: vi.fn(async (): Promise<NovelDetail | null> => detail),
  };
  const params = new BehaviorSubject(convertToParamMap({ id }));
  const queryParams = new BehaviorSubject(
    convertToParamMap(options.chapter !== undefined ? { chapter: String(options.chapter) } : {}),
  );
  await TestBed.configureTestingModule({
    imports: [NovelTestHost],
    providers: [
      provideRouter([]),
      { provide: DesktopApi, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: params,
          queryParamMap: queryParams,
          snapshot: { paramMap: params.value, queryParamMap: queryParams.value },
        },
      },
    ],
  }).compileComponents();
  const router: Router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture: ComponentFixture<NovelTestHost> = TestBed.createComponent(NovelTestHost);
  await settle(fixture);
  await settle(fixture);
  return {
    fixture,
    api,
    changed: (event: LibraryChangedEvent): void => changed(event),
    progress: (event: SearchProgress): void => progress(event),
    router,
  };
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('NovelPage', () => {
  it('shows chapter one, its paragraphs, header, crumb, and only Edit and Focus actions', async () => {
    const { fixture } = await createPage();
    expect(TestBed.inject(PageCrumbService).detail()).toBe(NOVEL.title);
    expect(query(fixture, 'novel-page-title').textContent).toContain('0001 ·');
    const article: HTMLElement = query(fixture, 'novel-reader-article');
    expect(Array.from(article.children).filter((child: Element): boolean => child.tagName === 'P')).toHaveLength(
      SAMPLE_PARAGRAPHS.length,
    );
    expect(
      (Array.from(fixture.nativeElement.querySelectorAll('.ds-page-actions button')) as Element[]).map(
        (button: Element) => button.getAttribute('data-testid'),
      ),
    ).toEqual(['novel-page-edit', 'novel-page-focus']);
    expect((query(fixture, 'novel-page-edit') as HTMLButtonElement).disabled).toBe(false);
    expect(rows(fixture).length).toBeLessThan(CHAPTERS.length);
    expect(rows(fixture)[0].dataset['position']).toBe('1');
    expect(query(fixture, 'novel-chapters-count').textContent).toContain(String(CHAPTERS.length));
    expect(query(fixture, 'novel-chapters-row-open').getAttribute('aria-current')).toBe('true');
  });

  it('starts from the chapter query and selects another chapter through the URL', async () => {
    const { fixture, router } = await createPage({ chapter: 12 });
    expect(query(fixture, 'novel-page-title').textContent).toContain('0012 ·');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const search: HTMLInputElement = query(fixture, 'novel-chapters-search') as HTMLInputElement;
    search.value = '3';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    rows(fixture)[0].querySelector<HTMLElement>('[data-testid="novel-chapters-row-open"]')!.click();
    await settle(fixture);
    expect(query(fixture, 'novel-page-title').textContent).toContain('0003 ·');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { chapter: '3' }, replaceUrl: true }),
    );
  });

  it.each(['abc', '0', '9999'])('repairs an invalid chapter query (%s)', async (chapter: string) => {
    const { fixture, router } = await createPage({ chapter });
    expect(query(fixture, 'novel-page-title').textContent).toContain('0001 ·');
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { chapter: '1' }, replaceUrl: true }),
    );
  });

  it('selects the last chapter and repairs the URL when the current position disappears', async () => {
    const { fixture, api, changed, router } = await createPage({ chapter: 12 });
    api.getNovel = vi.fn(async (): Promise<NovelDetail> => ({ ...DETAIL, chapters: DETAIL.chapters.slice(0, 10) }));
    changed({ novelIds: [NOVEL.id] });
    await settle(fixture);
    expect(query(fixture, 'novel-page-title').textContent).toContain('0010 ·');
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { chapter: '10' }, replaceUrl: true }),
    );
  });

  it('switches the right panel between Reading and Search', async () => {
    const { fixture } = await createPage();
    expect(query(fixture, 'reading-settings-font')).toBeTruthy();
    query(fixture, 'novel-page-tab-search').click();
    await settle(fixture);
    expect(query(fixture, 'novel-search-input')).toBeTruthy();
  });

  it('opens the selected occurrence within a paragraph', async () => {
    const { fixture, api, progress } = await createPage();
    api.getChapter = vi.fn(async (): Promise<{ paragraphs: string[] }> => ({ paragraphs: ['Test test TEST'] }));
    const store: NovelStore = fixture.debugElement.query(By.directive(NovelPage)).injector.get(NovelStore);
    store.retry(CHAPTERS[0]);
    await settle(fixture);
    query(fixture, 'novel-page-tab-search').click();
    await settle(fixture);
    const input: HTMLInputElement = query(fixture, 'novel-search-input') as HTMLInputElement;
    input.value = 'test';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(fixture);
    const searchId: string = vi.mocked(api.search!).mock.calls[0][0].searchId;
    progress({
      searchId,
      done: CHAPTERS.length,
      total: CHAPTERS.length,
      totalHits: 3,
      totalChapters: 1,
      finished: true,
      hits: ['Test', 'test', 'TEST'].map((hit: string) => ({
        position: CHAPTERS[0].position,
        file: CHAPTERS[0].file,
        paragraph: 0,
        pre: '',
        hit,
        post: '',
      })),
    });
    await settle(fixture);
    const hits: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="novel-search-hit"]'));
    hits[2].click();
    await settle(fixture);
    const marks: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="novel-reader-article"] mark'),
    );
    expect(marks).toHaveLength(3);
    expect(marks[2].classList.contains('current')).toBe(true);
    expect(marks[2].textContent).toBe('TEST');
  });

  it('shows a loading state while the detail request is pending', async () => {
    const { fixture, api } = await createPage();
    api.getNovel = vi.fn(() => new Promise<NovelDetail | null>(() => undefined));
    const store: NovelStore = fixture.debugElement.query(By.directive(NovelPage)).injector.get(NovelStore);
    void store.open(NOVEL.id);
    fixture.detectChanges();
    expect(query(fixture, 'novel-page').dataset['state']).toBe('loading');
  });

  it('filters by title and jumps by number with Enter', async () => {
    const { fixture } = await createPage();
    const search: HTMLInputElement = query(fixture, 'novel-chapters-search') as HTMLInputElement;
    search.value = CHAPTERS[11].title;
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(rows(fixture).map((row: HTMLElement): string | undefined => row.dataset['position'])).toEqual(['12']);
    search.value = '45';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(fixture);
    expect(query(fixture, 'novel-page-title').textContent).toContain('0045 ·');
  });

  it('shows a missing chapter error and retries through the API', async () => {
    const { fixture, api } = await createPage({ chapter: 12, missing: 12 });
    expect(query(fixture, 'novel-reader-error').textContent).toContain('12');
    query(fixture, 'novel-reader-retry').click();
    await settle(fixture);
    expect(api.getChapter).toHaveBeenCalledTimes(2);
  });

  it('shows the pager under a missing chapter and opens the next chapter', async () => {
    const { fixture } = await createPage({ chapter: 12, missing: 12 });
    expect(query(fixture, 'novel-reader-error')).toBeTruthy();
    query(fixture, 'novel-reader-pager-next').click();
    await settle(fixture);
    expect(query(fixture, 'novel-page-title').textContent).toContain('0013 ·');
  });

  it('shows not found and load errors with retry', async () => {
    const missing = await createPage({ id: 'missing' });
    expect(query(missing.fixture, 'novel-page-not-found')).toBeTruthy();
    missing.fixture.destroy();
    TestBed.resetTestingModule();
    const failed = await createPage({ error: true });
    expect(query(failed.fixture, 'novel-page-error').textContent).toContain('Read failed');
    query(failed.fixture, 'novel-page-retry').click();
    await settle(failed.fixture);
    expect(failed.api.getNovel).toHaveBeenCalledTimes(2);
  });

  it('shows the lock banner and disables Edit', async () => {
    const { fixture } = await createPage({ lock: true });
    expect(query(fixture, 'novel-page-lock').textContent).toContain('run-export');
    expect((query(fixture, 'novel-page-edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reloads this novel after a library change', async () => {
    const { fixture, api, changed } = await createPage();
    changed({ novelIds: [NOVEL.id] });
    await settle(fixture);
    expect(api.getNovel).toHaveBeenCalledTimes(2);
  });

  it('hides both side panels in Focus and restores them with Escape', async () => {
    const { fixture } = await createPage();
    const layout: LayoutService = TestBed.inject(LayoutService);
    query(fixture, 'novel-page-focus').click();
    await settle(fixture);
    expect(layout.isOpen('left')).toBe(false);
    expect(layout.isOpen('right')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(layout.isOpen('left')).toBe(true);
    expect(layout.isOpen('right')).toBe(true);
  });
});
