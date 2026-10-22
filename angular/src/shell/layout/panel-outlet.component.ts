import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { SplitterDirective, type SplitterEdge } from '@components/splitter/splitter.directive';
import { LayoutService } from './layout.service';

@Component({
  selector: 'ds-panel-outlet',
  imports: [NgTemplateOutlet, SplitterDirective],
  templateUrl: './panel-outlet.component.html',
  host: { class: 'ds-panel-outlet' },
})
export class PanelOutletComponent {
  readonly edge = input.required<SplitterEdge>();

  private readonly layout: LayoutService = inject(LayoutService);
  protected readonly panel = computed(() => this.layout.visible(this.edge()));
}
