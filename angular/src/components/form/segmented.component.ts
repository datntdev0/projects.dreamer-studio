import { Component, input, model, booleanAttribute } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: string;
}

@Component({
  selector: 'ds-segmented',
  imports: [IconComponent],
  templateUrl: './segmented.component.html',
  host: { class: 'ds-segmented', role: 'radiogroup', '[attr.aria-label]': 'label() || null' },
})
export class SegmentedComponent {
  readonly options = input.required<SegmentedOption[]>();
  readonly value = model<string>('');
  readonly label = input<string>('');
  readonly iconOnly = input<boolean, unknown>(false, { transform: booleanAttribute });

  protected isTabbable(option: SegmentedOption, index: number): boolean {
    const hasSelection: boolean = this.options().some((item: SegmentedOption): boolean => item.value === this.value());
    return hasSelection ? option.value === this.value() : index === 0;
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const step: number = this.stepFor(event.key);
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const options: SegmentedOption[] = this.options();
    const next: number = (index + step + options.length) % options.length;
    this.value.set(options[next].value);
    const group: HTMLElement = (event.currentTarget as HTMLElement).parentElement as HTMLElement;
    group.querySelectorAll('button')[next].focus();
  }

  private stepFor(key: string): number {
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      return 1;
    }
    return key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  }
}
