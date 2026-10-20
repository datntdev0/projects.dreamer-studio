import { Injectable, inject, signal } from '@angular/core';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import { DesktopApi } from './desktop-api';

export type AppInfoState = 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class AppInfoStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  readonly state = signal<AppInfoState>('loading');
  readonly info = signal<AppInfo | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
    this.desktopApi.onAppDataChanged((info) => this.info.set(info));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.info.set(await this.desktopApi.info());
      this.state.set('ready');
    } catch (error: unknown) {
      this.error.set(String(error));
      this.state.set('error');
    }
  }
}
