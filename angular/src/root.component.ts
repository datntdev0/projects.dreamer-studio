import { Component, OnInit, inject, signal } from '@angular/core';
import { ErrorBannerComponent } from './components/error-banner.component';
import { BackendStatus } from './core/backend-status';
import { DesktopApi } from './core/desktop-api';
import { ErrorStore } from './core/error-store';

@Component({
  selector: 'ns-root',
  imports: [ErrorBannerComponent],
  template: `
    @if (errorStore.errors().length > 0 || backendStatus.state() === 'unavailable') {
      <div class="banners">
        @if (backendStatus.state() === 'unavailable') {
          <div data-testid="backend-banner">
            <ns-error-banner
              code="BACKEND_UNAVAILABLE"
              variant="warning"
              [dismissible]="false"
              (openLogs)="desktopApi.openLogs()"
            />
          </div>
        }
        @for (entry of errorStore.errors(); track entry.code) {
          <ns-error-banner
            [code]="entry.code"
            [count]="entry.count"
            (openLogs)="desktopApi.openLogs()"
            (dismiss)="errorStore.dismiss(entry.code)"
          />
        }
      </div>
    }
    <main class="empty" data-testid="app-empty">
      <h1 data-testid="app-name">Dreamer Studio</h1>
      <p class="meta num" data-testid="app-version">Version {{ version() }}</p>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
      background: var(--color-background);
    }
    .banners {
      display: flex;
      flex-direction: column;
      gap: var(--sp-sm);
      padding: var(--sp-md);
    }
    .empty {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-sm);
    }
    h1,
    p {
      margin: 0;
    }
  `,
})
export class RootComponent implements OnInit {
  protected readonly desktopApi: DesktopApi = inject(DesktopApi);
  protected readonly errorStore: ErrorStore = inject(ErrorStore);
  protected readonly backendStatus: BackendStatus = inject(BackendStatus);
  readonly version = signal<string>('…');

  async ngOnInit(): Promise<void> {
    const info = await this.desktopApi.info();
    if (info) this.version.set(info.version);
  }
}
