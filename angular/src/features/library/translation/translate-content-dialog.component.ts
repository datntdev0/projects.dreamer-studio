import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { SegmentedComponent } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { ContentRunOptions } from '@dreamer/shared/models/translation';
import type { ContentRunPlan } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import type { TranslationRunMode } from '@dreamer/shared/models/translation';
import { TranslationStore } from '../translation.store';
import { InstructionEditorComponent } from './instruction-editor.component';

const BLOCKED_REASON_KEYS: Record<string, string> = {
  NOVEL_LOCKED: 'errors.NOVEL_LOCKED.message',
  LLM_UNAVAILABLE: 'library.translation.dialog.reasonNoLlm',
  TRANSLATION_NOTHING_TO_RUN: 'library.translation.dialog.reasonNothingContent',
  ANALYSIS_REQUIRED: 'library.translation.dialog.reasonNotAnalysed',
};

@Component({
  selector: 'ds-translate-content-dialog',
  imports: [
    ButtonDirective,
    DialogComponent,
    IconComponent,
    InstructionEditorComponent,
    RouterLink,
    SegmentedComponent,
    TranslatePipe,
  ],
  templateUrl: './translate-content-dialog.component.html',
})
export class TranslateContentDialogComponent {
  protected readonly store = inject(TranslationStore);
  private readonly i18n = inject(I18nService);

  protected readonly modes: { mode: TranslationRunMode; title: string; hint: string }[] = [
    { mode: 'missing', title: 'library.translation.dialog.missing', hint: 'library.translation.dialog.missingHint' },
    { mode: 'range', title: 'library.translation.dialog.range', hint: 'library.translation.dialog.rangeHint' },
    { mode: 'full', title: 'library.translation.dialog.full', hint: 'library.translation.dialog.fullHint' },
  ];
  protected readonly open = computed(() => this.store.dialog()?.kind === 'content');
  protected readonly total = computed(() => this.store.status()?.chapters.length ?? 0);
  protected readonly language = signal<TargetLanguage | null>(null);
  protected readonly languageOptions = computed(() =>
    this.store.targets().map((value) => ({ value, label: this.store.languageLabel(value) })),
  );
  protected readonly mode = signal<TranslationRunMode>('missing');
  protected readonly from = signal(1);
  protected readonly to = signal(1);
  protected readonly overwrite = signal(false);
  protected readonly instruction = signal<string | null>(null);
  protected readonly plan = signal<ContentRunPlan | null>(null);
  protected readonly planning = signal(false);
  protected readonly startError = signal('');

  protected readonly options = computed<ContentRunOptions>(() => ({
    language: this.language()!,
    mode: this.mode(),
    from: this.mode() === 'range' ? this.from() : null,
    to: this.mode() === 'range' ? this.to() : null,
    overwrite: this.mode() !== 'missing' && this.overwrite(),
  }));
  protected readonly invalidRange = computed(() => {
    const [from, to] = [this.from(), this.to()];
    const valid = Number.isInteger(from) && Number.isInteger(to) && 1 <= from && from <= to && to <= this.total();
    return this.mode() === 'range' && !valid;
  });
  protected readonly reason = computed(() => {
    if (this.startError()) return this.startError();
    if (this.invalidRange())
      return this.i18n.t('library.translation.dialog.reasonInvalidRange', { total: this.total() });
    const blocked = this.plan()?.blockedReason;
    if (!blocked) return '';
    return BLOCKED_REASON_KEYS[blocked] ? this.i18n.t(BLOCKED_REASON_KEYS[blocked]) : blocked;
  });
  protected readonly canStart = computed(
    () => !!this.language() && !!this.plan() && !this.planning() && !this.reason(),
  );
  protected readonly llmLabel = computed(() => {
    const llm = this.store.status()?.llm.content;
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
      const options = this.options();
      const instruction = this.instruction();
      const invalid = this.invalidRange();
      untracked(() => {
        this.planning.set(!!language && !invalid);
        if (!language || invalid) this.plan.set(null);
      });
      if (!language || invalid) return;
      let active = true;
      void this.store
        .planContent(options, instruction)
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

  protected setMode(mode: TranslationRunMode): void {
    this.mode.set(mode);
    this.startError.set('');
  }

  protected setNumber(target: 'from' | 'to', event: Event): void {
    this[target].set(Number((event.target as HTMLInputElement).value));
    this.startError.set('');
  }

  protected setOverwrite(event: Event): void {
    this.overwrite.set((event.target as HTMLInputElement).checked);
    this.startError.set('');
  }

  protected setInstruction(value: string | null): void {
    this.instruction.set(value);
    this.startError.set('');
  }

  protected openGlossary(): void {
    this.store.closeDialog();
    this.store.setView('glossary');
  }

  protected close(): void {
    if (this.open()) this.store.closeDialog();
  }

  protected async start(): Promise<void> {
    if (!this.canStart()) return;
    if (!(await this.store.startContent(this.options(), this.instruction()))) this.startError.set(this.store.error());
  }

  private reset(): void {
    const dialog = this.store.dialog();
    const preset = dialog?.kind === 'content' ? dialog.preset : null;
    this.language.set(preset?.language ?? this.store.language());
    this.mode.set(preset?.mode ?? 'missing');
    this.from.set(preset?.from ?? 1);
    this.to.set(preset?.to ?? this.total());
    this.overwrite.set(preset?.overwrite ?? false);
    this.instruction.set(null);
    this.plan.set(null);
    this.startError.set('');
  }
}
