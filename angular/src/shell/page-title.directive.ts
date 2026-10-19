import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

@Directive({
  selector: 'h1[dsPageTitle]',
  host: { tabindex: '-1', 'data-testid': 'page-title' },
})
export class PageTitleDirective {
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);

  constructor() {
    afterNextRender(() => this.element.nativeElement.focus());
  }
}
