import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, inject, input, booleanAttribute } from '@angular/core';

let nextId = 0;

@Directive({
  selector: '[dsTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(focusin)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class TooltipDirective implements OnDestroy {
  readonly dsTooltip = input.required<string>();
  readonly dsTooltipWhenTruncated = input<boolean, unknown>(false, { transform: booleanAttribute });

  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document: Document = inject(DOCUMENT);
  private readonly id: string = `ds-tooltip-${nextId++}`;
  private tip: HTMLElement | null = null;

  protected show(): void {
    if (this.tip || !this.dsTooltip() || (this.dsTooltipWhenTruncated() && !this.isTruncated())) {
      return;
    }
    const tip: HTMLElement = this.document.createElement('div');
    tip.id = this.id;
    tip.className = 'ds-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('data-testid', 'tooltip');
    tip.textContent = this.dsTooltip();
    this.document.body.appendChild(tip);
    this.place(tip);
    this.host.setAttribute('aria-describedby', this.id);
    this.tip = tip;
  }

  protected hide(): void {
    this.tip?.remove();
    this.tip = null;
    this.host.removeAttribute('aria-describedby');
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private isTruncated(): boolean {
    return this.host.scrollWidth > this.host.clientWidth;
  }

  private place(tip: HTMLElement): void {
    const rect: DOMRect = this.host.getBoundingClientRect();
    const below: boolean = rect.top < tip.offsetHeight * 2;
    const maxLeft: number = Math.max(this.document.documentElement.clientWidth - tip.offsetWidth, 0);
    const left: number = Math.min(Math.max(rect.left + (rect.width - tip.offsetWidth) / 2, 0), maxLeft);
    tip.classList.toggle('below', below);
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? rect.bottom : rect.top}px`;
  }
}
