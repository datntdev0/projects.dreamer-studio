import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { DesktopApi } from '@core/desktop-api';
import { formatDateTime } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CurrentNovelStore } from '@core/stores/current-novel-store';
import type { TargetLanguage, TranslationInstruction } from '@dreamer/shared/models/translation';
import { TranslationStore } from '../translation.store';

@Component({
  selector: 'ds-instruction-editor',
  imports: [ButtonDirective, IconComponent, PillComponent, TranslatePipe],
  templateUrl: './instruction-editor.component.html',
  host: {
    '[class.is-dialog]': 'mode() === "dialog"',
    '[attr.data-testid]': 'mode() === "panel" ? "instruction-panel" : "instruction-dialog"',
  },
})
export class InstructionEditorComponent {
  private static nextExpandedId = 0;
  readonly mode = input<'panel' | 'dialog'>('panel');
  readonly language = input.required<TargetLanguage>();
  readonly draftChange = output<string | null>();
  protected readonly expandedId = `instruction-expanded-${++InstructionEditorComponent.nextExpandedId}`;
  protected readonly store = inject(TranslationStore);
  private readonly api = inject(DesktopApi);
  private readonly i18n = inject(I18nService);
  private readonly novelStore = inject(CurrentNovelStore);
  private readonly confirm = inject(ConfirmService);
  private readonly localInstructions = signal<Map<string, TranslationInstruction>>(new Map());
  protected readonly draft = signal('');
  protected readonly expanded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly announcement = signal('');
  protected readonly instruction = computed(() => {
    const language = this.language();
    const stored = this.store.instruction();
    const cached = this.localInstructions().get(`${this.store.novelId()}:${language}`);
    return stored?.language === language ? stored : (cached ?? null);
  });
  protected readonly dirty = computed(() => this.draft() !== (this.instruction()?.text ?? ''));
  protected readonly locked = computed(() => this.novelStore.novel()?.lock != null || this.store.running());
  protected readonly lockReason = computed(() =>
    this.i18n.t(this.store.running() ? 'library.translation.glossary.runningReason' : 'errors.NOVEL_LOCKED.message'),
  );
  protected readonly canSave = computed(
    () => this.dirty() && !!this.draft().trim() && !this.locked() && !this.busy() && !this.store.busy(),
  );
  protected readonly updated = computed(() => {
    const time = this.instruction()?.updatedAt;
    return time
      ? this.i18n.t('library.translation.glossary.instruction.updated', {
          time: formatDateTime(time, this.i18n.language()),
        })
      : this.i18n.t('library.translation.glossary.instruction.defaultInstruction');
  });
  private request = 0;
  private lastInstructionSignature: string | null = null;
  private lastInstructionText: string | null = null;

  constructor() {
    effect((onCleanup) => {
      const language = this.language();
      const stored = this.store.instruction();
      if (stored?.language === language) return;
      const novelId = this.store.novelId();
      const key = `${novelId}:${language}`;
      if (this.localInstructions().has(key)) return;
      const request = ++this.request;
      if (novelId)
        void this.api
          .translationInstruction({ novelId, language })
          .then((instruction) => {
            if (this.request !== request) return;
            if (instruction) this.localInstructions.update((items) => new Map(items).set(key, instruction));
            else this.error.set(this.i18n.t('library.translation.glossary.instruction.loadFailed'));
          })
          .catch(() => {
            if (this.request === request)
              this.error.set(this.i18n.t('library.translation.glossary.instruction.loadFailed'));
          });
      onCleanup(() => {
        this.request++;
      });
    });
    effect(() => {
      const instruction = this.instruction();
      if (!instruction) return;
      const signature = `${instruction.novelId}:${instruction.language}:${instruction.updatedAt}:${instruction.isDefault}`;
      untracked(() => {
        if (
          signature !== this.lastInstructionSignature ||
          instruction.text !== this.lastInstructionText ||
          this.draft() === instruction.text
        ) {
          this.draft.set(instruction.text);
          this.error.set('');
          this.draftChange.emit(null);
        }
        this.lastInstructionSignature = signature;
        this.lastInstructionText = instruction.text;
      });
    });
  }

  protected setDraft(event: Event): void {
    const draft = (event.target as HTMLTextAreaElement).value;
    this.draft.set(draft);
    this.error.set('');
    if (this.mode() === 'dialog') this.draftChange.emit(draft === (this.instruction()?.text ?? '') ? null : draft);
  }

  protected discard(): void {
    this.draft.set(this.instruction()?.text ?? '');
    this.error.set('');
    if (this.mode() === 'dialog') this.draftChange.emit(null);
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && this.mode() === 'panel') {
      event.preventDefault();
      if (this.canSave()) void this.save();
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.busy.set(true);
    const success = await this.store.saveInstruction(this.draft().trim());
    this.busy.set(false);
    if (success) this.announcement.set(this.i18n.t('library.translation.glossary.instruction.saved'));
    else this.error.set(this.errorText(this.store.error()));
  }

  protected async reset(): Promise<void> {
    if (this.locked() || this.busy() || this.store.busy() || (this.instruction()?.isDefault && !this.dirty())) return;
    const language = this.store.languageLabel(this.language());
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('library.translation.glossary.instruction.resetTitle'),
      message: this.i18n.t('library.translation.glossary.instruction.resetMessage', { language }),
      confirmLabel: this.i18n.t('library.translation.glossary.instruction.resetConfirm'),
      cancelLabel: this.i18n.t('library.translation.glossary.instruction.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    this.busy.set(true);
    const success = await this.store.resetInstruction();
    this.busy.set(false);
    if (!success) this.error.set(this.errorText(this.store.error()));
  }

  private errorText(code: string): string {
    return code && this.i18n.has(`errors.${code}.message`)
      ? this.i18n.t(`errors.${code}.message`)
      : this.i18n.t('library.translation.glossary.instruction.saveFailed');
  }
}
