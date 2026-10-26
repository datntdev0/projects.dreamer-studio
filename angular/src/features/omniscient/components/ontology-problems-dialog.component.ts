import { Component, computed, inject } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { DialogComponent } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ontologyProblemKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

@Component({
  selector: 'ds-ontology-problems-dialog',
  imports: [ButtonDirective, DialogComponent, IconComponent, TranslatePipe],
  templateUrl: './ontology-problems-dialog.component.html',
})
export class OntologyProblemsDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly open = computed(() => this.store.dialog()?.kind === 'ontology');
  protected readonly problems = this.store.ontologyProblems;
  protected readonly problemKeys = ontologyProblemKeys;

  protected close(): void {
    if (this.open()) this.store.dialog.set(null);
  }

  protected async openEditor(): Promise<void> {
    if (await this.store.ontologyOpen())
      this.toast.show({ kind: 'success', title: this.i18n.t('analysis.pipeline.openedInSystemEditor') });
    else
      this.toast.show({ kind: 'danger', title: this.i18n.t('analysis.run.openFailed'), message: this.store.error() });
  }

  protected async recheck(): Promise<void> {
    if ((await this.store.ontologyCheck()) && !this.problems().length)
      this.toast.show({ kind: 'success', title: this.i18n.t('analysis.pipeline.ontologyValid') });
  }

  protected async reset(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.pipeline.resetDefault'),
      message: this.i18n.t('analysis.pipeline.resetConfirm'),
      confirmLabel: this.i18n.t('analysis.pipeline.resetDefault'),
      cancelLabel: this.i18n.t('analysis.pipeline.cancel'),
      danger: true,
    });
    if (confirmed && (await this.store.ontologyReset()))
      this.toast.show({ kind: 'success', title: this.i18n.t('analysis.run.resetDone') });
  }
}
