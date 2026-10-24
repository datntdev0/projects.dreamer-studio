import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { NovelDetail, NovelSummary } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { LibraryStore } from '@core/stores/library-store';
import type { LibraryLoadState, LibrarySortKey, LibraryView, SortDirection } from '@core/stores/library-store';
import { PanelOutletComponent } from '@shell/layout/panel-outlet.component';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_SUMMARIES } from '../../../stories/fixtures/library-list-api';
import { LibraryPage } from './library.page';

interface CreatePageOptions {
  novels?: NovelSummary[];
  state?: LibraryLoadState;
}

@Component({
  imports: [LibraryPage, PanelOutletComponent],
  template: '<ds-panel-outlet edge="left" /><ds-library-page /><ds-panel-outlet edge="right" />',
})
class LibraryTestHost {}

class LibraryStoreStub {
  readonly novels = signal<NovelSummary[]>([]);
  readonly state = signal<LibraryLoadState>('ready');
  readonly error = signal<string | null>(null);
  readonly pending = signal<PipelineRun[]>([]);
  readonly view = signal<LibraryView>('grid');
  readonly sortKey = signal<LibrarySortKey>('updatedAt');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly load = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  readonly reload = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  readonly detail = vi.fn<(id: string) => Promise<NovelDetail | null>>();
  readonly openFolder = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

  constructor(novels: NovelSummary[], state: LibraryLoadState) {
    this.novels.set(novels);
    this.state.set(state);
    this.detail.mockImplementation(async (id) => {
      const novel: NovelSummary | undefined = novels.find((item) => item.id === id);
      return novel ? { ...novel, description: '', chapters: [] } : null;
    });
  }
}

let store: LibraryStoreStub;
let showModal: (() => void) | undefined;

function query(fixture: ComponentFixture<LibraryTestHost>, testId: string): HTMLElement {
  const element: HTMLElement | null = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing [data-testid="${testId}"]`);
  return element;
}

function has(fixture: ComponentFixture<LibraryTestHost>, testId: string): boolean {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) !== null;
}

function cardIds(fixture: ComponentFixture<LibraryTestHost>): string[] {
  const cards: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[data-testid^="lib-card-"]'));
  return cards.map((card) => card.dataset['testid']!.replace('lib-card-', ''));
}

async function settle(fixture: ComponentFixture<LibraryTestHost>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function click(fixture: ComponentFixture<LibraryTestHost>, testId: string): Promise<void> {
  query(fixture, testId).click();
  await settle(fixture);
}

async function type(fixture: ComponentFixture<LibraryTestHost>, testId: string, value: string): Promise<void> {
  const input: HTMLInputElement = query(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function check(fixture: ComponentFixture<LibraryTestHost>, testId: string): Promise<void> {
  const input: HTMLInputElement = query(fixture, testId).querySelector(
    '[data-testid="checkbox-input"]',
  ) as HTMLInputElement;
  input.checked = true;
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function createPage(options: CreatePageOptions = {}): Promise<ComponentFixture<LibraryTestHost>> {
  store = new LibraryStoreStub(options.novels ?? FIXTURE_SUMMARIES, options.state ?? 'ready');
  await TestBed.configureTestingModule({
    imports: [LibraryTestHost],
    providers: [provideRouter([]), { provide: LibraryStore, useValue: store }],
  }).compileComponents();
  const fixture: ComponentFixture<LibraryTestHost> = TestBed.createComponent(LibraryTestHost);
  await settle(fixture);
  return fixture;
}

beforeEach(() => {
  showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = vi.fn();
});

afterEach(() => {
  if (showModal) HTMLDialogElement.prototype.showModal = showModal;
  else delete (HTMLDialogElement.prototype as { showModal?: () => void }).showModal;
});

describe('LibraryPage', () => {
  it('REQ-014 AC-2: shows the novel count and the coming soon state for other media', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();

    expect(store.load).toHaveBeenCalled();
    expect(query(fixture, 'library-page-count').textContent).toContain(String(FIXTURE_SUMMARIES.length));
    expect(query(fixture, 'lib-import')).not.toBeNull();

    await click(fixture, 'lib-switch-musics');
    expect(query(fixture, 'library-media-soon')).not.toBeNull();
    expect(has(fixture, 'lib-grid')).toBe(false);
  });

  it('REQ-014 AC-3: lists every novel with its title and author', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();
    const novel: NovelSummary = FIXTURE_SUMMARIES[0];

    expect(cardIds(fixture)).toHaveLength(FIXTURE_SUMMARIES.length);
    expect(query(fixture, `lib-card-${novel.id}`).textContent).toContain(novel.title);
    expect(query(fixture, `lib-card-${novel.id}`).textContent).toContain(novel.author);
  });

  it('REQ-014 AC-4: searches by title and focuses the search field with "/"', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();

    await type(fixture, 'lib-search', 'solo');
    expect(cardIds(fixture)).toEqual(['n-0004']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    expect(document.activeElement).toBe(query(fixture, 'lib-search'));
  });

  it('REQ-014 AC-5: filters by source language and publication status', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();

    await click(fixture, 'lib-lang-ja');
    expect(cardIds(fixture)).toEqual(['n-0005']);

    await click(fixture, 'lib-lang-ja');
    await check(fixture, 'lib-pub-ongoing');
    expect(cardIds(fixture)).toEqual(
      FIXTURE_SUMMARIES.filter((novel) => novel.publication === 'ongoing').map((novel) => novel.id),
    );
  });

  it('REQ-014 AC-6: sorts by chapter count in both directions', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();
    const ascending: string[] = [...FIXTURE_SUMMARIES]
      .sort((a, b) => a.chapterCount - b.chapterCount)
      .map((novel) => novel.id);

    const sort: HTMLSelectElement = query(fixture, 'lib-sort') as HTMLSelectElement;
    sort.value = 'chapterCount';
    sort.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(store.sortKey()).toBe('chapterCount');
    expect(cardIds(fixture)).toEqual([...ascending].reverse());

    await click(fixture, 'lib-sort-direction');
    expect(cardIds(fixture)).toEqual(ascending);
  });

  it('REQ-014 AC-8: shows the clicked novel in the inspector', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();
    const novel: NovelSummary = FIXTURE_SUMMARIES[3];

    await click(fixture, `lib-card-${novel.id}`);

    expect(query(fixture, `lib-card-${novel.id}`).classList).toContain('is-selected');
    expect(query(fixture, 'library-page-inspector').textContent).toContain(novel.title);
    expect(query(fixture, 'insp-chapters').textContent).toContain(String(novel.chapterCount));
  });

  it('REQ-014 AC-10, AC-11: opens the novel folder and the detail page from the inspector', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const novel: NovelSummary = FIXTURE_SUMMARIES[0];

    await click(fixture, 'insp-open-folder');
    expect(store.openFolder).toHaveBeenCalledWith(novel.id);

    await click(fixture, 'insp-open');
    expect(navigate).toHaveBeenCalledWith(`/library/${novel.id}`);
  });

  it('REQ-014 AC-12: selects several novels and asks to delete them', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();
    const [first, second] = FIXTURE_SUMMARIES;

    await check(fixture, `lib-check-${first.id}`);
    await check(fixture, `lib-check-${second.id}`);
    expect(query(fixture, 'lib-selection').textContent).toContain('2');

    await click(fixture, 'lib-selection-delete');
    const list: HTMLElement = query(fixture, 'novel-dlg-delete-list');
    expect(list.textContent).toContain(first.title);
    expect(list.textContent).toContain(second.title);
  });

  it('REQ-014 AC-13: shows the empty state with an import action', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage({ novels: [] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await click(fixture, 'library-page-import');

    expect(query(fixture, 'library-page-empty')).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith('/library/import');
  });

  it('REQ-014 AC-14: shows the no-results state and clears the filters', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage();

    await type(fixture, 'lib-search', 'no such novel');
    expect(query(fixture, 'library-page-no-results')).not.toBeNull();

    await click(fixture, 'library-page-clear');
    expect(cardIds(fixture)).toHaveLength(FIXTURE_SUMMARIES.length);
  });

  it('shows the load error and retries', async () => {
    const fixture: ComponentFixture<LibraryTestHost> = await createPage({ state: 'error' });

    await click(fixture, 'library-page-retry');

    expect(query(fixture, 'library-page-error')).not.toBeNull();
    expect(store.reload).toHaveBeenCalled();
  });
});
