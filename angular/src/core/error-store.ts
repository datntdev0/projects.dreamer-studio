import { Injectable, inject, signal } from '@angular/core';
import type { ErrorCode } from '@dreamer/shared/errors/app-error';
import { DesktopApi } from './desktop-api';

export interface ErrorEntry {
  code: ErrorCode;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class ErrorStore {
  readonly errors = signal<ErrorEntry[]>([]);

  constructor() {
    inject(DesktopApi).onError((error) => this.add(error.code));
  }

  add(code: ErrorCode): void {
    this.errors.update((errors) =>
      errors.some((entry) => entry.code === code)
        ? errors.map((entry) => (entry.code === code ? { code, count: entry.count + 1 } : entry))
        : [...errors, { code, count: 1 }],
    );
  }

  dismiss(code: ErrorCode): void {
    this.errors.update((errors) => errors.filter((entry) => entry.code !== code));
  }
}
