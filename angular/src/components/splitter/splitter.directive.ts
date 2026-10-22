import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';

export type SplitterEdge = 'left' | 'right' | 'bottom';

const KEY_STEP: number = 16;
const MAX_RATIO: Record<SplitterEdge, number> = { left: 0.5, right: 0.5, bottom: 0.6 };
const MIN_TOKEN: Record<SplitterEdge, string> = {
  left: '--panel-min-w',
  right: '--panel-min-w',
  bottom: '--panel-min-h',
};

function isBoxless(element: HTMLElement): boolean {
  return getComputedStyle(element).display === 'contents';
}

@Directive({
  selector: 'ds-splitter',
  host: {
    class: 'ds-splitter',
    role: 'separator',
    tabindex: '0',
    '[class]': 'edge()',
    '[class.dragging]': 'dragging()',
    '[attr.data-testid]': '"splitter-" + edge()',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuenow]': 'size()',
    '[attr.aria-valuemin]': 'low()',
    '[attr.aria-valuemax]': 'high()',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'stop($event)',
    '(pointercancel)': 'stop($event)',
    '(keydown)': 'key($event)',
    '(dblclick)': 'reset()',
    '(focus)': 'measure()',
  },
})
export class SplitterDirective {
  readonly target = input.required<HTMLElement>();
  readonly edge = input.required<SplitterEdge>();
  readonly label = input<string>('');
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly resized = output<number>();

  protected readonly size = signal<number>(0);
  protected readonly low = signal<number>(0);
  protected readonly high = signal<number>(0);
  protected readonly dragging = signal<boolean>(false);
  protected readonly orientation = computed<string>(() => (this.edge() === 'bottom' ? 'horizontal' : 'vertical'));

  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document: Document = inject(DOCUMENT);
  private origin: number = 0;
  private startSize: number = 0;

  constructor() {
    afterNextRender(() => this.measure());
  }

  protected measure(): void {
    const rect: DOMRect = this.target().getBoundingClientRect();
    let parentElement: HTMLElement | null = this.target().parentElement;
    while (parentElement && isBoxless(parentElement)) parentElement = parentElement.parentElement;
    const parent: DOMRect | undefined = parentElement?.getBoundingClientRect();
    const horizontal: boolean = this.edge() !== 'bottom';
    const parentSize: number = (horizontal ? parent?.width : parent?.height) ?? 0;
    const tokenMin: number = parseFloat(
      getComputedStyle(this.document.documentElement).getPropertyValue(MIN_TOKEN[this.edge()]),
    );
    const size: number = Math.round(horizontal ? rect.width : rect.height);
    const ratioMax: number = Math.round(parentSize * MAX_RATIO[this.edge()]);
    this.low.set(this.min() ?? tokenMin);
    this.high.set(this.max() ?? Math.min(ratioMax, size + this.centerSize(horizontal) - tokenMin));
    this.size.set(size);
  }

  protected start(event: PointerEvent): void {
    event.preventDefault();
    this.measure();
    this.host.setPointerCapture(event.pointerId);
    this.origin = this.coordinate(event);
    this.startSize = this.size();
    this.dragging.set(true);
    this.host.focus();
  }

  protected move(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const delta: number = this.coordinate(event) - this.origin;
    this.apply(this.edge() === 'left' ? this.startSize + delta : this.startSize - delta);
  }

  protected stop(event: PointerEvent): void {
    if (this.host.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId);
    }
    this.dragging.set(false);
  }

  protected key(event: KeyboardEvent): void {
    const grow: string = this.edge() === 'bottom' ? 'ArrowUp' : this.edge() === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink: string = this.edge() === 'bottom' ? 'ArrowDown' : this.edge() === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const sizes: Record<string, () => number | null> = {
      [grow]: () => this.size() + KEY_STEP,
      [shrink]: () => this.size() - KEY_STEP,
      Home: () => this.low(),
      End: () => this.high(),
      Enter: () => null,
    };
    const next: (() => number | null) | undefined = sizes[event.key];
    if (!next) {
      return;
    }
    event.preventDefault();
    this.measure();
    const value: number | null = next();
    if (value === null) {
      this.reset();
    } else {
      this.apply(value);
    }
  }

  protected reset(): void {
    const element: HTMLElement = this.target();
    element.style.removeProperty(this.edge() === 'bottom' ? 'height' : 'width');
    this.measure();
    this.resized.emit(this.size());
  }

  private apply(value: number): void {
    const size: number = Math.round(Math.min(Math.max(value, this.low()), this.high()));
    this.target().style.setProperty(this.edge() === 'bottom' ? 'height' : 'width', `${size}px`);
    this.size.set(size);
    this.resized.emit(size);
  }

  private centerSize(horizontal: boolean): number {
    const parent: HTMLElement | null = this.host.parentElement;
    const anchor: Element = parent && isBoxless(parent) ? parent : this.host;
    const center: Element | null = this.edge() === 'left' ? anchor.nextElementSibling : anchor.previousElementSibling;
    const rect: DOMRect | undefined = center?.getBoundingClientRect();
    return (horizontal ? rect?.width : rect?.height) ?? Infinity;
  }

  private coordinate(event: PointerEvent): number {
    return this.edge() === 'bottom' ? event.clientY : event.clientX;
  }
}
