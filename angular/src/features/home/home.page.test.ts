import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import type { NovelSummary } from '@dreamer/shared/models/novel';
import { DesktopApi } from '@core/desktop-api';
import { LibraryStore } from '@core/stores/library-store';
import { RecentNovelStore } from '@core/stores/recent-novel-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '@core/slots';
import { HomePage } from './home.page';

const APP_INFO: AppInfo = {
  version: '0.0.0',
  buildDate: '2026-10-20',
  author: 'datntdev',
  appDataDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  settingsDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  electron: '44.9.0',
  chrome: '150.0.7800.45',
  node: '24.11.0',
  os: 'Windows 10.0.19045 (x64)',
  schemaVersion: '0.0.0_1',
};

function run(id: string, status: PipelineRun['status']): PipelineRun {
  return {
    id,
    type: 'demo',
    status,
    cancelReason: null,
    progress: status === 'running' ? 50 : 100,
    stepIndex: 3,
    stepCount: 5,
    stepName: 'pipeline.step.3',
    stepDetail: null,
    errorCode: null,
    error: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    startedAt: '2026-10-20T10:01:00.000Z',
    finishedAt: status === 'running' ? null : '2026-10-20T10:03:00.000Z',
    label: null,
    novelId: null,
  };
}

const NOVEL: NovelSummary = {
  id: 'novel-1',
  originalTitle: 'Original',
  title: 'Novel',
  author: 'Author',
  language: 'en',
  publication: 'completed',
  tags: [],
  chapterCount: 12,
  charCount: 1000,
  importedAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  hasCover: false,
  translations: [],
  lock: null,
};

describe('HomePage', () => {
  it('renders the production cards with backend and pipeline data', async () => {
    const backend: BackendStatus = { state: 'running', address: '127.0.0.1:47123' };
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        {
          provide: DesktopApi,
          useValue: {
            info: async () => APP_INFO,
            openDataDir: async () => undefined,
            backendStatus: async () => backend,
            onBackendStatus: (listener: (status: BackendStatus) => void) => {
              listener(backend);
              return () => undefined;
            },
            onAppDataChanged: () => () => undefined,
            llmStatus: async () => [],
            onLlmChanged: () => () => undefined,
          },
        },
        { provide: ACTIVE_PIPELINES, useValue: signal({ state: 'ready' as const, runs: [run('active', 'running')] }) },
        {
          provide: LibraryStore,
          useValue: {
            novels: signal([NOVEL]),
            state: signal('ready'),
            error: signal(null),
            load: async () => undefined,
          },
        },
        {
          provide: RecentNovelStore,
          useValue: { entries: signal([{ id: NOVEL.id, openedAt: '2026-10-20T10:00:00.000Z' }]) },
        },
        {
          provide: RECENT_PIPELINES,
          useValue: signal({ state: 'ready' as const, runs: [run('recent', 'succeeded')] }),
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="home-card-data"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="home-backend-state"]')?.dataset.state).toBe('running');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="home-running-row"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="home-recent-row"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-testid="home-recent-row"]')?.getAttribute('href')).toBe(
      '/library/novel-1',
    );
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="home-recent-pipelines"] .home-recent-row'),
    ).toHaveLength(1);
  });

  it('renders unavailable and empty states from the production child components', async () => {
    const backend: BackendStatus = { state: 'unavailable', address: null };
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        {
          provide: DesktopApi,
          useValue: {
            info: async () => APP_INFO,
            backendStatus: async () => backend,
            onBackendStatus: (listener: (status: BackendStatus) => void) => {
              listener(backend);
              return () => undefined;
            },
            onAppDataChanged: () => () => undefined,
            llmStatus: async () => [],
            onLlmChanged: () => () => undefined,
          },
        },
        { provide: ACTIVE_PIPELINES, useValue: signal({ state: 'ready' as const, runs: [] }) },
        {
          provide: LibraryStore,
          useValue: { novels: signal([]), state: signal('ready'), error: signal(null), load: async () => undefined },
        },
        { provide: RecentNovelStore, useValue: { entries: signal([]) } },
        { provide: RECENT_PIPELINES, useValue: signal({ state: 'ready' as const, runs: [] }) },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="home-backend-state"]')?.dataset.state).toBe(
      'unavailable',
    );
    expect(fixture.nativeElement.querySelectorAll('[data-testid="home-running-row"]')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="home-recent-row"]')).toHaveLength(0);
  });
});
