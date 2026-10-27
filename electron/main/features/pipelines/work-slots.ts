import { abortError } from './pipeline-definition';

interface Waiter {
  start: () => void;
}

export class WorkSlots {
  private busy: number = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly limit: () => number) {}

  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.busy--;
      this.limitChanged();
    }
  }

  limitChanged(): void {
    while (this.waiters.length > 0 && this.busy < this.limit()) {
      this.busy++;
      this.waiters.shift()!.start();
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(abortError());
    if (this.waiters.length === 0 && this.busy < this.limit()) {
      this.busy++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(abortError());
      };
      const waiter: Waiter = {
        start: (): void => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      this.waiters.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
