import { Component, computed, inject } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import type { BannerVariant } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DesktopApi } from './core/desktop-api';
import { I18nService } from './core/i18n/i18n.service';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { ErrorStore } from './core/error-store';
import type { ErrorEntry } from './core/error-store';
import { ShellComponent } from './shell/shell.component';

interface ErrorBanner extends ErrorEntry {
  variant: BannerVariant;
  dismissible: boolean;
}

@Component({
  selector: 'ds-root',
  imports: [BannerComponent, ButtonDirective, ShellComponent, TranslatePipe],
  templateUrl: './root.component.html',
})
export class RootComponent {
  protected readonly desktopApi: DesktopApi = inject(DesktopApi);
  protected readonly errorStore: ErrorStore = inject(ErrorStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly errorBanners = computed<ErrorBanner[]>(() =>
    this.errorStore.errors().map((entry): ErrorBanner => ({ ...entry, variant: 'danger', dismissible: true })),
  );

  protected codeLine(banner: ErrorBanner): string {
    return `${this.i18n.t('common.code')}: ${banner.code}${banner.count > 1 ? ` (×${banner.count})` : ''}`;
  }
}
