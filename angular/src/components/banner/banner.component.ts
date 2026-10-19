import { Component, computed, input, output, booleanAttribute } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';

export type BannerVariant = 'info' | 'success' | 'warning' | 'danger';

const VARIANT_ICONS: Record<BannerVariant, string> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

@Component({
  selector: 'ds-banner',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './banner.component.html',
})
export class BannerComponent {
  readonly variant = input<BannerVariant>('info');
  readonly heading = input.required<string>();
  readonly dismissLabel = input.required<string>();
  readonly message = input<string>('');
  readonly meta = input<string>('');
  readonly dismissible = input<boolean, unknown>(true, { transform: booleanAttribute });
  readonly dismiss = output<void>();

  protected readonly role = computed<string>(() => (this.variant() === 'danger' ? 'alert' : 'status'));
  protected readonly iconName = computed<string>(() => VARIANT_ICONS[this.variant()]);
}
