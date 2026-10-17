import { Component, OnInit, inject, signal } from '@angular/core';
import { DesktopApi } from './core/desktop-api';

@Component({
  selector: 'ns-root',
  template: `
    <main class="empty" data-testid="app-empty">
      <h1 data-testid="app-name">Dreamer Studio</h1>
      <p class="meta num" data-testid="app-version">Version {{ version() }}</p>
    </main>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-sm);
      width: 100vw;
      height: 100vh;
      background: var(--color-background);
    }
    h1,
    p {
      margin: 0;
    }
  `,
})
export class RootComponent implements OnInit {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  readonly version = signal<string>('…');

  async ngOnInit(): Promise<void> {
    const info = await this.desktopApi.info();
    if (info) this.version.set(info.version);
  }
}
