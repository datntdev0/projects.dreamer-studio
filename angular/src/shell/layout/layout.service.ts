import { Injectable, signal } from '@angular/core';
import type { SplitterEdge } from '@components/splitter/splitter.directive';
import type { PanelDirective } from './panel.directive';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly panels = signal<Partial<Record<SplitterEdge, PanelDirective>>>({});
  private readonly closed = signal<ReadonlySet<SplitterEdge>>(new Set());

  register(panel: PanelDirective): void {
    this.panels.update((panels) => ({ ...panels, [panel.edge()]: panel }));
  }

  unregister(panel: PanelDirective): void {
    this.panels.update((panels) => {
      if (panels[panel.edge()] !== panel) return panels;
      const next = { ...panels };
      delete next[panel.edge()];
      return next;
    });
  }

  has(edge: SplitterEdge): boolean {
    return this.panels()[edge] !== undefined;
  }

  isOpen(edge: SplitterEdge): boolean {
    return !this.closed().has(edge);
  }

  toggle(edge: SplitterEdge): void {
    this.closed.update((closed) => {
      const next = new Set(closed);
      if (next.has(edge)) next.delete(edge);
      else next.add(edge);
      return next;
    });
  }

  visible(edge: SplitterEdge): PanelDirective | null {
    return this.isOpen(edge) ? (this.panels()[edge] ?? null) : null;
  }
}
