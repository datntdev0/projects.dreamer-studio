import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelOutletComponent } from '@shell/layout/panel-outlet.component';
import { PageCrumbService } from '@shell/page-crumb.service';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTER_PARAGRAPHS, makeChapters, NOVELS, SAMPLE_PARAGRAPHS } from '../../../stories/fixtures/library';
import { LOADING_MS } from './library-format';
import type { LibraryNovel, NovelDetailInitialState } from './library.models';
import { LibraryMockStore } from './library.store';
import { NovelPage } from './novel.page';

const NOVEL: LibraryNovel = NOVELS.find((novel) => novel.id === 'n-0001')!;

interface CreatePageOptions {
  id?: string;
  initial?: Partial<NovelDetailInitialState>;
  locked?: boolean;
}

@Component({
  imports: [NovelPage, PanelOutletComponent],
  template: '<ds-panel-outlet edge="left" /><ds-novel-page /><ds-panel-outlet edge="right" />',
})
class NovelTestHost {}

let store: LibraryMockStore;
let showModal: (() => void) | undefined;

function query(fixture: ComponentFixture<NovelTestHost>, testId: string): HTMLElement {
  const element: HTMLElement | null = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing [data-testid="${testId}"]`);
  return element;
}

function queryAll(fixture: ComponentFixture<NovelTestHost>, testId: string): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
}

function has(fixture: ComponentFixture<NovelTestHost>, testId: string): boolean {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) !== null;
}

async function settle(fixture: ComponentFixture<NovelTestHost>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function click(fixture: ComponentFixture<NovelTestHost>, testId: string): Promise<void> {
  query(fixture, testId).click();
  await settle(fixture);
}

async function type(fixture: ComponentFixture<NovelTestHost>, testId: string, value: string): Promise<void> {
  const input: HTMLInputElement = query(fixture, testId) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function press(fixture: ComponentFixture<NovelTestHost>, target: EventTarget, key: string): Promise<void> {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await settle(fixture);
}

async function createPage(options: CreatePageOptions = {}): Promise<ComponentFixture<NovelTestHost>> {
  const id: string = options.id ?? NOVEL.id;
  await TestBed.configureTestingModule({
    imports: [NovelTestHost],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id })) } },
    ],
  }).compileComponents();
  store = TestBed.inject(LibraryMockStore);
  store.load({
    novels: NOVELS,
    sampleParagraphs: SAMPLE_PARAGRAPHS,
    paragraphsByChapter: CHAPTER_PARAGRAPHS,
    makeChapters,
  });
  store.setDetailInitialState({ ...store.detailInitialState(), ...options.initial });
  if (options.locked) store.setLock(id, { kind: 'export', runId: 'run-export', runLabel: NOVEL.originalTitle });
  const fixture: ComponentFixture<NovelTestHost> = TestBed.createComponent(NovelTestHost);
  await settle(fixture);
  await vi.advanceTimersByTimeAsync(LOADING_MS);
  await settle(fixture);
  return fixture;
}

beforeEach(() => {
  vi.useFakeTimers();
  showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  if (showModal) HTMLDialogElement.prototype.showModal = showModal;
  else delete (HTMLDialogElement.prototype as { showModal?: () => void }).showModal;
  delete (Element.prototype as { scrollTo?: () => void }).scrollTo;
});

describe('NovelPage', () => {
  it('REQ-023 AC-1: shows the novel title in the breadcrumb', async () => {
    await createPage();

    expect(TestBed.inject(PageCrumbService).detail()).toBe(NOVEL.title);
  });

  it('REQ-023 AC-2: shows the current chapter in the header with only Edit and Focus actions', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage({ initial: { chapter: 12 } });

    expect(query(fixture, 'novel-page-title').textContent?.trim()).toBe('0012 · 第十二章 夜探药园');
    expect(query(fixture, 'novel-page-title').getAttribute('lang')).toBe(NOVEL.language);
    const actions: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.ds-page-actions button'));
    expect(actions.map((button) => button.dataset['testid'])).toEqual(['novel-page-edit', 'novel-page-focus']);
    expect(actions[0].disabled).toBe(false);
  });

  it('REQ-023 AC-3: lists the chapters in order and opens the selected one in the reader', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage();
    const rows: HTMLElement[] = queryAll(fixture, 'novel-chapters-row');

    expect(rows.map((row) => Number(row.dataset['position']))).toEqual(store.chapters(NOVEL.id).map((c) => c.position));

    rows[2].querySelector<HTMLElement>('[data-testid="novel-chapters-row-open"]')!.click();
    await settle(fixture);

    expect(query(fixture, 'novel-page-title').textContent).toContain('0003 · 第3章');
    expect(query(fixture, 'novel-reader-article')).not.toBeNull();
  });

  it('REQ-023 AC-4: opens a chapter by number with Enter and filters the list by title', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage();

    await type(fixture, 'novel-chapters-search', '夜探');
    expect(queryAll(fixture, 'novel-chapters-row').map((row) => row.dataset['position'])).toEqual(['12']);

    await type(fixture, 'novel-chapters-search', '45');
    await press(fixture, query(fixture, 'novel-chapters-search'), 'Enter');
    expect(query(fixture, 'novel-page-title').textContent).toContain('0045 · 第45章');
  });

  it('REQ-023 AC-5: switches the right panel between the Reading and Search tabs', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage();

    expect(query(fixture, 'reading-settings-font')).not.toBeNull();
    expect(has(fixture, 'novel-search-input')).toBe(false);

    await click(fixture, 'novel-page-tab-search');
    expect(query(fixture, 'novel-search-input')).not.toBeNull();
    expect(has(fixture, 'reading-settings-font')).toBe(false);
  });

  it('REQ-023 AC-6: shows the loading state, then the novel', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage();

    store.simulateLoading();
    await settle(fixture);
    expect(query(fixture, 'novel-page').dataset['state']).toBe('loading');
    expect(has(fixture, 'novel-page-title')).toBe(false);

    await vi.advanceTimersByTimeAsync(LOADING_MS);
    await settle(fixture);
    expect(query(fixture, 'novel-page').dataset['state']).toBe('ready');
  });

  it('REQ-023 AC-6: shows the not-found state for an unknown novel', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage({ id: 'n-missing' });

    expect(query(fixture, 'novel-page-not-found')).not.toBeNull();
    expect(query(fixture, 'novel-page-not-found-back').getAttribute('href')).toBe('/library');
  });

  it('REQ-023 AC-6: shows the error state and retries', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage({ id: 'n-broken' });

    expect(query(fixture, 'novel-page-error')).not.toBeNull();
    await click(fixture, 'novel-page-retry');
    expect(query(fixture, 'novel-page').dataset['state']).toBe('loading');
  });

  it('REQ-023 AC-7: shows the pipeline banner and disables Edit while the novel is locked', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage({ initial: { chapter: 12 }, locked: true });

    expect(query(fixture, 'novel-page-lock').textContent).toContain('run-export');
    expect(query(fixture, 'novel-page-lock-pipelines').getAttribute('href')).toBe('/pipelines');
    expect((query(fixture, 'novel-page-edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('REQ-019: Focus hides both side panels and Escape brings them back', async () => {
    const fixture: ComponentFixture<NovelTestHost> = await createPage();
    const layout: LayoutService = TestBed.inject(LayoutService);

    await click(fixture, 'novel-page-focus');
    expect(layout.isOpen('left')).toBe(false);
    expect(layout.isOpen('right')).toBe(false);
    expect(has(fixture, 'novel-page-chapters-panel')).toBe(false);

    await press(fixture, document, 'Escape');
    expect(layout.isOpen('left')).toBe(true);
    expect(layout.isOpen('right')).toBe(true);
    expect(query(fixture, 'novel-page-chapters-panel')).not.toBeNull();
  });
});
