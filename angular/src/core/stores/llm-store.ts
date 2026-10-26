import { inject, Injectable, signal } from '@angular/core';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { LlmCliId, LlmCliStatus, LlmTestResult } from '@dreamer/shared/models/llm';
import { DesktopApi } from '@core/desktop-api';

interface CliTest {
  running: boolean;
  result: LlmTestResult | null;
}

@Injectable({ providedIn: 'root' })
export class LlmStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private unsubscribe: (() => void) | null = null;
  private readonly testVersions: Partial<Record<LlmCliId, number>> = {};

  readonly statuses = signal<LlmCliStatus[] | null>(null);
  readonly detecting = signal<boolean>(false);
  readonly tests = signal<Partial<Record<LlmCliId, CliTest>>>({});

  async load(): Promise<void> {
    this.unsubscribe ??= this.desktopApi.onLlmChanged((statuses: LlmCliStatus[]): void => this.accept(statuses));
    if (this.statuses() !== null) return;
    this.detecting.set(true);
    try {
      const statuses: LlmCliStatus[] | null = await this.desktopApi.llmStatus();
      if (statuses) this.accept(statuses);
    } catch (error) {
      this.log(error);
    } finally {
      this.detecting.set(false);
    }
  }

  async detect(): Promise<void> {
    if (this.detecting()) return;
    this.detecting.set(true);
    try {
      const statuses: LlmCliStatus[] | null = await this.desktopApi.detectLlm();
      if (statuses) this.accept(statuses);
    } catch (error) {
      this.log(error);
    } finally {
      this.detecting.set(false);
    }
  }

  async test(cli: LlmCliId): Promise<void> {
    if (this.detecting() || this.tests()[cli]?.running) return;
    const version: number = (this.testVersions[cli] ?? 0) + 1;
    this.testVersions[cli] = version;
    this.tests.update((tests) => ({ ...tests, [cli]: { running: true, result: null } }));
    try {
      const result: LlmTestResult | null = await this.desktopApi.testLlm(cli);
      if (this.testVersions[cli] !== version) return;
      this.tests.update((tests) => ({ ...tests, [cli]: { running: false, result } }));
    } catch (error) {
      if (this.testVersions[cli] !== version) return;
      if (isAppError(error) && this.expected(error.code)) {
        this.tests.update((tests) => ({
          ...tests,
          [cli]: { running: false, result: { ok: false, durationMs: 0, error } },
        }));
      } else {
        this.log(error);
        this.tests.update((tests) => ({ ...tests, [cli]: { running: false, result: null } }));
      }
    }
  }

  async pickPath(cli: LlmCliId): Promise<string | null> {
    try {
      return await this.desktopApi.pickLlmPath(cli);
    } catch (error) {
      this.log(error);
      return null;
    }
  }

  async setPath(cli: LlmCliId, path: string | null): Promise<LlmCliStatus | null> {
    try {
      const status: LlmCliStatus | null = await this.desktopApi.setLlmPath({ cli, path });
      if (status) this.accept([...(this.statuses() ?? []).filter((item) => item.id !== cli), status]);
      return status;
    } catch (error) {
      if (!isAppError(error) || error.code !== ErrorCode.LlmPathInvalid) this.log(error);
      throw error;
    }
  }

  private accept(statuses: LlmCliStatus[]): void {
    const previous: LlmCliStatus[] = this.statuses() ?? [];
    this.tests.update((tests) => {
      const next: Partial<Record<LlmCliId, CliTest>> = { ...tests };
      for (const status of statuses) {
        const old: LlmCliStatus | undefined = previous.find((item) => item.id === status.id);
        if (
          old &&
          (old.path !== status.path || old.version !== status.version || old.customPath !== status.customPath)
        ) {
          this.testVersions[status.id] = (this.testVersions[status.id] ?? 0) + 1;
          delete next[status.id];
        }
      }
      return next;
    });
    this.statuses.set(statuses);
  }

  private expected(code: string): boolean {
    return (
      code === ErrorCode.LlmNotSignedIn ||
      code === ErrorCode.LlmTimeout ||
      code === ErrorCode.LlmCliFailed ||
      code === ErrorCode.LlmBadOutput
    );
  }

  private log(error: unknown): void {
    this.desktopApi.writeLog({ level: 'error', module: 'llm', message: errorMessage(error) });
  }
}
