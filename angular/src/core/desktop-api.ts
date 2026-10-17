import { Injectable } from '@angular/core';
import '@dreamer/shared/ipc/dreamer-api';
import type { AppInfo } from '@dreamer/shared/ipc/app';

@Injectable({ providedIn: 'root' })
export class DesktopApi {
  async info(): Promise<AppInfo | null> {
    return window.dreamer ? window.dreamer.app.info() : null;
  }
}
