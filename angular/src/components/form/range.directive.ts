import { Directive, ElementRef, afterEveryRender, inject } from '@angular/core';

@Directive({
  selector: 'input[type=range][dsRange]',
  host: { class: 'ds-range', '(input)': 'measure()' },
})
export class RangeDirective {
  private readonly host: HTMLInputElement = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  constructor() {
    afterEveryRender(() => this.measure());
  }

  protected measure(): void {
    const min: number = Number(this.host.min || 0);
    const max: number = Number(this.host.max || 100);
    const fill: number = max > min ? ((this.host.valueAsNumber - min) / (max - min)) * 100 : 0;
    this.host.style.setProperty('--range-fill', `${fill}%`);
  }
}
