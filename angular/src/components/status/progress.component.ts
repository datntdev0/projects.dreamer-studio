import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'ds-progress',
  templateUrl: './progress.component.html',
  host: {
    role: 'progressbar',
    '[class]': 'classes()',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'percent()',
  },
})
export class ProgressComponent {
  readonly value = input<number | null>(null);
  readonly kind = input<'default' | 'danger' | 'neutral'>('default');

  protected readonly percent = computed<number | null>(() => {
    const value: number | null = this.value();
    return value === null ? null : Math.min(100, Math.max(0, value));
  });
  protected readonly classes = computed<string>(() =>
    ['ds-progress', this.kind(), this.percent() === null ? 'indeterminate' : ''].filter(Boolean).join(' '),
  );
}
