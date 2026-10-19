import { Component, computed, input } from '@angular/core';

export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'ds-icon',
  templateUrl: './icon.component.html',
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<IconSize>('md');

  protected readonly classes = computed<string>(() => (this.size() === 'md' ? 'icon' : `icon ${this.size()}`));
  protected readonly href = computed<string>(() => `#i-${this.name()}`);
}
