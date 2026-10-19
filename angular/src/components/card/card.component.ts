import { Component, ElementRef, computed, inject, input, booleanAttribute } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';

@Component({
  selector: 'ds-card',
  imports: [IconComponent],
  templateUrl: './card.component.html',
  host: {
    '[class]': 'classes()',
    '[attr.role]': 'interactive() ? "button" : null',
    '[attr.tabindex]': 'interactive() ? 0 : null',
    '(keydown.enter)': 'activate($event)',
    '(keydown.space)': 'activate($event)',
  },
})
export class CardComponent {
  readonly interactive = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly icon = input<string | null>(null);
  readonly heading = input<string | null>(null);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly classes = computed<string>(() => (this.interactive() ? 'ds-card interactive' : 'ds-card'));

  protected activate(event: Event): void {
    if (this.interactive() && event.target === this.host.nativeElement) {
      event.preventDefault();
      this.host.nativeElement.click();
    }
  }
}
