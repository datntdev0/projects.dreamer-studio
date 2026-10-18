import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { errorText } from '@dreamer/shared/errors/error-copy';

export type BannerVariant = 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ds-banner',
  imports: [NgTemplateOutlet],
  templateUrl: './banner.component.html',
})
export class BannerComponent {
  readonly variant = input<BannerVariant>('info');
  readonly heading = input.required<string>();
  readonly message = input<string>('');
  readonly meta = input<string>('');
  readonly dismissible = input<boolean>(true);
  readonly dismiss = output<void>();

  protected readonly text = errorText;
  protected readonly role = computed<string>(() => (this.variant() === 'danger' ? 'alert' : 'status'));
}
