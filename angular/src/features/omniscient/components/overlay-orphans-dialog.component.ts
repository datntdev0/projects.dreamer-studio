import { Component, computed, effect, inject, untracked } from '@angular/core';
import { DialogComponent } from '@components/dialog/dialog.component';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { orphanDetail, orphanKindKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

@Component({
  selector: 'ds-overlay-orphans-dialog',
  imports: [DialogComponent, TranslatePipe],
  templateUrl: './overlay-orphans-dialog.component.html',
})
export class OverlayOrphansDialogComponent {
  protected readonly store = inject(OmniscientStore);
  protected readonly open = computed(() => this.store.dialog()?.kind === 'orphans');
  protected readonly orphans = this.store.orphans;
  protected readonly kindKeys = orphanKindKeys;
  protected readonly detail = orphanDetail;

  constructor() {
    effect(() => {
      if (this.open() && !this.orphans().length) untracked(() => this.close());
    });
  }

  protected close(): void {
    if (this.open()) this.store.dialog.set(null);
  }
}
