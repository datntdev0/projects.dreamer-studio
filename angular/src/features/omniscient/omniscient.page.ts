import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { BadgeComponent } from '@components/status/badge.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PageTitleDirective } from '@shell/page-title.directive';
import { PanelDirective } from '@shell/layout/panel.directive';
import { EntityDialogComponent } from './components/entity-dialog.component';
import { EntityListComponent } from './components/entity-list.component';
import { EntityMergeDialogComponent } from './components/entity-merge-dialog.component';
import { EntityPanelComponent } from './components/entity-panel.component';
import { EntitySplitDialogComponent } from './components/entity-split-dialog.component';
import { EntityTableComponent } from './components/entity-table.component';
import { FactDialogComponent } from './components/fact-dialog.component';
import { FixItemDialogComponent } from './components/fix-item-dialog.component';
import { MergeButtonComponent } from './components/merge-button.component';
import { OntologyProblemsDialogComponent } from './components/ontology-problems-dialog.component';
import { OverlayOrphansDialogComponent } from './components/overlay-orphans-dialog.component';
import { ReviewViewComponent } from './components/review-view.component';
import { RunAnalysisDialogComponent } from './components/run-analysis-dialog.component';
import { RunPillComponent } from './components/run-pill.component';
import { WorldGraphComponent } from './components/world-graph.component';
import { WorldTimelineComponent } from './components/world-timeline.component';
import { OmniscientStore } from './omniscient.store';
import type { OmniscientView } from './omniscient.store';

@Component({
  selector: 'ds-omniscient-page',
  imports: [
    BadgeComponent,
    BannerComponent,
    ButtonDirective,
    EntityDialogComponent,
    EntityListComponent,
    EntityMergeDialogComponent,
    EntityPanelComponent,
    EntitySplitDialogComponent,
    EntityTableComponent,
    FactDialogComponent,
    FixItemDialogComponent,
    IconComponent,
    MergeButtonComponent,
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
    WorldGraphComponent,
    WorldTimelineComponent,
  ],
  providers: [OmniscientStore],
  templateUrl: './omniscient.page.html',
  host: { class: 'ds-page ds-world-page', 'data-testid': 'omniscient-page' },
})
export class OmniscientPage {
  protected readonly store = inject(OmniscientStore);
  protected readonly views: OmniscientView[] = ['graph', 'table', 'review'];
  protected readonly viewIcons: Record<OmniscientView, string> = { graph: 'network', table: 'list', review: 'tasks' };
  protected readonly viewKeys: Record<OmniscientView, string> = {
    graph: 'analysis.page.view.graph',
    table: 'analysis.page.view.table',
    review: 'analysis.page.view.review',
  };
}
