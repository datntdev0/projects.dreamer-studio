import { Component, booleanAttribute, computed, input } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';

export type PillKind = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

@Component({
  selector: 'ds-pill',
  imports: [IconComponent],
  templateUrl: './pill.component.html',
  host: { '[class]': 'classes()' },
})
export class PillComponent {
  readonly kind = input<PillKind>('neutral');
  readonly icon = input<string | null>(null);
  readonly dot = input(false, { transform: booleanAttribute });

  protected readonly classes = computed<string>(
    () => `ds-pill${this.kind() === 'neutral' ? '' : ` ${this.kind()}`}${this.dot() ? ' has-dot' : ''}`,
  );
}
