import { Component, computed, input } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';
import { DotComponent } from '@components/status/dot.component';
import type { PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { RUN_STATUS_VIEWS, type RunStatusView } from '../run-status';

@Component({
  selector: 'ds-run-status',
  imports: [DotComponent, IconComponent, TranslatePipe],
  templateUrl: './run-status.component.html',
  host: { class: 'pipeline-status', 'data-testid': 'pipeline-status', '[attr.data-status]': 'status()' },
})
export class RunStatusComponent {
  readonly status = input.required<PipelineRunStatus>();

  protected readonly view = computed<RunStatusView>(() => RUN_STATUS_VIEWS[this.status()]);
}
