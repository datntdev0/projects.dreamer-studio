import { Component, ElementRef, effect, input, output, viewChild, booleanAttribute } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';

let nextId: number = 0;

@Component({
  selector: 'ds-dialog',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './dialog.component.html',
})
export class DialogComponent {
  readonly open = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly heading = input.required<string>();
  readonly icon = input<string>('');
  readonly danger = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly closeLabel = input.required<string>();
  readonly closed = output<void>();
  protected readonly headingId: string = `ds-dialog-heading-${nextId++}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  constructor() {
    effect(() => {
      const element: HTMLDialogElement = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }
}
