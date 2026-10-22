import { DestroyRef, Directive, OnInit, TemplateRef, inject, input } from '@angular/core';
import type { SplitterEdge } from '@components/splitter/splitter.directive';
import { LayoutService } from './layout.service';

@Directive({ selector: 'ng-template[dsPanel]' })
export class PanelDirective implements OnInit {
  readonly edge = input.required<SplitterEdge>({ alias: 'dsPanel' });
  readonly label = input.required<string>();
  readonly resizeLabel = input.required<string>();
  readonly testId = input<string | null>(null);
  readonly panelClass = input<string>('');
  readonly template: TemplateRef<unknown> = inject(TemplateRef);

  private readonly layout: LayoutService = inject(LayoutService);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.layout.register(this);
    this.destroyRef.onDestroy(() => this.layout.unregister(this));
  }
}
