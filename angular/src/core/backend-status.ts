import { Injectable, inject, signal } from '@angular/core';
import type { BackendState, BackendStatus as BackendStatusEvent } from '@dreamer/shared/ipc/backend';
import { DesktopApi } from './desktop-api';

@Injectable({ providedIn: 'root' })
export class BackendStatus {
  readonly state = signal<BackendState>('starting');

  constructor() {
    const api: DesktopApi = inject(DesktopApi);
    let pushed: boolean = false;
    api.onBackendStatus((status: BackendStatusEvent) => {
      pushed = true;
      this.state.set(status.state);
    });
    void api.backendStatus().then((status: BackendStatusEvent | null) => {
      if (status && !pushed) this.state.set(status.state);
    });
  }
}
