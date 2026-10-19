import { Injectable } from '@angular/core';
import '@dreamer/shared/ipc/dreamer-api';
import type { BackendStatus } from '@dreamer/shared/ipc/backend';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { AppError } from '@dreamer/shared/errors/app-error';
import type { LogEntry } from '@dreamer/shared/ipc/log';
import type { Language } from '@dreamer/shared/i18n/translate';
import type { PipelineListQuery, PipelineLogChunk, PipelinePage } from '@dreamer/shared/models/pipeline';
import type { PipelineRun, PipelineStartRequest, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';

const EMPTY_PAGE: PipelinePage = { runs: [], total: 0, next: null };

@Injectable({ providedIn: 'root' })
export class DesktopApi {
  async info(): Promise<AppInfo | null> {
    return window.dreamer ? window.dreamer.app.info() : null;
  }

  async openLogs(): Promise<void> {
    if (window.dreamer) await window.dreamer.app.openLogs();
  }

  async openDataDir(): Promise<void> {
    if (window.dreamer) await window.dreamer.app.openDataDir();
  }

  onError(listener: (error: AppError) => void): () => void {
    return window.dreamer ? window.dreamer.app.onError(listener) : () => undefined;
  }

  onBackendStatus(listener: (status: BackendStatus) => void): () => void {
    return window.dreamer ? window.dreamer.backend.onStatus(listener) : () => undefined;
  }

  async backendStatus(): Promise<BackendStatus | null> {
    return window.dreamer ? window.dreamer.backend.status() : null;
  }

  setLanguage(language: Language): void {
    if (window.dreamer) window.dreamer.app.setLanguage(language);
  }

  writeLog(entry: LogEntry): void {
    if (window.dreamer) window.dreamer.log.write(entry);
  }

  async pipelineTypes(): Promise<PipelineTypeInfo[]> {
    return window.dreamer ? window.dreamer.pipeline.types() : [];
  }

  async startPipeline(request: PipelineStartRequest): Promise<PipelineRun | null> {
    return window.dreamer ? window.dreamer.pipeline.start(request) : null;
  }

  async cancelPipeline(id: string): Promise<void> {
    if (window.dreamer) await window.dreamer.pipeline.cancel(id);
  }

  async listPipelines(query: PipelineListQuery): Promise<PipelinePage> {
    return window.dreamer ? window.dreamer.pipeline.list(query) : EMPTY_PAGE;
  }

  async getPipeline(id: string): Promise<PipelineRun | null> {
    return window.dreamer ? window.dreamer.pipeline.get(id) : null;
  }

  async pipelineLog(id: string): Promise<string[]> {
    return window.dreamer ? window.dreamer.pipeline.log(id) : [];
  }

  async deletePipelines(ids: string[]): Promise<string[]> {
    return window.dreamer ? window.dreamer.pipeline.delete(ids) : [];
  }

  onPipelineDeleted(listener: (ids: string[]) => void): () => void {
    return window.dreamer ? window.dreamer.pipeline.onDeleted(listener) : () => undefined;
  }

  onPipelineUpdate(listener: (run: PipelineRun) => void): () => void {
    return window.dreamer ? window.dreamer.pipeline.onUpdate(listener) : () => undefined;
  }

  onPipelineLog(listener: (chunk: PipelineLogChunk) => void): () => void {
    return window.dreamer ? window.dreamer.pipeline.onLog(listener) : () => undefined;
  }
}
