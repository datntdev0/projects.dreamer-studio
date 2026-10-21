import { Injectable, inject, signal } from '@angular/core';
import type { BackendState, BackendStatus as BackendStatusEvent } from '@dreamer/shared/ipc/backend';
import { DesktopApi } from './desktop-api';

@Injectable({ providedIn: 'root' })
export class BackendStatus {
  readonly state = signal<BackendState>('starting');
  readonly address = signal<string | null>(null);

  constructor() {
    const api: DesktopApi = inject(DesktopApi);
    let pushed: boolean = false;
    api.onBackendStatus((status: BackendStatusEvent) => {
      pushed = true;
      this.apply(status);
    });
    void api.backendStatus().then((status: BackendStatusEvent | null) => {
      if (status && !pushed) this.apply(status);
    });
  }

  private apply(status: BackendStatusEvent): void {
    this.state.set(status.state);
    this.address.set(status.address);
  }
}
