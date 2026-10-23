import { Component, computed, inject, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent, type PillKind } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import type { AppInfo } from '@dreamer/shared/ipc/app';
import type { BackendState } from '@dreamer/shared/ipc/backend';
import { APP_LICENSE, buildDateLabel, formatVersionInfo } from '@dreamer/shared/models/about';
import { MISSING, versionLabel, type AboutLink } from '@dreamer/shared/models/about';
import { AppInfoStore } from '@core/app-info';
import { BackendStatus } from '@core/backend-status';
import { DesktopApi } from '@core/desktop-api';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';

interface DetailLine {
  id: string;
  label: string;
  value: (info: AppInfo) => string | null;
}

interface DetailView {
  id: string;
  label: string;
  value: string;
}

interface BackendView {
  kind: PillKind;
  icon: string;
  label: string;
}

const SYSTEM_LINES: DetailLine[] = [
  { id: 'electron', label: 'about.electron', value: (info) => info.electron },
  { id: 'chromium', label: 'about.chromium', value: (info) => info.chrome },
  { id: 'node', label: 'about.node', value: (info) => info.node },
  { id: 'os', label: 'about.os', value: (info) => info.os },
  { id: 'database', label: 'about.databaseSchema', value: (info) => info.schemaVersion },
];

const BACKEND_VIEWS: Record<BackendState, BackendView> = {
  running: { kind: 'success', icon: 'check', label: 'about.backendRunning' },
  starting: { kind: 'warning', icon: 'clock', label: 'about.backendStarting' },
  unavailable: { kind: 'danger', icon: 'alert-circle', label: 'about.backendUnavailable' },
};

@Component({
  selector: 'ds-settings-about',
  imports: [ButtonDirective, IconComponent, PillComponent, TranslatePipe],
  templateUrl: './about-section.component.html',
})
export class AboutSectionComponent {
  private readonly appInfo: AppInfoStore = inject(AppInfoStore);
  private readonly backendStatus: BackendStatus = inject(BackendStatus);
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);

  protected readonly license: string = APP_LICENSE;
  protected readonly missing: string = MISSING;

  protected readonly info: Signal<AppInfo | null> = this.appInfo.info;
  protected readonly address: Signal<string | null> = this.backendStatus.address;
  protected readonly loading: Signal<boolean> = computed(() => this.appInfo.state() === 'loading');
  protected readonly version: Signal<string> = computed(() => {
    const info: AppInfo | null = this.info();
    return info ? versionLabel(info) : MISSING;
  });
  protected readonly buildDate: Signal<string> = computed(() => {
    const info: AppInfo | null = this.info();
    return info ? buildDateLabel(info) : MISSING;
  });
  protected readonly details: Signal<DetailView[]> = computed(() => {
    const info: AppInfo | null = this.info();
    return SYSTEM_LINES.map((line) => ({
      id: line.id,
      label: line.label,
      value: (info && line.value(info)) ?? MISSING,
    }));
  });
  protected readonly backend: Signal<BackendView> = computed(() => BACKEND_VIEWS[this.backendStatus.state()]);

  protected open(link: AboutLink): void {
    void this.desktopApi.openLink(link);
  }

  protected async copy(): Promise<void> {
    try {
      const text: string = formatVersionInfo(this.info(), {
        state: this.backendStatus.state(),
        address: this.address(),
      });
      await navigator.clipboard.writeText(text);
      this.toast.show({ kind: 'success', title: this.i18n.t('about.copied') });
    } catch {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('about.copyFailed'),
        message: this.i18n.t('about.copyFailedHint'),
      });
    }
  }
}
