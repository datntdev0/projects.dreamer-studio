import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PageCrumbService {
  readonly detail = signal<string | null>(null);
}
