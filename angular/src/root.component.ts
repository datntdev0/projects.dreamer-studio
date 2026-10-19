import { Component, computed, inject } from '@angular/core';
import { errorCopy, errorText } from '@dreamer/shared/errors/error-copy';
import { BannerComponent } from '@components/banner/banner.component';
import type { BannerVariant } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DesktopApi } from './core/desktop-api';
import { ErrorStore } from './core/error-store';
import type { ErrorEntry } from './core/error-store';
import { ShellComponent } from './shell/shell.component';

interface ErrorBanner extends ErrorEntry {
  variant: BannerVariant;
  dismissible: boolean;
}

@Component({
  selector: 'ds-root',
  imports: [BannerComponent, ButtonDirective, ShellComponent],
  templateUrl: './root.component.html',
})
export class RootComponent {
  protected readonly desktopApi: DesktopApi = inject(DesktopApi);
  protected readonly errorStore: ErrorStore = inject(ErrorStore);
  protected readonly copy = errorCopy;
  protected readonly text = errorText;

  protected readonly errorBanners = computed<ErrorBanner[]>(() =>
    this.errorStore.errors().map((entry): ErrorBanner => ({ ...entry, variant: 'danger', dismissible: true })),
  );

  protected codeLine(banner: ErrorBanner): string {
    return `${errorText.code}: ${banner.code}${banner.count > 1 ? ` (×${banner.count})` : ''}`;
  }
}
