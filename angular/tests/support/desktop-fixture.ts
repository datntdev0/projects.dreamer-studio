import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Provider, Type } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, vi } from 'vitest';
import { DesktopApi } from '@core/desktop-api';
import { SettingsStore } from '@core/stores/settings-store';
import { PipelineStore } from '@core/stores/pipeline-store';
import { ACTIVE_PIPELINES, RECENT_PIPELINES } from '@core/slots';
import { ToastService } from '@components/toast/toast.service';
import { ToastOutletComponent } from '@components/toast/toast-outlet.component';
import { ConfirmHostComponent } from '@components/dialog/confirm-host.component';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { ChapterTranslation, GlossaryRow, TargetLanguage } from '@dreamer/shared/models/translation';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { novelDetail } from './novel';
import { createPanelOutlets, settleViews } from './component-fixtures';
import { PanelOutletComponent } from '../../src/shell/layout/panel-outlet.component';

const browserMethods: Array<{ target: object; key: string; descriptor: PropertyDescriptor | undefined }> = [];
const animationFrames = new Set<number>();
function browserMethod(target: object, key: string, value: unknown): void {
  browserMethods.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
}

function event<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe: vi.fn((listener: (value: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    emit: (value: T) => listeners.forEach((listener) => listener(value)),
  };
}

export function desktopFixture() {
  const settingsChanged = event<Parameters<Parameters<DesktopApi['onSettingsChanged']>[0]>[0]>();
  const libraryChanged = event<Parameters<Parameters<DesktopApi['onLibraryChanged']>[0]>[0]>();
  const pipelineChanged = event<PipelineRun>();
  const pipelineDeleted = event<string[]>();
  const translationChanged = event<Parameters<Parameters<DesktopApi['onTranslationChanged']>[0]>[0]>();
  const searchProgress = event<Parameters<Parameters<DesktopApi['onSearchProgress']>[0]>[0]>();
  const base = {
    ...novelDetail(),
    language: 'zh',
    importedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const state = {
    settings: defaultSettings('test-data'),
    novels: [base] as NovelDetail[],
    analysed: true,
    glossary: [] as GlossaryRow[],
    translations: new Map<string, ChapterTranslation>(),
    instructions: new Map<string, string>(),
    runs: [] as PipelineRun[],
  };
  const instruction = (novelId: string, language: TargetLanguage) => ({
    novelId,
    language,
    text: state.instructions.get(`${novelId}/${language}`) ?? 'Default instruction',
    isDefault: !state.instructions.has(`${novelId}/${language}`),
    updatedAt: null,
  });
  const api = {
    writeLog: vi.fn<DesktopApi['writeLog']>(),
    openLogs: vi.fn<DesktopApi['openLogs']>(async () => undefined),
    info: vi.fn<DesktopApi['info']>(async () => ({
      version: '0.2.0',
      buildDate: null,
      author: 'Author',
      appDataDir: 'test-data',
      settingsDir: 'settings',
      electron: '42',
      chrome: '148',
      node: '26',
      os: 'Windows',
      schemaVersion: '0.2.0_1',
    })),
    onAppDataChanged: vi.fn<DesktopApi['onAppDataChanged']>(() => () => undefined),
    backendStatus: vi.fn<DesktopApi['backendStatus']>(async () => ({
      state: 'running',
      address: 'http://localhost:1234',
    })),
    onBackendStatus: vi.fn<DesktopApi['onBackendStatus']>(() => () => undefined),
    onError: vi.fn<DesktopApi['onError']>(() => () => undefined),
    settings: vi.fn<DesktopApi['settings']>(async () => ({
      settings: state.settings,
      notice: 'none',
      defaultAppDataDir: 'test-data',
    })),
    updateSettings: vi.fn<DesktopApi['updateSettings']>(async (patch) => {
      state.settings = {
        ...state.settings,
        ...patch,
        llm: { ...state.settings.llm, ...patch.llm },
        pipelines: { ...state.settings.pipelines, ...patch.pipelines },
      };
      settingsChanged.emit(state.settings);
      return state.settings;
    }),
    onSettingsChanged: settingsChanged.subscribe,
    llmStatus: vi.fn<DesktopApi['llmStatus']>(async () => []),
    onLlmChanged: vi.fn<DesktopApi['onLlmChanged']>(() => () => undefined),
    listNovels: vi.fn<DesktopApi['listNovels']>(async () => state.novels),
    getNovel: vi.fn<DesktopApi['getNovel']>(async (id) => state.novels.find((novel) => novel.id === id) ?? null),
    getChapter: vi.fn<DesktopApi['getChapter']>(async ({ file }) => ({
      paragraphs: [file === 'first' ? 'moon over moon' : 'Second source.'],
    })),
    changeChapters: vi.fn<DesktopApi['changeChapters']>(
      async ({ novelId }) => state.novels.find((novel) => novel.id === novelId) ?? null,
    ),
    updateNovel: vi.fn<DesktopApi['updateNovel']>(async (id, patch) => {
      const current = state.novels.find((novel) => novel.id === id);
      if (!current) return null;
      const { cover, ...metadata } = patch;
      const next = {
        ...current,
        ...metadata,
        hasCover: cover === 'remove' ? false : typeof cover === 'object' ? true : current.hasCover,
      };
      state.novels = state.novels.map((novel) => (novel.id === id ? next : novel));
      libraryChanged.emit({ novelIds: [id] });
      return next;
    }),
    pickImage: vi.fn<DesktopApi['pickImage']>(async () => null),
    onLibraryChanged: libraryChanged.subscribe,
    onPipelineUpdate: pipelineChanged.subscribe,
    onPipelineDeleted: pipelineDeleted.subscribe,
    onAnalysisProgress: vi.fn<DesktopApi['onAnalysisProgress']>(() => () => undefined),
    onAnalysisChanged: vi.fn<DesktopApi['onAnalysisChanged']>(() => () => undefined),
    analysisStatus: vi.fn<DesktopApi['analysisStatus']>(async (novelId) => ({
      novelId,
      chapters: state.novels[0].chapters.map((chapter, index) => ({
        index: index + 1,
        file: chapter.file,
        title: chapter.title,
        status: 'analysed',
        counts: { entities: 1, facts: 0 },
      })),
      run: null,
      issues: { errors: 0, warnings: 0 },
      ontology: {
        name: '',
        task: '',
        rules: [],
        entityTypes: [],
        entityTypeDescriptions: {},
        entityTypeExamples: {},
        entityTypeProperties: {},
        predicates: [],
      },
      ontologyProblems: [],
      lastRun: null,
    })),
    analysisWorld: vi.fn<DesktopApi['analysisWorld']>(async () => ({ entities: [], links: [], orphans: [] })),
    analysisReview: vi.fn<DesktopApi['analysisReview']>(async () => ({
      items: [],
      counts: { errors: 0, warnings: 0 },
    })),
    pipelineTypes: vi.fn<DesktopApi['pipelineTypes']>(async () => []),
    listPipelines: vi.fn<DesktopApi['listPipelines']>(async ({ finished }) => ({
      runs: state.runs.filter((run) => finished !== false || run.status === 'running' || run.status === 'queued'),
      total: state.runs.length,
      next: null,
    })),
    onSearchProgress: searchProgress.subscribe,
    search: vi.fn<DesktopApi['search']>(async () => undefined),
    cancelSearch: vi.fn<DesktopApi['cancelSearch']>(async () => undefined),
    pickPackage: vi.fn<DesktopApi['pickPackage']>(async () => 'novel.zip'),
    readPackage: vi.fn<DesktopApi['readPackage']>(async () => null),
    pathForFile: vi.fn<DesktopApi['pathForFile']>(() => null),
    importNovel: vi.fn<DesktopApi['importNovel']>(async () => ({
      id: 'import',
      type: 'novel-import',
      status: 'queued',
      cancelReason: null,
      progress: 0,
      stepIndex: 0,
      stepCount: 3,
      stepName: null,
      stepDetail: null,
      errorCode: null,
      error: null,
      label: 'Novel',
      novelId: null,
      createdAt: '2026-01-01T00:00:00Z',
      startedAt: null,
      finishedAt: null,
    })),
    translationStatus: vi.fn<DesktopApi['translationStatus']>(async ({ novelId, language }) => {
      const selected = language ?? 'vi';
      return {
        novelId,
        language: selected,
        targets: ['vi', 'en'],
        languages: [],
        run: null,
        lastRun: null,
        glossary: {
          total: state.glossary.length,
          untranslated: state.glossary.filter((row) => !row.translation).length,
        },
        chapters: (state.novels.find((novel) => novel.id === novelId)?.chapters ?? []).map((chapter, position) => ({
          index: position + 1,
          file: chapter.file,
          title: state.translations.get(`${selected}/${chapter.file}`)?.title ?? null,
          status: state.translations.has(`${selected}/${chapter.file}`) ? 'translated' : 'not-translated',
          issues: 0,
          edited: false,
          staleReason: null,
          instructionChanged: false,
          error: null,
        })),
        llm: {
          glossary: { available: true, label: 'Fake CLI', reason: null },
          content: { available: true, label: 'Fake CLI', reason: null },
        },
      };
    }),
    translationInstruction: vi.fn<DesktopApi['translationInstruction']>(async ({ novelId, language }) =>
      instruction(novelId, language),
    ),
    translationSaveInstruction: vi.fn<DesktopApi['translationSaveInstruction']>(async ({ novelId, language, text }) => {
      state.instructions.set(`${novelId}/${language}`, text);
      return instruction(novelId, language);
    }),
    translationResetInstruction: vi.fn<DesktopApi['translationResetInstruction']>(async ({ novelId, language }) => {
      state.instructions.delete(`${novelId}/${language}`);
      return instruction(novelId, language);
    }),
    translationGlossary: vi.fn<DesktopApi['translationGlossary']>(async ({ novelId, language }) => ({
      novelId,
      language,
      analysed: state.analysed,
      rows: state.glossary,
    })),
    translationEditGlossary: vi.fn<DesktopApi['translationEditGlossary']>(async ({ key, translation }) => {
      state.glossary = state.glossary.map((row) =>
        row.entityName === key.entityName && row.term === key.term
          ? { ...row, translation, status: translation ? 'user' : 'untranslated' }
          : row,
      );
    }),
    translationChapter: vi.fn<DesktopApi['translationChapter']>(
      async ({ file, language }) => state.translations.get(`${language}/${file}`) ?? null,
    ),
    translationPlanGlossary: vi.fn<DesktopApi['translationPlanGlossary']>(async () => ({
      count: 2,
      batches: 1,
      userEntries: 0,
      blockedReason: null,
    })),
    translationStartGlossary: vi.fn<DesktopApi['translationStartGlossary']>(async () => undefined),
    translationPlanContent: vi.fn<DesktopApi['translationPlanContent']>(async ({ from, to }) => ({
      count: 2,
      from: from ?? 1,
      to: to ?? 2,
      userEdited: 1,
      untranslatedNames: 0,
      blockedReason: null,
    })),
    translationStartContent: vi.fn<DesktopApi['translationStartContent']>(async () => undefined),
    onTranslationProgress: vi.fn<DesktopApi['onTranslationProgress']>(() => () => undefined),
    onTranslationChanged: translationChanged.subscribe,
  };

  async function mount<T>(
    component: Type<T>,
    panels = false,
    providers: Provider[] = [],
    inputs: Record<string, unknown> = {},
  ) {
    localStorage.removeItem('dreamer.currentNovel');
    localStorage.removeItem('dreamer.library.browse');
    // JSDOM has no layout/scrolling implementation; keep production components and adapt only browser APIs.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    browserMethod(HTMLDialogElement.prototype, 'showModal', function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    browserMethod(HTMLDialogElement.prototype, 'close', function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    browserMethod(HTMLElement.prototype, 'scrollTo', () => undefined);
    const requestFrame = window.requestAnimationFrame.bind(window);
    browserMethod(window, 'requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = requestFrame((time) => {
        animationFrames.delete(id);
        callback(time);
      });
      animationFrames.add(id);
      return id;
    });
    await TestBed.configureTestingModule({
      imports: [component, PanelOutletComponent, ToastOutletComponent, ConfirmHostComponent],
      providers: [
        provideRouter([]),
        { provide: DesktopApi, useValue: api },
        { provide: ACTIVE_PIPELINES, useFactory: (store: PipelineStore) => store.active, deps: [PipelineStore] },
        { provide: RECENT_PIPELINES, useFactory: (store: PipelineStore) => store.recent, deps: [PipelineStore] },
        ...providers,
      ],
    }).compileComponents();
    await TestBed.inject(SettingsStore).load();
    TestBed.inject(PipelineStore).init();
    const fixture = TestBed.createComponent(component);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    const outlets = panels ? createPanelOutlets() : [];
    const toasts = TestBed.createComponent(ToastOutletComponent);
    toasts.componentRef.setInput('closeLabel', 'Dismiss');
    const confirm = TestBed.createComponent(ConfirmHostComponent);
    const views: ComponentFixture<unknown>[] = [fixture, ...outlets, toasts, confirm];
    const settle = async () => {
      await settleViews(...views);
      // Desktop replies can schedule another component effect outside Angular's pending tasks.
      for (let turn = 0; turn < 2; turn++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        TestBed.tick();
        await settleViews(...views);
      }
    };
    const find = (id: string, root?: ParentNode): HTMLElement | null => {
      const selector = `[data-testid="${id}"]`;
      if (root) return root.querySelector<HTMLElement>(selector);
      for (const view of views) {
        const found = (view.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
        if (found) return found;
      }
      return null;
    };
    const element = (id: string, root?: ParentNode): HTMLElement => {
      const found = find(id, root);
      if (!found) throw new Error(`Missing production element: ${id}`);
      return found;
    };
    const click = async (id: string, root?: ParentNode) => {
      element(id, root).click();
      await settle();
    };
    const input = async (id: string, value: string, kind = 'input', root?: ParentNode) => {
      const control = element(id, root) as HTMLInputElement;
      control.value = value;
      control.dispatchEvent(new Event(kind, { bubbles: true }));
      await settle();
    };
    const add = async <C>(type: Type<C>, inputs: Record<string, unknown> = {}) => {
      const extra = TestBed.createComponent(type);
      Object.entries(inputs).forEach(([name, value]) => extra.componentRef.setInput(name, value));
      views.push(extra);
      await settle();
      return extra;
    };
    await settle();
    return { fixture, outlets, views, settle, find, element, click, input, add };
  }
  return {
    api,
    state,
    mount,
    settingsChanged,
    libraryChanged,
    pipelineChanged,
    pipelineDeleted,
    translationChanged,
    searchProgress,
  };
}

export function translatedChapter(
  file = 'first',
  language: TargetLanguage = 'vi',
  paragraphs = ['Translated text.'],
): ChapterTranslation {
  return {
    index: file === 'first' ? 1 : 2,
    file,
    language,
    title: `Translated ${file}`,
    paragraphs,
    status: 'translated',
    issues: 0,
    edited: false,
    staleReason: null,
    instructionChanged: false,
    error: null,
    issueList: [],
    translatedAt: null,
  };
}

export function novelRoute(id = 'novel') {
  const params = new BehaviorSubject(convertToParamMap({ id }));
  const query = new BehaviorSubject(convertToParamMap({}));
  const provider: Provider = {
    provide: ActivatedRoute,
    useValue: {
      paramMap: params,
      queryParamMap: query,
      snapshot: { paramMap: params.value, queryParamMap: query.value },
    },
  };
  return { params, query, provider };
}

afterEach(() => {
  if (TestBed) {
    // Toast timers are an external lifetime; release them before fixture teardown.
    const toast = TestBed.inject(ToastService, null);
    toast?.toasts().forEach((item) => toast.dismiss(item.id));
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  animationFrames.forEach((id) => window.cancelAnimationFrame(id));
  animationFrames.clear();
  for (const { target, key, descriptor } of browserMethods.splice(0).reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
  localStorage.removeItem('dreamer.currentNovel');
  localStorage.removeItem('dreamer.library.browse');
});
