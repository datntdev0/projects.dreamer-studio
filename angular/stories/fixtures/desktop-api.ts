import type { ChapterText } from '@dreamer/shared/models/novel';
import type { ChapterRequest } from '@dreamer/shared/models/novel';
import type { ChapterChangeRequest } from '@dreamer/shared/models/novel';
import type { SearchHit } from '@dreamer/shared/models/novel';
import type { SearchProgress } from '@dreamer/shared/models/novel';
import type { SearchRequest } from '@dreamer/shared/models/novel';
import { findTextMatches } from '@dreamer/shared/core/text-match';
import { applyChapterChange } from '@dreamer/shared/core/chapter-changes';
import type { ChapterFile } from '@dreamer/shared/core/chapter-changes';
import type { ChapterTexts } from '@dreamer/shared/core/chapter-changes';
import { chapterStats } from '@dreamer/shared/core/novel-text';
import { contentHash } from '@dreamer/shared/core/novel-text';
import type { NovelChapterEntry } from '@dreamer/shared/models/novel-store';
import type { TextMatch } from '@dreamer/shared/core/text-match';
import { CodedError } from '@dreamer/shared/errors/app-error';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { LibraryNovel } from '../../src/features/library/library.models';
import type { LibraryChapter } from '../../src/features/library/library.models';
import type { NovelChapter } from '@dreamer/shared/models/novel';
import { toNovelSummary } from './library';
import { CHAPTER_PARAGRAPHS } from './library';
import { makeChapters } from './library';
import { NO_CHAPTERS_NOVEL } from './library';
import { NOVELS } from './library';
import { SAMPLE_PARAGRAPHS } from './library';
import type { DeleteNovelsResult, NovelDetail, NovelPatch, NovelSummary } from '@dreamer/shared/models/novel';
import type { PickedImage } from '@dreamer/shared/models/novel-package';
import type { Provider } from '@angular/core';
import { LLM_CLI_IDS, LLM_CLIS } from '@dreamer/shared/models/llm';
import type { LlmCliId, LlmCliStatus, LlmPathRequest, LlmTestResult } from '@dreamer/shared/models/llm';
import type { ValueProvider } from '@angular/core';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendState, BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppDataCandidate, AppDataStatus } from '@dreamer/shared/models/app-data';
import type { CheckResult, DiagnosticsRun } from '@dreamer/shared/models/diagnostics';
import { defaultSettings } from '@dreamer/shared/models/settings';
import type { AppSettings, SettingsPatch, SettingsSection, SettingsState } from '@dreamer/shared/models/settings';
import { DesktopApi } from '@core/desktop-api';

export interface DesktopApiFixture {
  info?: AppInfo | 'error' | 'loading';
  backend?: BackendState;
  openDataDirFails?: boolean;
  diagnostics?: DiagnosticsScenario;
}

export interface ReaderApiFixture {
  missingChapter: number | null;
  lock: boolean;
  searchDelay?: number;
}

export function provideReaderDesktopApi(fixture: ReaderApiFixture): Provider {
  const novels: LibraryNovel[] = [...NOVELS, NO_CHAPTERS_NOVEL];
  const chaptersByNovel: Map<string, NovelChapter[]> = new Map();
  const textByFile: Map<string, string[]> = new Map();
  const originalCharsByNovel: Map<string, number> = new Map();
  const updatedAtByNovel: Map<string, string> = new Map();
  let progressListener: ((progress: SearchProgress) => void) | null = null;
  let activeSearchId: string | null = null;
  const chaptersFor = (novel: LibraryNovel): NovelChapter[] => {
    let chapters: NovelChapter[] | undefined = chaptersByNovel.get(novel.id);
    if (!chapters) {
      chapters = makeChapters(novel).map((chapter: LibraryChapter): NovelChapter => {
        textByFile.set(`${novel.id}:${chapter.file}`, CHAPTER_PARAGRAPHS[chapter.id] ?? SAMPLE_PARAGRAPHS);
        return {
          position: chapter.position,
          title: chapter.title,
          file: chapter.file,
          paragraphs: chapter.paragraphCount,
          chars: chapter.chars,
        };
      });
      chaptersByNovel.set(novel.id, chapters);
      originalCharsByNovel.set(
        novel.id,
        chapters.reduce((sum: number, chapter: NovelChapter): number => sum + chapter.chars, 0),
      );
    }
    return chapters;
  };
  const storeText = async (novelId: string, paragraphs: string[]): Promise<ChapterFile> => {
    const text: string = paragraphs.join('\n');
    const file: string = await contentHash(text);
    textByFile.set(`${novelId}:${file}`, paragraphs);
    return { file, ...chapterStats(text) };
  };
  const api: Partial<DesktopApi> = {
    onSearchProgress: (listener: (progress: SearchProgress) => void): (() => void) => {
      progressListener = listener;
      return (): void => {
        progressListener = null;
      };
    },
    cancelSearch: async (searchId: string): Promise<void> => {
      if (activeSearchId === searchId) activeSearchId = null;
    },
    search: async (request: SearchRequest): Promise<void> => {
      activeSearchId = request.searchId;
      const novel: LibraryNovel | undefined = novels.find((item: LibraryNovel): boolean => item.id === request.novelId);
      const chapters: NovelChapter[] = novel ? chaptersFor(novel).slice(0, 3) : [];
      const hits: SearchHit[] = chapters.flatMap((chapter: NovelChapter): SearchHit[] => {
        const texts: string[] = [
          chapter.title,
          ...(textByFile.get(`${request.novelId}:${chapter.file}`) ?? SAMPLE_PARAGRAPHS),
        ];
        return texts.flatMap((text: string, index: number): SearchHit[] => {
          const characters: string[] = Array.from(text);
          return findTextMatches(text, request.query).map((match: TextMatch): SearchHit => ({
            position: chapter.position,
            file: chapter.file,
            paragraph: index === 0 ? null : index - 1,
            pre: characters.slice(Math.max(0, match.start - 40), match.start).join(''),
            hit: characters.slice(match.start, match.end).join(''),
            post: characters.slice(match.end, match.end + 40).join(''),
          }));
        });
      });
      setTimeout((): void => {
        if (activeSearchId !== request.searchId) return;
        progressListener?.({
          searchId: request.searchId,
          done: chapters.length,
          total: chapters.length,
          hits,
          totalHits: hits.length,
          totalChapters: new Set(hits.map((hit: SearchHit): number => hit.position)).size,
          finished: true,
        });
        activeSearchId = null;
      }, fixture.searchDelay ?? 120);
    },
    onLibraryChanged: (): (() => void) => () => undefined,
    onPipelineUpdate: (): (() => void) => () => undefined,
    getNovel: async (id: string): Promise<NovelDetail | null> => {
      if (id === 'n-broken')
        throw new CodedError(ErrorCode.NovelMetadataInvalid, 'The novel metadata could not be read');
      const novel: LibraryNovel | undefined = novels.find((item: LibraryNovel): boolean => item.id === id);
      if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${id} was not found`);
      const chapters: NovelChapter[] = chaptersFor(novel);
      return {
        ...toNovelSummary(novel),
        chapterCount: chapters.length,
        charCount:
          toNovelSummary(novel).charCount -
          (originalCharsByNovel.get(id) ?? 0) +
          chapters.reduce((sum: number, chapter: NovelChapter): number => sum + chapter.chars, 0),
        updatedAt: updatedAtByNovel.get(id) ?? novel.updatedAt,
        description: novel.description,
        chapters: chapters.map((chapter: NovelChapter): NovelChapter => ({ ...chapter })),
        lock: fixture.lock
          ? { runId: 'run-story-export', type: 'novel-export', label: novel.originalTitle, status: 'running' }
          : null,
      };
    },
    getChapter: async (request: ChapterRequest): Promise<ChapterText | null> => {
      const position: number = parseInt(request.file, 16);
      if (position === fixture.missingChapter) {
        throw new CodedError(ErrorCode.ChapterFileMissing, `Chapter ${position} is missing`);
      }
      return { paragraphs: textByFile.get(`${request.novelId}:${request.file}`) ?? SAMPLE_PARAGRAPHS };
    },
    changeChapters: async (request: ChapterChangeRequest): Promise<NovelDetail | null> => {
      const novel: LibraryNovel | undefined = novels.find((item: LibraryNovel): boolean => item.id === request.novelId);
      if (!novel) throw new CodedError(ErrorCode.NovelNotFound, `Novel ${request.novelId} was not found`);
      if (fixture.lock) throw new CodedError(ErrorCode.NovelLocked, 'Novel is busy');
      const texts: ChapterTexts = {
        read: async (file: string): Promise<string[]> =>
          textByFile.get(`${request.novelId}:${file}`) ?? SAMPLE_PARAGRAPHS,
        write: (paragraphs: string[]): Promise<ChapterFile> => storeText(request.novelId, paragraphs),
      };
      const next: NovelChapterEntry[] = await applyChapterChange(chaptersFor(novel), request.change, texts);
      chaptersByNovel.set(
        request.novelId,
        next.map((chapter: NovelChapterEntry, index: number): NovelChapter => ({ ...chapter, position: index + 1 })),
      );
      updatedAtByNovel.set(request.novelId, new Date().toISOString());
      return api.getNovel!(request.novelId);
    },
  };
  const base: ValueProvider = provideDesktopApi() as ValueProvider;
  return { provide: DesktopApi, useValue: { ...(base.useValue as Partial<DesktopApi>), ...api } };
}

export type DiagnosticsScenario = 'ok' | 'issues' | 'engineError';

const SCHEMA_VERSION = '0.0.0_1';
const BACKEND_ADDRESS = '127.0.0.1:47123';
const DIAGNOSTICS_RUN_MS = 900;
const GB = 1024 ** 3;

export const APP_INFO: AppInfo = {
  version: '0.0.0',
  buildDate: '2026-10-19',
  author: 'datntdev',
  appDataDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  settingsDir: 'C:\\Users\\me\\AppData\\Local\\DreamerStudio',
  electron: '44.9.0',
  chrome: '150.0.7800.45',
  node: '24.11.0',
  os: 'Windows 10.0.19045 (x64)',
  schemaVersion: SCHEMA_VERSION,
};

export function fakeBackendStatus(state: BackendState = 'running'): BackendStatus {
  return { state, address: state === 'running' ? BACKEND_ADDRESS : null };
}

export const APP_DATA_STATUS: AppDataStatus = {
  path: APP_INFO.appDataDir,
  freeBytes: 412 * 1024 ** 3,
  writable: true,
  schemaVersion: SCHEMA_VERSION,
  checkedAt: '2026-01-01T00:00:00.000Z',
};

function check(id: string, category: CheckResult['category'], status: CheckResult['status'], params = {}): CheckResult {
  const prefix = `diagnostics.check.${id}`;
  return {
    id,
    category,
    status,
    nameKey: `${prefix}.name`,
    messageKey: `${prefix}.${status}`,
    fixKey: status === 'ok' ? null : `${prefix}.fix`,
    params,
    durationMs: 12,
  };
}

export function fakeDiagnosticsRun(scenario: DiagnosticsScenario = 'issues'): DiagnosticsRun {
  const issues = scenario === 'issues';
  return {
    ranAt: new Date().toISOString(),
    results: [
      check('storage.appData', 'storage', 'ok', { path: APP_INFO.appDataDir }),
      check('storage.settingsDir', 'storage', 'ok', { path: APP_INFO.appDataDir }),
      check('storage.diskSpace', 'storage', issues ? 'warning' : 'ok', {
        drive: 'C:',
        free: issues ? 0.8 * GB : 214 * GB,
      }),
      check('database.integrity', 'database', 'ok'),
      check('backend.reachable', 'backend', issues ? 'error' : 'ok'),
      check('settings.file', 'settings', 'ok'),
    ],
  };
}

function fakeRunDiagnostics(scenario: DiagnosticsScenario): Promise<DiagnosticsRun | null> {
  return new Promise<DiagnosticsRun | null>((resolve, reject) =>
    setTimeout(() => {
      if (scenario === 'engineError') reject(new Error('diagnostics:run failed: APP_DATA_SWITCHING'));
      else resolve(fakeDiagnosticsRun(scenario));
    }, DIAGNOSTICS_RUN_MS),
  );
}

export type FakeSettingsApi = Pick<DesktopApi, 'settings' | 'updateSettings' | 'resetSettings' | 'onSettingsChanged'>;

export function fakeSettingsApi(): FakeSettingsApi {
  let current: AppSettings = defaultSettings(APP_INFO.appDataDir);
  return {
    settings: (): Promise<SettingsState | null> =>
      Promise.resolve({ settings: current, defaultAppDataDir: APP_INFO.appDataDir, notice: 'none' }),
    updateSettings: (patch: SettingsPatch): Promise<AppSettings | null> => {
      current = { ...current, ...patch };
      return Promise.resolve(current);
    },
    resetSettings: (section: SettingsSection): Promise<AppSettings | null> => {
      const defaults: AppSettings = defaultSettings(APP_INFO.appDataDir);
      current =
        section === 'general'
          ? { ...current, language: defaults.language, theme: defaults.theme }
          : section === 'reading'
            ? { ...current, reading: defaults.reading }
            : { ...current, pipelines: defaults.pipelines };
      return Promise.resolve(current);
    },
    onSettingsChanged: (): (() => void) => () => undefined,
  };
}

export function provideDesktopApi(fixture: DesktopApiFixture = {}): Provider {
  const info: AppInfo | 'error' | 'loading' = fixture.info ?? APP_INFO;
  const api: Partial<DesktopApi> = {
    info: (): Promise<AppInfo | null> => {
      if (info === 'loading') return new Promise<AppInfo | null>(() => undefined);
      if (info === 'error') return Promise.reject(new Error('app:info failed: IPC channel closed'));
      return Promise.resolve(info);
    },
    openLogs: (): Promise<void> => Promise.resolve(),
    openDataDir: (): Promise<void> =>
      fixture.openDataDirFails
        ? Promise.reject(new Error(`Cannot open folder ${APP_INFO.appDataDir}`))
        : Promise.resolve(),
    openLink: (): Promise<void> => Promise.resolve(),
    onError: (): (() => void) => () => undefined,
    onBackendStatus: (listener: (status: BackendStatus) => void): (() => void) => {
      listener(fakeBackendStatus(fixture.backend));
      return () => undefined;
    },
    backendStatus: (): Promise<BackendStatus | null> => Promise.resolve(fakeBackendStatus(fixture.backend)),
    writeLog: (): void => undefined,
    pickAppDataFolder: (): Promise<string | null> => Promise.resolve(null),
    inspectAppData: (): Promise<AppDataCandidate | null> => Promise.resolve(null),
    switchAppData: (): Promise<AppInfo | null> => Promise.resolve(null),
    appDataStatus: (): Promise<AppDataStatus | null> => Promise.resolve(APP_DATA_STATUS),
    onAppDataProgress: (): (() => void) => () => undefined,
    onAppDataChanged: (): (() => void) => () => undefined,
    runDiagnostics: (): Promise<DiagnosticsRun | null> => fakeRunDiagnostics(fixture.diagnostics ?? 'issues'),
    listNovels: (): Promise<NovelSummary[]> => Promise.resolve([]),
    getNovel: (): Promise<NovelDetail | null> => Promise.resolve(null),
    getChapter: (): Promise<ChapterText | null> =>
      Promise.resolve({ paragraphs: ['Sample paragraph one.', 'Sample paragraph two.'] }),
    search: (): Promise<void> => Promise.resolve(),
    cancelSearch: (): Promise<void> => Promise.resolve(),
    onSearchProgress: (): (() => void) => () => undefined,
    updateNovel: (id: string, patch: NovelPatch): Promise<NovelDetail | null> => {
      void id;
      void patch;
      return Promise.resolve(null);
    },
    changeChapters: (): Promise<NovelDetail | null> => Promise.resolve(null),
    deleteNovels: (): Promise<DeleteNovelsResult | null> => Promise.resolve({ deleted: [], skipped: [] }),
    pickImage: (): Promise<PickedImage | null> => Promise.resolve(null),
    openNovelFolder: (): Promise<void> => Promise.resolve(),
    onLibraryChanged: (): (() => void) => () => undefined,
    ...fakeSettingsApi(),
  };
  return { provide: DesktopApi, useValue: api };
}

export type LlmScenario = 'mixed' | 'none';

export type FakeLlmApi = Pick<
  DesktopApi,
  'llmStatus' | 'detectLlm' | 'testLlm' | 'pickLlmPath' | 'setLlmPath' | 'onLlmChanged' | 'writeLog'
> & {
  setScenario(scenario: LlmScenario): void;
};

const LLM_DELAY_MS = 180;

function llmStatuses(scenario: LlmScenario): LlmCliStatus[] {
  const mixed: Record<LlmCliId, LlmCliStatus> = {
    claude: {
      id: 'claude',
      state: 'installed',
      version: '2.4.1',
      path: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd',
      customPath: false,
    },
    codex: { id: 'codex', state: 'notInstalled', version: null, path: null, customPath: false },
    antigravity: {
      id: 'antigravity',
      state: 'installed',
      version: '1.1.8',
      path: 'D:\\Tools\\antigravity\\agy.exe',
      customPath: true,
    },
  };
  return LLM_CLI_IDS.map((id: LlmCliId): LlmCliStatus =>
    scenario === 'none' ? { id, state: 'notInstalled', version: null, path: null, customPath: false } : mixed[id],
  );
}

function llmDelay<T>(value: T): Promise<T> {
  return new Promise<T>((resolve): void => {
    setTimeout((): void => resolve(value), LLM_DELAY_MS);
  });
}

export function fakeLlmApi(scenario: LlmScenario): FakeLlmApi {
  let current: LlmCliStatus[] = llmStatuses(scenario);
  let listener: ((statuses: LlmCliStatus[]) => void) | null = null;
  const publish = (statuses: LlmCliStatus[]): void => {
    current = statuses;
    listener?.(current);
  };
  return {
    writeLog: (): void => undefined,
    setScenario: (next: LlmScenario): void => {
      scenario = next;
      publish(llmStatuses(next));
    },
    llmStatus: (): Promise<LlmCliStatus[] | null> => llmDelay(current),
    detectLlm: async (): Promise<LlmCliStatus[] | null> => {
      const statuses: LlmCliStatus[] = await llmDelay(current);
      publish(statuses);
      return statuses;
    },
    testLlm: async (cli: LlmCliId): Promise<LlmTestResult | null> => {
      await llmDelay(null);
      return cli === 'antigravity'
        ? {
            ok: false,
            durationMs: 900,
            error: { code: ErrorCode.LlmNotSignedIn, message: 'Sign-in required' },
          }
        : { ok: true, durationMs: cli === 'claude' ? 4200 : 5600, error: null };
    },
    pickLlmPath: (cli: LlmCliId): Promise<string | null> =>
      llmDelay(`C:\\Users\\me\\AppData\\Roaming\\npm\\${LLM_CLIS[cli].executable}.cmd`),
    setLlmPath: async (request: LlmPathRequest): Promise<LlmCliStatus | null> => {
      await llmDelay(null);
      const path: string | null = request.path;
      const executable: string = LLM_CLIS[request.cli].executable;
      const file: string = path?.split(/[\\/]/).pop() ?? '';
      if (path && !new RegExp(`^${executable}(\\.exe|\\.cmd)?$`, 'i').test(file)) {
        throw new CodedError(ErrorCode.LlmPathInvalid, 'Wrong CLI executable');
      }
      const status: LlmCliStatus = path
        ? { id: request.cli, state: 'installed', version: '1.0.0', path, customPath: true }
        : request.cli === 'antigravity'
          ? { id: request.cli, state: 'notInstalled', version: null, path: null, customPath: false }
          : llmStatuses(scenario).find((item: LlmCliStatus): boolean => item.id === request.cli)!;
      publish(current.map((item: LlmCliStatus): LlmCliStatus => (item.id === request.cli ? status : item)));
      return status;
    },
    onLlmChanged: (callback: (statuses: LlmCliStatus[]) => void): (() => void) => {
      listener = callback;
      return (): void => {
        if (listener === callback) listener = null;
      };
    },
  };
}
