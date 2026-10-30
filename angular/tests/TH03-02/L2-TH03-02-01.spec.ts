import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { DesktopApi } from '@core/desktop-api';
import { LibraryStore } from '@core/stores/library-store';
import { PipelineStore } from '@core/stores/pipeline-store';
import { LibraryPage } from '../../src/features/library/library.page';
import { LibraryItemsComponent } from '../../src/features/library/novel-list/library-items.component';
import { LibraryInspectorComponent } from '../../src/features/library/novel-list/library-inspector.component';
import { PanelOutletComponent } from '../../src/shell/layout/panel-outlet.component';
import { createPanelOutlets, settleViews } from '../support/component-fixtures';
import { novelDetail } from '../support/novel';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';

describe('[TH03-02] L2-TH03-02-01 production library page and novel-list components', () => {
  let fixture: ComponentFixture<LibraryPage>;
  let outlets: ComponentFixture<PanelOutletComponent>[];
  let novels: NovelDetail[];
  let pipelineListeners: Array<Parameters<DesktopApi['onPipelineUpdate']>[0]>;
  let api: Pick<
    DesktopApi,
    | 'listNovels'
    | 'getNovel'
    | 'openNovelFolder'
    | 'writeLog'
    | 'onLibraryChanged'
    | 'onAppDataChanged'
    | 'onPipelineUpdate'
    | 'onPipelineDeleted'
    | 'pipelineTypes'
    | 'listPipelines'
  >;
  let navigate: MockInstance<Router['navigateByUrl']>;
  const preferenceKeys = ['dreamer.library.browse', 'dreamer.currentNovel'];

  beforeEach(async () => {
    preferenceKeys.forEach((key) => localStorage.removeItem(key));
    pipelineListeners = [];
    const base = { ...novelDetail(), importedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' };
    novels = [
      {
        ...base,
        id: 'a',
        title: 'Book 10',
        originalTitle: 'Original Sun',
        author: 'Alice',
        language: 'vi',
        tags: ['fantasy'],
        publication: 'completed',
      },
      {
        ...base,
        id: 'b',
        title: 'Book 2',
        originalTitle: 'Original Moon',
        author: 'Bob',
        language: 'en',
        tags: ['fantasy'],
        publication: 'ongoing',
        description: 'Moon synopsis',
        chapterCount: 12,
        charCount: 1234,
        hasCover: true,
      },
      {
        ...base,
        id: 'c',
        title: 'Another',
        author: 'Carol',
        language: 'vi',
        tags: ['history'],
        publication: 'completed',
      },
    ];
    api = {
      listNovels: vi.fn(async () => novels),
      getNovel: vi.fn(async (id) => novels.find((novel) => novel.id === id) ?? null),
      openNovelFolder: vi.fn(async () => undefined),
      writeLog: vi.fn(),
      onLibraryChanged: vi.fn(() => () => undefined),
      onAppDataChanged: vi.fn(() => () => undefined),
      onPipelineUpdate: vi.fn((listener) => {
        pipelineListeners.push(listener);
        return () => undefined;
      }),
      onPipelineDeleted: vi.fn(() => () => undefined),
      pipelineTypes: vi.fn(async () => []),
      listPipelines: vi.fn(async () => ({ runs: [], total: 0, next: null })),
    };
    await TestBed.configureTestingModule({
      imports: [LibraryPage, PanelOutletComponent],
      providers: [provideRouter([]), { provide: DesktopApi, useValue: api }],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    TestBed.inject(PipelineStore).init();
    fixture = TestBed.createComponent(LibraryPage);
    outlets = createPanelOutlets();
    await settle();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    preferenceKeys.forEach((key) => localStorage.removeItem(key));
  });

  const settle = () => settleViews(fixture, ...outlets);
  function find(id: string): HTMLElement | null {
    for (const view of [fixture, ...outlets]) {
      const element = (view.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (element) return element;
    }
    return null;
  }
  function element(id: string): HTMLElement {
    const found = find(id);
    if (!found) throw new Error(`Missing production control: ${id}`);
    return found;
  }
  function ids(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid^="lib-card-"]'),
    ).map((card) => card.dataset['testid']!.slice('lib-card-'.length));
  }
  async function click(id: string): Promise<void> {
    element(id).click();
    await settle();
  }
  async function search(value: string): Promise<void> {
    const input = element('lib-search') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it.each([
    ['book 2', 'b'],
    ['original sun', 'a'],
    ['CAROL', 'c'],
  ])('AC1 searches through the real search control and novel list using %s', async (query, expected) => {
    await search(query);
    expect(fixture.debugElement.query(By.directive(LibraryItemsComponent))).not.toBeNull();
    expect(ids()).toEqual([expected]);
  });

  it('AC1 combines real language/status/genre controls and sorts the rendered novel cards', async () => {
    const sort = element('lib-sort') as HTMLSelectElement;
    sort.value = 'title';
    sort.dispatchEvent(new Event('change'));
    await settle();
    expect(ids()).toEqual(['c', 'b', 'a']);
    await click('lib-sort-direction');
    expect(ids()).toEqual(['a', 'b', 'c']);
    await click('lib-lang-vi');
    await click('lib-genre-fantasy');
    (element('lib-pub-completed').querySelector('input') as HTMLInputElement).click();
    await settle();
    expect(ids()).toEqual(['a']);
    await click('lib-lang-vi');
    await click('lib-genre-fantasy');
    (element('lib-pub-completed').querySelector('input') as HTMLInputElement).click();
    await settle();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('AC2 renders real no-results/empty components and wires their clear/import actions', async () => {
    await search('absent');
    expect(find('library-page-no-results')).not.toBeNull();
    expect(find('library-page-empty')).toBeNull();
    await click('library-page-clear');
    expect(ids()).toHaveLength(3);
    expect((element('lib-search') as HTMLInputElement).value).toBe('');
    novels = [];
    await TestBed.inject(LibraryStore).reload();
    await settle();
    expect(find('library-page-empty')).not.toBeNull();
    expect(find('library-page-no-results')).toBeNull();
    await click('library-page-import');
    expect(navigate).toHaveBeenCalledWith('/library/import');
  });

  it('AC3 sends selected list data into the real inspector and wires open/folder actions', async () => {
    await click('lib-card-b');
    const inspector = outlets.flatMap((outlet) =>
      outlet.debugElement.queryAll(By.directive(LibraryInspectorComponent)),
    )[0];
    expect(inspector).toBeDefined();
    const root = inspector.nativeElement as HTMLElement;
    expect(root.querySelector('.library-inspector-header')?.textContent).toContain('Original Moon');
    expect(root.querySelector('.library-inspector-header')?.textContent).toContain('Book 2');
    expect(root.querySelector('.library-inspector-header')?.textContent).toContain('Bob');
    expect(root.querySelector('ds-library-cover img')?.getAttribute('src')).toContain('library-file://cover/b');
    expect(element('insp-chapters').textContent).toBe('12');
    expect(element('insp-characters').textContent).toBe('1.2K');
    expect(element('insp-synopsis').textContent).toBe('Moon synopsis');
    expect(element('insp-edit').hasAttribute('disabled')).toBe(false);
    await click('insp-open');
    expect(navigate).toHaveBeenCalledWith('/library/b');
    await click('insp-open-folder');
    expect(api.openNovelFolder).toHaveBeenCalledWith('b');
  });

  it('AC4 passes pipeline activity into the real list and only opens the novel after import completion', async () => {
    novels = [];
    await TestBed.inject(LibraryStore).reload();
    const pending: PipelineRun = {
      id: 'import',
      type: 'novel-import',
      status: 'running',
      progress: 35,
      cancelReason: null,
      stepIndex: 1,
      stepCount: 3,
      stepName: 'extract',
      stepDetail: null,
      errorCode: null,
      error: null,
      label: 'Importing novel',
      novelId: null,
      createdAt: '2026-10-31T00:00:00Z',
      startedAt: null,
      finishedAt: null,
    };
    pipelineListeners.forEach((listener) => listener(pending));
    await settle();
    const importing = element('lib-pending-import');
    expect(
      importing.closest('.library-items-card')?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ).toBe('35');
    expect(find('library-page-empty')).toBeNull();
    importing.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    importing.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
    novels = [
      {
        ...novelDetail(),
        id: 'imported',
        title: 'Imported novel',
        importedAt: '2026-10-31T00:00:00Z',
        updatedAt: '2026-10-31T00:00:00Z',
      },
    ];
    pipelineListeners.forEach((listener) => listener({ ...pending, status: 'succeeded', novelId: 'imported' }));
    await TestBed.inject(LibraryStore).reload();
    await settle();
    expect(find('lib-pending-import')).toBeNull();
    element('lib-card-imported').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    expect(navigate).toHaveBeenCalledWith('/library/imported');
  });
});
