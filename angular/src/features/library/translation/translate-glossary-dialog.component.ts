import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { SegmentedComponent } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { GlossaryRunPlan } from '@dreamer/shared/models/translation';
import { GLOSSARY_BATCH_SIZES } from '@dreamer/shared/models/translation';
import type { GlossaryBatchSize } from '@dreamer/shared/models/translation';
import type { GlossaryScope } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import { TranslationStore } from '../translation.store';
import { InstructionEditorComponent } from './instruction-editor.component';

const BLOCKED_REASON_KEYS: Record<string, string> = {
  NOVEL_LOCKED: 'errors.NOVEL_LOCKED.message',
  LLM_UNAVAILABLE: 'library.translation.dialog.reasonNoLlm',
  TRANSLATION_NOTHING_TO_RUN: 'library.translation.dialog.reasonNothingGlossary',
  ANALYSIS_REQUIRED: 'library.translation.dialog.reasonNotAnalysed',
};

@Component({
  selector: 'ds-translate-glossary-dialog',
  imports: [
    ButtonDirective,
    DialogComponent,
    IconComponent,
    InstructionEditorComponent,
    RouterLink,
    SegmentedComponent,
    TranslatePipe,
  ],
  templateUrl: './translate-glossary-dialog.component.html',
})
export class TranslateGlossaryDialogComponent {
  protected readonly store = inject(TranslationStore);
  private readonly i18n = inject(I18nService);

  protected readonly scopes: { scope: GlossaryScope; title: string; hint: string }[] = [
    {
      scope: 'untranslated',
      title: 'library.translation.dialog.scopeUntranslated',
      hint: 'library.translation.dialog.scopeUntranslatedHint',
    },
    { scope: 'all', title: 'library.translation.dialog.scopeAll', hint: 'library.translation.dialog.scopeAllHint' },
  ];
  protected readonly open = computed(() => this.store.dialog()?.kind === 'glossary');
  protected readonly language = signal<TargetLanguage | null>(null);
  protected readonly languageOptions = computed(() =>
    this.store.targets().map((value) => ({ value, label: this.store.languageLabel(value) })),
  );
  protected readonly scope = signal<GlossaryScope>('untranslated');
  protected readonly batchSize = signal<GlossaryBatchSize>(50);
  protected readonly batchOptions = GLOSSARY_BATCH_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
    testId: `translate-dialog-batch-${size}`,
  }));
  protected readonly instruction = signal<string | null>(null);
  protected readonly plan = signal<GlossaryRunPlan | null>(null);
  protected readonly planning = signal(false);
  protected readonly startError = signal('');
  protected readonly reason = computed(() => {
    if (this.startError()) return this.startError();
    const blocked = this.plan()?.blockedReason;
    if (!blocked) return '';
    return BLOCKED_REASON_KEYS[blocked] ? this.i18n.t(BLOCKED_REASON_KEYS[blocked]) : blocked;
  });
  protected readonly canStart = computed(
    () => !!this.language() && !!this.plan() && !this.planning() && !this.reason(),
  );
  protected readonly llmLabel = computed(() => {
    const llm = this.store.status()?.llm.glossary;
    return llm?.available ? llm.label : this.i18n.t('library.translation.dialog.llmNone');
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
    effect((onCleanup) => {
      if (!this.open()) return;
      const language = this.language();
      const scope = this.scope();
      const batchSize = this.batchSize();
      const instruction = this.instruction();
      untracked(() => {
        this.planning.set(!!language);
        if (!language) this.plan.set(null);
      });
      if (!language) return;
      let active = true;
      void this.store
        .planGlossary(language, scope, batchSize, instruction)
        .then((plan) => {
          if (active) this.plan.set(plan);
        })
        .catch(() => {
          if (active) this.plan.set(null);
        })
        .finally(() => {
          if (active) this.planning.set(false);
        });
      onCleanup(() => {
        active = false;
      });
    });
  }

  protected setLanguage(value: string): void {
    if (this.store.targets().includes(value as TargetLanguage)) this.language.set(value as TargetLanguage);
    this.startError.set('');
  }

  protected setScope(scope: GlossaryScope): void {
    this.scope.set(scope);
    this.startError.set('');
  }

  protected setBatchSize(value: string): void {
    const size = Number(value) as GlossaryBatchSize;
    if (GLOSSARY_BATCH_SIZES.includes(size)) this.batchSize.set(size);
    this.startError.set('');
  }

  protected setInstruction(value: string | null): void {
    this.instruction.set(value);
    this.startError.set('');
  }

  protected close(): void {
    if (this.open()) this.store.closeDialog();
  }

  protected async start(): Promise<void> {
    if (!this.canStart()) return;
    const language = this.language();
    if (!language) return;
    if (!(await this.store.startGlossary(language, this.scope(), this.batchSize(), this.instruction())))
      this.startError.set(this.store.error());
  }

  private reset(): void {
    this.language.set(this.store.language());
    this.scope.set('untranslated');
    this.batchSize.set(50);
    this.instruction.set(null);
    this.plan.set(null);
    this.startError.set('');
  }
}
