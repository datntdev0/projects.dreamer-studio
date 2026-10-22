import { booleanAttribute, Component, input, output } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'ds-unsaved-changes-dialog',
  imports: [ButtonDirective, DialogComponent, TranslatePipe],
  templateUrl: './unsaved-changes-dialog.component.html',
})
export class UnsavedChangesDialogComponent {
  readonly open = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly keep = output<void>();
  readonly discard = output<void>();

  protected dismiss(): void {
    if (this.open()) this.keep.emit();
  }
}
