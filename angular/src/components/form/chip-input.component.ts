import { Component, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';

@Component({
  selector: 'ds-chip-input',
  imports: [IconComponent],
  host: { '[attr.data-testid]': 'testId()' },
  templateUrl: './chip-input.component.html',
})
export class ChipInputComponent {
  readonly values = model.required<string[]>();
  readonly inputId = input.required<string>();
  readonly placeholder = input.required<string>();
  readonly removeLabel = input.required<string>();
  readonly testId = input.required<string>();

  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('inputElement');
  private readonly text = signal<string>('');
  private readonly hasPendingText = signal<boolean>(false);
  private readonly i18n: I18nService = inject(I18nService);

  readonly pending: Signal<boolean> = this.hasPendingText.asReadonly();

  commit(): void {
    this.add(this.text());
    this.text.set('');
    this.hasPendingText.set(false);
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.hasPendingText.set(value.length > 0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && !this.text()) {
      const values: string[] = this.values();
      if (values.length) this.values.set(values.slice(0, -1));
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const text: string = event.clipboardData?.getData('text') ?? '';
    if (!text || !/[,\r\n]/.test(text)) return;
    event.preventDefault();
    this.add(text);
    this.text.set('');
    this.hasPendingText.set(false);
  }

  protected remove(value: string): void {
    this.values.set(this.values().filter((item: string): boolean => item !== value));
    this.focus();
  }

  protected focus(): void {
    this.inputElement()?.nativeElement.focus();
  }

  protected removeText(tag: string): string {
    return this.i18n.t(this.removeLabel(), { tag });
  }

  protected inputTestId(): string {
    return `${this.testId()}-input`;
  }

  protected chipTestId(): string {
    return `${this.testId()}-chip`;
  }

  protected removeTestId(): string {
    return `${this.testId()}-remove`;
  }

  protected legacyChipTestId(): string {
    return this.itemTestId();
  }

  protected legacyRemoveTestId(): string {
    return `${this.itemTestId()}-remove`;
  }

  private add(value: string): void {
    const values: string[] = [...this.values()];
    for (const part of value.split(/[,\r\n]+/)) {
      const tag: string = part.trim();
      const exists: boolean = values.some(
        (item: string): boolean => item.toLocaleLowerCase() === tag.toLocaleLowerCase(),
      );
      if (tag && !exists) values.push(tag);
    }
    if (values.length !== this.values().length) this.values.set(values);
  }

  private itemTestId(): string {
    const testId: string = this.testId();
    return testId.endsWith('s') ? testId.slice(0, -1) : `${testId}-chip`;
  }
}
