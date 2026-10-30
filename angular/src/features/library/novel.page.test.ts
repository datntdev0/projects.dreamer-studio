import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AppInfoStore } from '@core/app-info';
import { DesktopApi } from '@core/desktop-api';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import { RecentNovelStore } from '@core/stores/recent-novel-store';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import { makeChapters, NOVELS, toNovelSummary } from '../../../stories/fixtures/library';
import type { LibraryChapter, LibraryNovel } from './library.models';
import { NovelPage } from './novel.page';
import { LayoutService } from '@shell/layout/layout.service';
import { PanelOutletComponent } from '@shell/layout/panel-outlet.component';

const novel = NOVELS.find((item: LibraryNovel) => item.id === 'n-0001')!;
const chapters: LibraryChapter[] = makeChapters(novel);
const detail: NovelDetail = {
  ...toNovelSummary(novel), chapterCount: chapters.length, description: novel.description,
  chapters: chapters.map(({ position, title, file, paragraphCount, chars }) => ({
    position, title, file, paragraphs: paragraphCount, chars,
  })),
};

@Component({ imports: [NovelPage, PanelOutletComponent], template: '<ds-panel-outlet edge="left" /><ds-novel-page /><ds-panel-outlet edge="right" />' })
class Host {}

describe('[TH03-03] NovelPage focus mode', () => {
  it('[L2-TH03-03-01] hides both side panels and restores them with Escape', async () => {
    HTMLElement.prototype.scrollTo ??= vi.fn();
    const params = new BehaviorSubject(convertToParamMap({ id: novel.id }));
    const api: Partial<DesktopApi> = {
      getNovel: vi.fn(async () => detail),
      getChapter: vi.fn(async () => ({ paragraphs: ['A chapter.'] })),
      onLibraryChanged: () => () => undefined,
      onPipelineUpdate: () => () => undefined,
      onSearchProgress: () => () => undefined,
      writeLog: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        { provide: DesktopApi, useValue: api },
        { provide: AppInfoStore, useValue: { info: signal({ appDataDir: 'test-data' }) } },
        { provide: RecentNovelStore, useValue: { record: vi.fn() } },
        { provide: CurrentNovelStore, useValue: { analyse: vi.fn() } },
        { provide: ActivatedRoute, useValue: {
          paramMap: params, queryParamMap: new BehaviorSubject(convertToParamMap({})),
          snapshot: { paramMap: params.value, queryParamMap: convertToParamMap({}) },
        } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const layout = TestBed.inject(LayoutService);

    (fixture.nativeElement.querySelector('[data-testid="novel-page-focus"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(layout.isOpen('left')).toBe(false);
    expect(layout.isOpen('right')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(layout.isOpen('left')).toBe(true);
    expect(layout.isOpen('right')).toBe(true);
  });
});
