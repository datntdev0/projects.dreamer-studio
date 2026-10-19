import { Component, input, model, booleanAttribute } from '@angular/core';

@Component({
  selector: 'ds-checkbox',
  templateUrl: './checkbox.component.html',
  host: { class: 'ds-checkbox', '[class.is-disabled]': 'disabled()' },
})
export class CheckboxComponent {
  readonly checked = model<boolean>(false);
  readonly disabled = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
