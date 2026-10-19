import { Component, inject, input } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { Toast, ToastKind, ToastService } from './toast.service';

const KIND_ICONS: Record<ToastKind, string> = {
  success: 'check',
  danger: 'alert-circle',
  info: 'info',
};

@Component({
  selector: 'ds-toast-outlet',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './toast-outlet.component.html',
})
export class ToastOutletComponent {
  readonly closeLabel = input.required<string>();

  protected readonly service: ToastService = inject(ToastService);
  protected readonly icons: Record<ToastKind, string> = KIND_ICONS;

  protected runAction(toast: Toast): void {
    toast.action?.run();
    this.service.dismiss(toast.id);
  }
}
