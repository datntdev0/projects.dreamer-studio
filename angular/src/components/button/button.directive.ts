import { Directive, computed, input, booleanAttribute } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Directive({
  selector: 'button[dsBtn], a[dsBtn]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() ? true : null',
    '[attr.aria-disabled]': 'loading() ? true : null',
    '(click)': 'blockWhileLoading($event)',
  },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly loading = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected readonly classes = computed<string>(() =>
    [
      'ds-btn',
      this.variant() === 'secondary' ? '' : this.variant(),
      this.size() === 'md' ? '' : this.size(),
      this.iconOnly() ? 'icon-only' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  protected blockWhileLoading(event: Event): void {
    if (this.loading()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}
