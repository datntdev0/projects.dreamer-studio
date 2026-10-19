import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'danger' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastOptions {
  kind: ToastKind;
  title: string;
  message?: string;
  action?: ToastAction;
  autoHide?: boolean;
}

export interface Toast extends ToastOptions {
  id: number;
}

const MAX_TOASTS = 3;
const SUCCESS_HIDE_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(options: ToastOptions): number {
    const toast: Toast = { ...options, id: this.nextId++ };
    const kept: Toast[] = [...this.toasts(), toast];
    kept.slice(0, -MAX_TOASTS).forEach((old) => this.clearTimer(old.id));
    this.toasts.set(kept.slice(-MAX_TOASTS));
    if (options.autoHide ?? options.kind === 'success') {
      this.timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), SUCCESS_HIDE_MS),
      );
    }
    return toast.id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toasts().forEach((toast) => this.clearTimer(toast.id));
    this.toasts.set([]);
  }

  private clearTimer(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
