import { Component, computed, input, booleanAttribute } from '@angular/core';
import { IconComponent, IconSize } from '@components/icon/icon.component';
import { ProgressComponent } from '@components/status/progress.component';

export type AreaStateKind = 'empty' | 'loading' | 'error';

const ROLES: Record<AreaStateKind, string | null> = { empty: null, loading: 'status', error: 'alert' };

@Component({
  selector: 'ds-area-state',
  imports: [IconComponent, ProgressComponent],
  templateUrl: './area-state.component.html',
})
export class AreaStateComponent {
  readonly kind = input.required<AreaStateKind>();
  readonly icon = input<string>('');
  readonly heading = input<string>('');
  readonly description = input<string>('');
  readonly details = input<string>('');
  readonly detailsLabel = input<string>('');
  readonly compact = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected readonly classes = computed<string>(
    () => `ds-area-state ${this.kind()}${this.compact() ? ' compact' : ''}`,
  );
  protected readonly role = computed<string | null>(() => ROLES[this.kind()]);
  protected readonly iconName = computed<string>(() => (this.kind() === 'error' ? 'alert-circle' : this.icon()));
  protected readonly iconSize = computed<IconSize>(() => (this.compact() ? 'lg' : 'xl'));
}
