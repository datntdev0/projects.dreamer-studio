import { NgTemplateOutlet } from '@angular/common';
import { Component, input, booleanAttribute } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';

export type FieldSpan = 'single' | 'full';

@Component({
  selector: 'ds-field',
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './field.component.html',
  host: {
    class: 'ds-field',
    '[class.span-full]': "span() === 'full'",
    '[class.has-error]': '!!error()',
  },
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly controlId = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string>('');
  readonly required = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly span = input<FieldSpan>('single');
}
