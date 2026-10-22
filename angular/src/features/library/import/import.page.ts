import { Component, computed, inject, type Signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { SplitterDirective } from '@components/splitter/splitter.directive';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import { formatCount } from '../../../core/format';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PageTitleDirective } from '../../../shell/page-title.directive';
import { ImportChaptersComponent } from './components/import-chapters.component';
import { ImportChecksComponent } from './components/import-checks.component';
import { ImportMetadataComponent } from './components/import-metadata.component';
import { ImportPackageComponent } from './components/import-package.component';
import { ImportSourceComponent } from './components/import-source.component';
import { ImportStore } from './import.store';

@Component({
  selector: 'ds-import-page',
  imports: [
    ButtonDirective,
    IconComponent,
    ImportChaptersComponent,
    ImportChecksComponent,
    ImportMetadataComponent,
    ImportPackageComponent,
    ImportSourceComponent,
    PageTitleDirective,
    PillComponent,
    SplitterDirective,
    TranslatePipe,
  ],
  templateUrl: './import.page.html',
  host: { class: 'ds-page library-import', 'data-testid': 'import-page' },
  providers: [ImportStore],
})
export class ImportPage {
  protected readonly store: ImportStore = inject(ImportStore);
  private readonly toast: ToastService = inject(ToastService);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly router: Router = inject(Router);

  protected readonly includedLabel: Signal<string> = computed(() =>
    formatCount(this.store.includedCount(), this.i18n.language()),
  );

  protected async startImport(): Promise<void> {
    const title: string | null = await this.store.startImport();
    if (!title) return;
    this.toast.show({
      kind: 'info',
      title: this.i18n.t('library.import.page.started', { title }),
      action: {
        label: this.i18n.t('library.import.page.viewPipelines'),
        run: () => void this.router.navigateByUrl('/pipelines'),
      },
    });
  }
}
