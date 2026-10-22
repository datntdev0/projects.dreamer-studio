import { Component, computed, signal, type Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { defaultSettings } from '@dreamer/shared/models/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { ACTIVE_RUNS, RECENT_RUNS, RUNNING_RUN, runLog } from '../../../stories/fixtures/pipelines';
import { DesktopApi } from '../../core/desktop-api';
import { PipelineStore } from '../../core/stores/pipeline-store';
import { SettingsStore } from '../../core/stores/settings-store';
import { PanelOutletComponent } from '../../shell/layout/panel-outlet.component';
import { PipelineActions } from './pipeline-actions';
import { PipelinesPage } from './pipelines.page';
import { PipelinesViewStore } from './pipelines-view.store';
import type { HistorySlot, HistoryStatusFilter, PipelineView } from './pipelines-view.store';

const APP_DATA_DIR: string = 'C:\\Users\\me\\AppData\\Local\\DreamerStudio';
const TYPE_INFO: PipelineTypeInfo = {
  type: 'demo',
  steps: [
    { key: 'run.demo.step.1', backend: false },
    { key: 'run.demo.step.2', backend: false },
    { key: 'run.demo.step.3', backend: true },
    { key: 'run.demo.step.4', backend: false },
    { key: 'run.demo.step.5', backend: false },
  ],
};

interface CreatePageOptions {
  active?: PipelineRun[];
  history?: PipelineRun[];
  id?: string | null;
}

@Component({
  imports: [PipelinesPage, PanelOutletComponent],
  template: '<ds-pipelines-page /><ds-panel-outlet edge="bottom" /><ds-panel-outlet edge="right" />',
})
class PipelinesTestHost {}

class PipelineStoreStub {
  readonly active: Signal<{ state: 'ready'; runs: PipelineRun[] }>;
  readonly types: Signal<PipelineTypeInfo[]> = signal<PipelineTypeInfo[]>([TYPE_INFO]);
  readonly start = vi.fn<(request: PipelineStartRequest) => Promise<PipelineRun | null>>();
  readonly load = vi.fn<(id: string) => Promise<void>>();
  private readonly runs: Signal<PipelineRun[]>;

  constructor(active: PipelineRun[], history: PipelineRun[]) {
    this.active = signal({ state: 'ready' as const, runs: active });
    this.runs = signal<PipelineRun[]>([...active, ...history]);
    this.start.mockResolvedValue(RUNNING_RUN);
    this.load.mockResolvedValue(undefined);
  }

  run(id: string): Signal<PipelineRun | undefined> {
    return computed(() => this.runs().find((run) => run.id === id));
  }
}

class PipelinesViewStoreStub {
  readonly view = signal<PipelineView>('queue');
  readonly status = signal<HistoryStatusFilter | null>(null);
  readonly type = signal<PipelineTypeInfo['type'] | null>(null);
  readonly history: Signal<HistorySlot>;
  readonly checked = signal<ReadonlySet<string>>(new Set<string>());
  readonly filtered = computed<boolean>(() => this.status() !== null || this.type() !== null);
  readonly setStatus = vi.fn<(status: HistoryStatusFilter | null) => void>();
  readonly setType = vi.fn<(type: PipelineTypeInfo['type'] | null) => void>();
  readonly clearFilters = vi.fn<() => void>();
  readonly toggle = vi.fn<(id: string, checked: boolean) => void>();
  readonly checkLoaded = vi.fn<(checked: boolean) => void>();
  readonly isChecked = vi.fn<(id: string) => boolean>();

  constructor(runs: PipelineRun[]) {
    this.history = signal<HistorySlot>({ state: 'ready', runs, total: runs.length, next: null, loadingMore: false });
    this.setStatus.mockImplementation((status) => this.status.set(status));
    this.setType.mockImplementation((type) => this.type.set(type));
    this.clearFilters.mockImplementation(() => {
      this.status.set(null);
      this.type.set(null);
    });
    this.toggle.mockImplementation((id, checked) => {
      this.checked.update((current) => {
        const next: Set<string> = new Set(current);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    });
    this.checkLoaded.mockImplementation((checked) => {
      this.checked.set(checked ? new Set(runs.map((run) => run.id)) : new Set<string>());
    });
    this.isChecked.mockImplementation((id) => this.checked().has(id));
  }
}

let api: { pipelineLog: ReturnType<typeof vi.fn> };
let actions: { cancel: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
let store: PipelineStoreStub;
let viewStore: PipelinesViewStoreStub;
let showModal: (() => void) | undefined;

function query(fixture: ComponentFixture<PipelinesTestHost>, testId: string): HTMLElement {
  const element: HTMLElement | null = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing [data-testid="${testId}"]`);
  return element;
}

async function settle(fixture: ComponentFixture<PipelinesTestHost>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function click(fixture: ComponentFixture<PipelinesTestHost>, testId: string): Promise<void> {
  query(fixture, testId).click();
  await settle(fixture);
}

async function createPage(options: CreatePageOptions = {}): Promise<ComponentFixture<PipelinesTestHost>> {
  const active: PipelineRun[] = options.active ?? ACTIVE_RUNS;
  const history: PipelineRun[] = options.history ?? RECENT_RUNS.filter((run) => run.finishedAt !== null);
  const route = new BehaviorSubject(convertToParamMap(options.id ? { id: options.id } : {}));
  store = new PipelineStoreStub(active, history);
  viewStore = new PipelinesViewStoreStub(history);
  api = { pipelineLog: vi.fn<(id: string) => Promise<string[]>>((id) => Promise.resolve(runLog(store.run(id)()!))) };
  actions = {
    cancel: vi.fn<(run: PipelineRun) => Promise<void>>().mockResolvedValue(undefined),
    delete: vi.fn<(ids: string[]) => Promise<boolean>>().mockResolvedValue(true),
    open: vi.fn<(id: string) => void>(),
  };

  await TestBed.configureTestingModule({
    imports: [PipelinesTestHost],
    providers: [
      provideRouter([]),
      {
        provide: DesktopApi,
        useValue: {
          pipelineLog: api.pipelineLog,
          onAppDataChanged: vi.fn<() => () => void>(() => () => undefined),
          onPipelineDeleted: vi.fn<() => () => void>(() => () => undefined),
          onPipelineLog: vi.fn<() => () => void>(() => () => undefined),
          onPipelineUpdate: vi.fn<() => () => void>(() => () => undefined),
          writeLog: vi.fn(),
        },
      },
      { provide: ActivatedRoute, useValue: { paramMap: route } },
      { provide: PipelineActions, useValue: actions },
      { provide: PipelineStore, useValue: store },
      { provide: PipelinesViewStore, useValue: viewStore },
      { provide: SettingsStore, useValue: { settings: signal(defaultSettings(APP_DATA_DIR)), state: signal(null) } },
    ],
  }).compileComponents();
  const fixture: ComponentFixture<PipelinesTestHost> = TestBed.createComponent(PipelinesTestHost);
  await settle(fixture);
  return fixture;
}

beforeEach(() => {
  vi.useFakeTimers();
  showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  if (showModal) HTMLDialogElement.prototype.showModal = showModal;
  else delete (HTMLDialogElement.prototype as { showModal?: () => void }).showModal;
});

describe('PipelinesPage', () => {
  it('AC-2: lists active runs with status, progress and current step', async () => {
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage();
    const rows: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="pipelines-queue-row"]'),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.status).toBe('running');
    expect(rows[0].textContent).toContain('Running');
    expect(query(fixture, 'pipelines-run-progress').getAttribute('aria-valuenow')).toBe('30');
    expect(query(fixture, 'pipelines-run-step').textContent).toContain('2/5');
    expect(rows[1].dataset.status).toBe('queued');
    expect(rows[1].textContent).toContain('Queued');
  });

  it('AC-3: starts and cancels a pipeline from the UI', async () => {
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage({ active: [RUNNING_RUN] });

    await click(fixture, 'pipelines-start');
    expect(query(fixture, 'pipeline-start-dialog').querySelector('[data-testid="dialog"]')).not.toBeNull();
    await click(fixture, 'pipeline-start-confirm');
    expect(store.start).toHaveBeenCalledWith({ type: 'demo', failAtStep: null });
    expect(actions.open).toHaveBeenCalledWith(RUNNING_RUN.id);

    await click(fixture, 'pipelines-run-cancel');
    expect(actions.cancel).toHaveBeenCalledWith(RUNNING_RUN);
  });

  it('AC-4: opens an active pipeline and loads its live log', async () => {
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage({ active: [RUNNING_RUN] });

    await click(fixture, 'pipelines-queue-row');
    expect(actions.open).toHaveBeenCalledWith(RUNNING_RUN.id);
    expect(api.pipelineLog).toHaveBeenCalledWith(RUNNING_RUN.id);
    expect(query(fixture, 'pipeline-log').textContent).toContain('Run started');
  });

  it('REQ-005 AC-1: lists finished runs with their status and result', async () => {
    const history: PipelineRun[] = RECENT_RUNS.filter((run) => run.finishedAt !== null);
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage({ history });

    await click(fixture, 'pipelines-tab-history');
    const rows: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="pipelines-history-row"]'),
    );

    expect(rows).toHaveLength(history.length);
    expect(rows[0].dataset.status).toBe('succeeded');
    expect(rows[0].textContent).toContain('Demo pipeline');
    expect(rows[0].textContent).toContain('Succeeded');
    expect(rows[0].textContent).toContain('01:12');
    expect(query(fixture, 'pipelines-row-result').textContent).toContain('5/5 steps');
  });

  it('REQ-005 AC-2: filters finished runs by status and pipeline type', async () => {
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage();

    await click(fixture, 'pipelines-tab-history');
    const status: HTMLSelectElement = query(fixture, 'pipelines-filter-status') as HTMLSelectElement;
    status.value = 'failed';
    status.dispatchEvent(new Event('change'));
    await settle(fixture);
    const type: HTMLSelectElement = query(fixture, 'pipelines-filter-type') as HTMLSelectElement;
    type.value = 'demo';
    type.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(viewStore.setStatus).toHaveBeenCalledWith('failed');
    expect(viewStore.setType).toHaveBeenCalledWith('demo');
    expect(query(fixture, 'pipelines-filter-clear')).not.toBeNull();
  });

  it('REQ-005 AC-3: opens a finished run with its details and log', async () => {
    const history: PipelineRun[] = RECENT_RUNS.filter((run) => run.finishedAt !== null);
    const run: PipelineRun = history[0];
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage({ history, id: run.id });

    expect(query(fixture, 'pipelines-page').dataset.view).toBe('history');
    expect(query(fixture, 'pipeline-details-name').textContent).toContain('Demo pipeline');
    expect(api.pipelineLog).toHaveBeenCalledWith(run.id);
    expect(query(fixture, 'pipeline-log').textContent).toContain('Run succeeded');
  });

  it('REQ-005 AC-4: deletes selected finished runs', async () => {
    const history: PipelineRun[] = RECENT_RUNS.filter((run) => run.finishedAt !== null);
    const fixture: ComponentFixture<PipelinesTestHost> = await createPage({ history });

    await click(fixture, 'pipelines-tab-history');
    const select: HTMLInputElement = query(fixture, 'pipelines-row-select').querySelector(
      '[data-testid="checkbox-input"]',
    ) as HTMLInputElement;
    select.checked = true;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    await click(fixture, 'pipelines-delete');

    expect(actions.delete).toHaveBeenCalledWith([history[0].id]);
  });
});
