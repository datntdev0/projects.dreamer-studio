import { effect, inject, Injectable, signal } from '@angular/core';
import { AppInfoStore } from '../app-info';

export interface RecentNovelEntry {
  id: string;
  openedAt: string;
}

const STORAGE_PREFIX = 'dreamer.recentNovels.';
const RECENT_LIMIT = 5;

function storageKey(root: string): string {
  return `${STORAGE_PREFIX}${root}`;
}

function read(root: string): RecentNovelEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(root)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is RecentNovelEntry =>
          typeof entry?.id === 'string' &&
          typeof entry?.openedAt === 'string' &&
          Number.isFinite(Date.parse(entry.openedAt)),
      )
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class RecentNovelStore {
  private readonly appInfo = inject(AppInfoStore);
  readonly entries = signal<RecentNovelEntry[]>([]);

  constructor() {
    effect(() => {
      const root = this.appInfo.info()?.appDataDir;
      this.entries.set(root ? read(root) : []);
    });
  }

  record(id: string): void {
    const root = this.appInfo.info()?.appDataDir;
    if (!root) return;
    const next = [{ id, openedAt: new Date().toISOString() }, ...read(root).filter((entry) => entry.id !== id)].slice(
      0,
      RECENT_LIMIT,
    );
    this.entries.set(next);
    try {
      localStorage.setItem(storageKey(root), JSON.stringify(next));
    } catch {
      // The current session can still show its recent novels.
    }
  }
}
