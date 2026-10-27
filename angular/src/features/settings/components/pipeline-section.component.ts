import { Component, computed, inject, linkedSignal, type Signal, type WritableSignal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { RangeDirective } from '@components/form/range.directive';
import { IconComponent } from '@components/icon/icon.component';
import { DEFAULT_PIPELINE_SETTINGS, PIPELINE_LIMITS, type PipelineSettings } from '@dreamer/shared/models/settings';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { SettingsReset } from '../settings-reset';

interface PipelineRow {
  id: string;
  setting: keyof PipelineSettings;
  label: string;
  hint: string;
}

@Component({
  selector: 'ds-settings-pipeline',
  imports: [ButtonDirective, IconComponent, RangeDirective, TranslatePipe],
  templateUrl: './pipeline-section.component.html',
})
export class PipelineSectionComponent {
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly pipelines: PipelineStore = inject(PipelineStore);
  private readonly resetHelper: SettingsReset = inject(SettingsReset);
  private readonly saved: Signal<PipelineSettings> = computed(
    () => this.store.settings()?.pipelines ?? DEFAULT_PIPELINE_SETTINGS,
  );

  protected readonly limits = PIPELINE_LIMITS;
  protected readonly rows: PipelineRow[] = [
    { id: 'max', setting: 'maxConcurrent', label: 'settings.pipeline.max', hint: 'settings.pipeline.maxHint' },
    {
      id: 'chapters',
      setting: 'maxChapters',
      label: 'settings.pipeline.chapters',
      hint: 'settings.pipeline.chaptersHint',
    },
  ];
  protected readonly values: WritableSignal<PipelineSettings> = linkedSignal(() => this.saved());
  protected readonly activeCount: Signal<number> = computed(() => this.pipelines.active().runs.length);

  protected onInput(setting: keyof PipelineSettings, event: Event): void {
    const value: number = Number((event.target as HTMLInputElement).value);
    this.values.update((values: PipelineSettings): PipelineSettings => ({ ...values, [setting]: value }));
  }

  protected async onChange(setting: keyof PipelineSettings, event: Event): Promise<void> {
    const value: number = Number((event.target as HTMLInputElement).value);
    if (!(await this.store.update({ pipelines: { [setting]: value } }))) this.values.set(this.saved());
  }

  protected reset(): void {
    void this.resetHelper.run('pipeline');
  }
}
