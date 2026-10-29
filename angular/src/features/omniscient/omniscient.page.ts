import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { ButtonDirective } from '@components/button/button.directive';
import { BadgeComponent } from '@components/status/badge.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PageTitleDirective } from '@shell/page-title.directive';
import { PanelDirective } from '@shell/layout/panel.directive';
import { EntityListComponent } from './components/entity-list.component';
import { EntityPanelComponent } from './components/entity-panel.component';
import { EntityTableComponent } from './components/entity-table.component';
import { OntologyProblemsDialogComponent } from './components/ontology-problems-dialog.component';
import { OverlayOrphansDialogComponent } from './components/overlay-orphans-dialog.component';
import { ReviewViewComponent } from './components/review-view.component';
import { RunAnalysisDialogComponent } from './components/run-analysis-dialog.component';
import { RunPillComponent } from './components/run-pill.component';
import { WorldEditDialogComponent } from './components/world-edit-dialog.component';
import { WorldGraphComponent } from './components/world-graph.component';
import { WorldTimelineComponent } from './components/world-timeline.component';
import { OmniscientStore } from './omniscient.store';
import type { OmniscientView } from './omniscient.store';
import type { TargetLanguage } from '@dreamer/shared/models/translation';

@Component({
  selector: 'ds-omniscient-page',
  imports: [
    AreaStateComponent,
    BadgeComponent,
    BannerComponent,
    ButtonDirective,
    EntityListComponent,
    EntityPanelComponent,
    EntityTableComponent,
    IconComponent,
    OntologyProblemsDialogComponent,
    OverlayOrphansDialogComponent,
    PageTitleDirective,
    PanelDirective,
    ReviewViewComponent,
    RouterLink,
    RunAnalysisDialogComponent,
    RunPillComponent,
    TooltipDirective,
    TranslatePipe,
    WorldEditDialogComponent,
    WorldGraphComponent,
    WorldTimelineComponent,
  ],
  providers: [OmniscientStore],
  templateUrl: './omniscient.page.html',
  host: { class: 'ds-page ds-world-page', 'data-testid': 'omniscient-page' },
})
export class OmniscientPage {
  protected readonly store = inject(OmniscientStore);
  protected readonly editScope = computed(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'edit' ? dialog.scope : null;
  });
  protected readonly views: OmniscientView[] = ['graph', 'table', 'review'];

  protected setNameLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setNameLanguage(value ? (value as TargetLanguage) : null);
  }

  protected readonly viewIcons: Record<OmniscientView, string> = { graph: 'network', table: 'list', review: 'tasks' };
  protected readonly viewKeys: Record<OmniscientView, string> = {
    graph: 'analysis.page.view.graph',
    table: 'analysis.page.view.table',
    review: 'analysis.page.view.review',
  };
}
