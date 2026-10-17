import { Injectable, inject, signal } from '@angular/core';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { DesktopApi } from './desktop-api';

@Injectable({ providedIn: 'root' })
export class BackendStatus {
  readonly state = signal<BackendState>('starting');

  constructor() {
    inject(DesktopApi).onBackendStatus((status) => this.state.set(status.state));
  }
}
