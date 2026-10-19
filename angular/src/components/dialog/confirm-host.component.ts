import { Component, computed, inject } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from './dialog.component';
import { ConfirmOptions, ConfirmService } from './confirm.service';

@Component({
  selector: 'ds-confirm-host',
  imports: [ButtonDirective, DialogComponent],
  templateUrl: './confirm-host.component.html',
})
export class ConfirmHostComponent {
  protected readonly service: ConfirmService = inject(ConfirmService);
  protected readonly options = computed<ConfirmOptions | null>(() => this.service.request()?.options ?? null);
}
