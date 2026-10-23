import { Component, computed, inject, linkedSignal, type Signal, type WritableSignal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { MAX_CONCURRENT_MAX, MAX_CONCURRENT_MIN } from '@dreamer/shared/models/settings';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { PipelineStore } from '@core/stores/pipeline-store';
import { SettingsStore } from '@core/stores/settings-store';
import { SettingsReset } from '../settings-reset';

@Component({
  selector: 'ds-settings-pipeline',
  imports: [ButtonDirective, IconComponent, TranslatePipe],
  templateUrl: './pipeline-section.component.html',
})
export class PipelineSectionComponent {
  private readonly store: SettingsStore = inject(SettingsStore);
  private readonly pipelines: PipelineStore = inject(PipelineStore);
  private readonly resetHelper: SettingsReset = inject(SettingsReset);
  private readonly saved: Signal<number> = computed(
    () => this.store.settings()?.pipelines.maxConcurrent ?? MAX_CONCURRENT_MIN,
  );

  protected readonly min: number = MAX_CONCURRENT_MIN;
  protected readonly max: number = MAX_CONCURRENT_MAX;
  protected readonly value: WritableSignal<number> = linkedSignal(() => this.saved());
  protected readonly activeCount: Signal<number> = computed(() => this.pipelines.active().runs.length);

  protected onInput(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }

  protected async onChange(event: Event): Promise<void> {
    const maxConcurrent: number = Number((event.target as HTMLInputElement).value);
    if (!(await this.store.update({ pipelines: { maxConcurrent } }))) this.value.set(this.saved());
  }

  protected reset(): void {
    void this.resetHelper.run('pipeline');
  }
}
