import { AppError, CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { LLM_CLI_IDS, LLM_TEST_TIMEOUT_MS, LlmCliId, LlmCliStatus, LlmPathRequest } from '@dreamer/shared/models/llm';
import { LlmRunRequest, LlmRunResult, LlmTestResult } from '@dreamer/shared/models/llm';
import { isAbsolutePath } from '@dreamer/shared/models/validation';
import { AppPaths } from '@storage/paths';
import { createLogger, Logger } from '../../logging/logger';
import { SettingsStore } from '../settings/settings-store';
import { ADAPTERS } from './llm-adapter';
import { checkCliPath, detectCli } from './llm-detector';
import { runLlm } from './llm-runner';

const logger: Logger = createLogger('llm');
const testPrompt: string = 'Reply with the JSON object {"ok": true} and nothing else.';
const testSchema: Record<string, unknown> = {
  type: 'object',
  properties: { ok: { const: true } },
  required: ['ok'],
  additionalProperties: false,
};

interface RunningTest {
  controller: AbortController;
  promise: Promise<LlmTestResult>;
}

export class LlmService {
  private cached: LlmCliStatus[] | null = null;
  private detection: Promise<LlmCliStatus[]> | null = null;
  private readonly tests: Map<LlmCliId, RunningTest> = new Map();
  private readonly listeners: Set<(statuses: LlmCliStatus[]) => void> = new Set();

  constructor(
    private readonly settings: SettingsStore,
    private readonly paths: () => AppPaths,
  ) {}

  startDetection(): void {
    void this.detect().catch((error: unknown): void => logger.error('CLI detection failed', error));
  }

  status(): Promise<LlmCliStatus[]> {
    if (this.detection) return this.detection;
    return this.cached ? Promise.resolve([...this.cached]) : this.detect();
  }

  detect(): Promise<LlmCliStatus[]> {
    if (this.detection) return this.detection;
    const customPaths: Partial<Record<LlmCliId, string>> = { ...this.settings.get().llm.paths };
    const inFlight: Promise<LlmCliStatus[]> = Promise.all(
      LLM_CLI_IDS.map((cli: LlmCliId): Promise<LlmCliStatus> => detectCli(cli, customPaths[cli])),
    )
      .then((statuses: LlmCliStatus[]): LlmCliStatus[] => {
        this.cached = statuses;
        this.emitChanged();
        return [...statuses];
      })
      .finally((): void => {
        this.detection = null;
      });
    this.detection = inFlight;
    return inFlight;
  }

  test(cli: LlmCliId): Promise<LlmTestResult> {
    const running: RunningTest | undefined = this.tests.get(cli);
    if (running) return running.promise;
    const controller: AbortController = new AbortController();
    const started: number = Date.now();
    const promise: Promise<LlmTestResult> = this.executeTest(cli, controller.signal, started).finally((): void => {
      this.tests.delete(cli);
    });
    this.tests.set(cli, { controller, promise });
    return promise;
  }

  private async executeTest(cli: LlmCliId, signal: AbortSignal, started: number): Promise<LlmTestResult> {
    try {
      const request: LlmRunRequest = {
        cli,
        model: null,
        prompt: testPrompt,
        schema: testSchema,
        timeoutMs: LLM_TEST_TIMEOUT_MS,
      };
      const result: LlmRunResult = await this.run(request, { signal });
      return { ok: true, durationMs: result.durationMs, error: null };
    } catch (error) {
      const appError: AppError =
        error instanceof CodedError
          ? { code: error.code, message: error.message, details: error.details }
          : { code: ErrorCode.LlmCliFailed, message: error instanceof Error ? error.message : String(error) };
      return { ok: false, durationMs: Date.now() - started, error: appError };
    }
  }

  async setPath(request: LlmPathRequest): Promise<LlmCliStatus> {
    const { cli, path } = request;
    if (path !== null) {
      if (!isAbsolutePath(path)) throw new CodedError(ErrorCode.LlmPathInvalid, 'CLI path must be absolute', path);
      const version: string | null = await checkCliPath(cli, path);
      if (version === null) throw new CodedError(ErrorCode.LlmPathInvalid, 'CLI path is not valid', path);
      if (this.detection) await this.detection;
      this.settings.setLlmPath(cli, path);
      const status: LlmCliStatus = { id: cli, state: 'installed', version, path, customPath: true };
      this.updateStatus(status);
      return status;
    }
    if (this.detection) await this.detection;
    this.settings.setLlmPath(cli, null);
    const status: LlmCliStatus = await detectCli(cli, undefined);
    this.updateStatus(status);
    return status;
  }

  async run(request: LlmRunRequest, options: { signal?: AbortSignal; log?: Logger } = {}): Promise<LlmRunResult> {
    const statuses: LlmCliStatus[] = await this.status();
    const status: LlmCliStatus | undefined = statuses.find((item: LlmCliStatus): boolean => item.id === request.cli);
    if (status?.state !== 'installed' || status.path === null) {
      throw new CodedError(ErrorCode.LlmCliFailed, `${request.cli} is not installed`);
    }
    return runLlm({
      adapter: ADAPTERS[request.cli],
      path: status.path,
      request,
      cacheDir: this.paths().llmCache,
      signal: options.signal,
      log: options.log,
    });
  }

  onChanged(listener: (statuses: LlmCliStatus[]) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  abortTests(): void {
    this.tests.forEach((running: RunningTest): void => running.controller.abort());
  }

  private updateStatus(status: LlmCliStatus): void {
    const current: LlmCliStatus[] =
      this.cached ??
      LLM_CLI_IDS.map((id: LlmCliId): LlmCliStatus => ({
        id,
        state: 'notInstalled',
        version: null,
        path: null,
        customPath: false,
      }));
    this.cached = current.map((item: LlmCliStatus): LlmCliStatus => (item.id === status.id ? status : item));
    this.emitChanged();
  }

  private emitChanged(): void {
    const statuses: LlmCliStatus[] = [...(this.cached ?? [])];
    this.listeners.forEach((listener: (statuses: LlmCliStatus[]) => void): void => listener(statuses));
  }
}
