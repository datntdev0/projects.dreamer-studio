import { Component, computed, effect, inject, input, output, signal, type Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import type { PipelineRun, PipelineStepInfo, PipelineType, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PipelineStore } from '../../core/pipeline-store';
import { errorText, runName } from './run-status';

@Component({
  selector: 'ds-start-pipeline-dialog',
  imports: [
    BannerComponent,
    ButtonDirective,
    DialogComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    TranslatePipe,
  ],
  templateUrl: './start-pipeline-dialog.component.html',
})
export class StartPipelineDialogComponent {
  readonly open = input<boolean>(false);
  readonly closed = output<void>();
  readonly started = output<PipelineRun>();

  protected readonly store: PipelineStore = inject(PipelineStore);
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly type = signal<PipelineType | null>(null);
  protected readonly failAt = signal<number | null>(null);
  protected readonly starting = signal<boolean>(false);
  protected readonly error = signal<string>('');

  protected readonly selectedInfo: Signal<PipelineTypeInfo | undefined> = computed(() => {
    const types: PipelineTypeInfo[] = this.store.types();
    return types.find((info) => info.type === this.type()) ?? types[0];
  });
  protected readonly steps: Signal<PipelineStepInfo[]> = computed(() => this.selectedInfo()?.steps ?? []);
  protected readonly backendStep: Signal<number> = computed(() => this.steps().findIndex((step) => step.backend) + 1);
  protected readonly runningName: Signal<string> = computed(() => {
    const running: PipelineRun | undefined = this.store.active().runs.find((run) => run.status === 'running');
    return running ? runName(running, this.i18n) : '';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.type.set(null);
      this.failAt.set(null);
      this.error.set('');
    });
  }

  protected typeName(type: PipelineType): string {
    return this.i18n.t(`run.type.${type}`);
  }

  protected selectType(value: string): void {
    this.type.set(value as PipelineType);
    this.failAt.set(null);
  }

  protected selectFailAt(value: string): void {
    this.failAt.set(value ? Number(value) : null);
  }

  protected async start(): Promise<void> {
    const info: PipelineTypeInfo | undefined = this.selectedInfo();
    if (!info) return;
    this.starting.set(true);
    this.error.set('');
    try {
      const run: PipelineRun | null = await this.store.start({ type: info.type, failAtStep: this.failAt() });
      if (run) this.started.emit(run);
      this.closed.emit();
    } catch (error) {
      this.error.set(errorText(error, this.i18n));
    } finally {
      this.starting.set(false);
    }
  }
}
