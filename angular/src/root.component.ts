import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { errorCopy, errorText } from '@dreamer/shared/errors/error-copy';
import { BannerComponent } from '@components/banner/banner.component';
import type { BannerVariant } from '@components/banner/banner.component';
import { BackendStatus } from './core/backend-status';
import { DesktopApi } from './core/desktop-api';
import { ErrorStore } from './core/error-store';
import type { ErrorEntry } from './core/error-store';

interface ErrorBanner extends ErrorEntry {
  variant: BannerVariant;
  dismissible: boolean;
  testId: string;
}

@Component({
  selector: 'ds-root',
  imports: [BannerComponent],
  templateUrl: './root.component.html',
})
export class RootComponent implements OnInit {
  protected readonly desktopApi: DesktopApi = inject(DesktopApi);
  protected readonly errorStore: ErrorStore = inject(ErrorStore);
  protected readonly backendStatus: BackendStatus = inject(BackendStatus);
  protected readonly copy = errorCopy;
  protected readonly text = errorText;
  readonly version = signal<string>('…');

  protected readonly errorBanners = computed<ErrorBanner[]>(() => {
    const errors = this.errorStore
      .errors()
      .map((entry): ErrorBanner => ({ ...entry, variant: 'danger', dismissible: true, testId: 'error-banner' }));
    if (this.backendStatus.state() !== 'unavailable') return errors;
    const backend: ErrorBanner = {
      code: ErrorCode.BackendUnavailable,
      count: 1,
      variant: 'warning',
      dismissible: false,
      testId: 'backend-banner',
    };
    return [backend, ...errors];
  });

  async ngOnInit(): Promise<void> {
    const info = await this.desktopApi.info();
    if (info) this.version.set(info.version);
  }

  protected codeLine(banner: ErrorBanner): string {
    return `${errorText.code}: ${banner.code}${banner.count > 1 ? ` (×${banner.count})` : ''}`;
  }
}
