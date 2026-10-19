import { Component, computed, input, booleanAttribute } from '@angular/core';

export type DotKind = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

@Component({
  selector: 'ds-dot',
  templateUrl: './dot.component.html',
  host: { '[class]': 'classes()', 'aria-hidden': 'true' },
})
export class DotComponent {
  readonly kind = input<DotKind>('neutral');
  readonly pulse = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected readonly classes = computed<string>(() =>
    ['ds-dot', this.kind() === 'neutral' ? '' : this.kind(), this.pulse() ? 'pulse' : ''].filter(Boolean).join(' '),
  );
}
