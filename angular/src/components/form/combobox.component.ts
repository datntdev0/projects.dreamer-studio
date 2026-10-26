import { afterRenderEffect, booleanAttribute, Component, effect, ElementRef, inject } from '@angular/core';
import { input, output, signal, viewChild, viewChildren } from '@angular/core';
import type { Signal } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';

@Component({
  selector: 'ds-combobox',
  imports: [IconComponent],
  host: {
    '[attr.data-testid]': 'testId()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  templateUrl: './combobox.component.html',
})
export class ComboboxComponent {
  readonly value = input<string>('');
  readonly committed = output<string>();
  readonly options = input.required<string[]>();
  readonly inputId = input.required<string>();
  readonly placeholder = input<string>('');
  readonly disabled = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly mono = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string>();
  readonly describedBy = input<string>();
  readonly toggleLabel = input.required<string>();
  readonly testId = input.required<string>();

  protected readonly draft = signal<string>('');
  protected readonly open = signal<boolean>(false);
  protected readonly activeIndex = signal<number>(-1);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('inputElement');
  private readonly optionElements: Signal<readonly ElementRef<HTMLElement>[]> =
    viewChildren<ElementRef<HTMLElement>>('optionElement');

  constructor() {
    effect((): void => {
      this.draft.set(this.value());
    });
    effect((): void => {
      if (this.disabled() || this.options().length === 0) this.close();
    });
    afterRenderEffect((): void => {
      if (!this.open()) return;
      const option: ElementRef<HTMLElement> | undefined = this.optionElements()[this.activeIndex()];
      option?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }

  protected listId(): string {
    return `${this.inputId()}-list`;
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  protected activeDescendant(): string | null {
    const index: number = this.activeIndex();
    return this.open() && index >= 0 && index < this.options().length ? this.optionId(index) : null;
  }

  protected onInput(text: string): void {
    this.draft.set(text);
    this.activeIndex.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled() || event.isComposing) return;
    if (event.key === 'Escape') {
      if (this.open()) this.close();
      else this.draft.set(this.value());
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      if (this.open() && this.activeIndex() >= 0 && this.activeIndex() < this.options().length)
        this.pick(this.activeIndex());
      else this.commit();
      this.close();
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (this.options().length === 0) return;
    event.preventDefault();
    const length: number = this.options().length;
    if (!this.open()) {
      this.open.set(true);
      this.activeIndex.set(event.key === 'ArrowDown' ? 0 : length - 1);
      return;
    }
    const current: number = this.activeIndex();
    this.activeIndex.set(event.key === 'ArrowDown' ? (current + 1) % length : (current + length - 1) % length);
  }

  protected onBlur(): void {
    this.close();
    this.commit();
  }

  protected keepFocus(event: MouseEvent): void {
    event.preventDefault();
  }

  protected toggleList(): void {
    if (this.disabled() || this.options().length === 0) return;
    this.inputElement()?.nativeElement.focus();
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.activeIndex.set(this.options().indexOf(this.draft()));
  }

  protected pick(index: number): void {
    const option: string | undefined = this.options()[index];
    if (option === undefined) return;
    this.draft.set(option);
    this.commit();
    this.close();
    this.inputElement()?.nativeElement.focus();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (event.target instanceof Node && !this.host.nativeElement.contains(event.target)) this.close();
  }

  revert(): void {
    this.draft.set(this.value());
  }

  private commit(): void {
    const next: string = this.draft().trim();
    this.draft.set(next);
    if (next !== this.value()) this.committed.emit(next);
  }

  private close(): void {
    this.open.set(false);
    this.activeIndex.set(-1);
  }
}
