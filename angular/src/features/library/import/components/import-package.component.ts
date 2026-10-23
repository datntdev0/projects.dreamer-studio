import { Component, computed, inject, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { formatBytes, formatCount } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ImportStore } from '../import.store';

@Component({
  selector: 'ds-import-package',
  imports: [ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './import-package.component.html',
})
export class ImportPackageComponent {
  protected readonly store: ImportStore = inject(ImportStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly fileSize: Signal<string> = computed(() =>
    formatBytes(this.store.preview()?.file.size ?? 0, this.i18n.language()),
  );
  protected readonly chapterCount: Signal<string> = computed(() =>
    formatCount(this.store.preview()?.chapters.length ?? 0, this.i18n.language()),
  );
}
