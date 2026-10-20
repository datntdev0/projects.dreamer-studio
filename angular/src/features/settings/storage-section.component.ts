import { Component, computed, inject, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { DesktopApi } from '../../core/desktop-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SettingsStore } from '../../core/settings-store';

const SETTINGS_DIR = '%LOCALAPPDATA%\\DreamerStudio';

@Component({
  selector: 'ds-settings-storage',
  imports: [ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './storage-section.component.html',
})
export class StorageSectionComponent {
  private readonly api: DesktopApi = inject(DesktopApi);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly store: SettingsStore = inject(SettingsStore);

  protected readonly settingsDir: string = SETTINGS_DIR;
  protected readonly appDataDir: Signal<string> = computed(() => this.store.settings()?.appDataDir ?? '');

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.appDataDir());
      this.toast.show({ kind: 'success', title: this.i18n.t('settings.storage.copied') });
    } catch {
      this.toast.show({ kind: 'danger', title: this.i18n.t('settings.storage.copyFailed') });
    }
  }

  protected async openExplorer(): Promise<void> {
    try {
      await this.api.openDataDir();
    } catch (error) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('settings.storage.openExplorerFailed'),
        message: errorMessage(error),
      });
    }
  }
}
