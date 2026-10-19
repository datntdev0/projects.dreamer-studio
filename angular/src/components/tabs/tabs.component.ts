import { Component, input, model } from '@angular/core';
import { BadgeComponent } from '@components/status/badge.component';

export interface TabItem {
  id: string;
  label: string;
  count?: number | null;
}

@Component({
  selector: 'ds-tabs',
  imports: [BadgeComponent],
  templateUrl: './tabs.component.html',
  host: { class: 'ds-tabs', role: 'tablist', '[attr.aria-label]': 'label() || null' },
})
export class TabsComponent {
  readonly tabs = input.required<TabItem[]>();
  readonly value = model<string>('');
  readonly label = input<string>('');
  readonly idPrefix = input<string>('tab');
  readonly controls = input<string>('');

  protected isTabbable(tab: TabItem, index: number): boolean {
    const hasSelection: boolean = this.tabs().some((item: TabItem): boolean => item.id === this.value());
    return hasSelection ? tab.id === this.value() : index === 0;
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const next: number = this.targetFor(event.key, index);
    if (next < 0) {
      return;
    }
    event.preventDefault();
    this.value.set(this.tabs()[next].id);
    const strip: HTMLElement = (event.currentTarget as HTMLElement).parentElement as HTMLElement;
    strip.querySelectorAll('button')[next].focus();
  }

  private targetFor(key: string, index: number): number {
    const last: number = this.tabs().length - 1;
    switch (key) {
      case 'ArrowRight':
        return index === last ? 0 : index + 1;
      case 'ArrowLeft':
        return index === 0 ? last : index - 1;
      case 'Home':
        return 0;
      case 'End':
        return last;
      default:
        return -1;
    }
  }
}
