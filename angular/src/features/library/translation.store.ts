import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { DesktopApi } from '@core/desktop-api';
import { I18nService } from '@core/i18n/i18n.service';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { ChapterTranslation } from '@dreamer/shared/models/translation';
import type { ChapterTranslationSummary } from '@dreamer/shared/models/translation';
import type { ContentRunOptions } from '@dreamer/shared/models/translation';
import type { ContentRunPlan } from '@dreamer/shared/models/translation';
import type { GlossaryKey } from '@dreamer/shared/models/translation';
import type { GlossaryBatchSize } from '@dreamer/shared/models/translation';
import type { GlossaryPage } from '@dreamer/shared/models/translation';
import type { GlossaryRunPlan } from '@dreamer/shared/models/translation';
import type { GlossaryScope } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import type { TranslationDisplay } from '@dreamer/shared/models/translation';
import type { TranslationInstruction } from '@dreamer/shared/models/translation';
import type { TranslationIssue } from '@dreamer/shared/models/translation';
import type { TranslationProgress } from '@dreamer/shared/models/translation';
import type { TranslationStatus } from '@dreamer/shared/models/translation';
import type { TranslationView } from '@dreamer/shared/models/translation';

export type TranslationDialog = { kind: 'glossary' } | { kind: 'content'; preset: ContentRunOptions | null };

@Injectable()
export class TranslationStore {
  private readonly api = inject(DesktopApi);
  private readonly i18n = inject(I18nService);
  private readonly progressValue = signal<TranslationProgress | null>(null);
  private readonly languageChoice = signal<TargetLanguage | null>(null);
  private statusRequest = 0;
  private chapterRequest = 0;
  private glossaryRequest = 0;
  private instructionRequest = 0;

  readonly novelId: WritableSignal<string> = signal('');
  readonly chapterFile: WritableSignal<string | null> = signal(null);
  readonly view: WritableSignal<TranslationView> = signal('reader');
  readonly display: WritableSignal<TranslationDisplay> = signal('original');
  readonly language: Signal<TargetLanguage | null> = computed(
    () => this.languageChoice() ?? this.status()?.targets[0] ?? null,
  );
  readonly status: WritableSignal<TranslationStatus | null> = signal(null);
  readonly chapter: WritableSignal<ChapterTranslation | null> = signal(null);
  readonly glossary: WritableSignal<GlossaryPage | null> = signal(null);
  readonly instruction: WritableSignal<TranslationInstruction | null> = signal(null);
  readonly selectedIssue: WritableSignal<string | null> = signal(null);
  readonly dialog: WritableSignal<TranslationDialog | null> = signal(null);
  readonly busy: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string> = signal('');
  readonly run = computed(() => this.progressValue()?.run ?? this.status()?.run ?? null);
  readonly running = computed(() => this.run() !== null);
  readonly targets = computed(() => this.status()?.targets ?? []);
  readonly issues: Signal<TranslationIssue[]> = computed(() => this.chapter()?.issueList ?? []);

  constructor() {
    effect(() => {
      if (this.view() === 'glossary') void this.loadGlossary();
    });
    const offProgress =
      this.api.onTranslationProgress?.((progress) => {
        if (progress.novelId !== this.novelId()) return;
        this.progressValue.set(progress);
        void this.reload();
      }) ?? (() => undefined);
    const offChanged =
      this.api.onTranslationChanged?.((event) => {
        if (event.novelId === this.novelId()) {
          void this.reload();
          if (this.view() !== 'glossary') void this.loadGlossary();
        }
      }) ?? (() => undefined);
    inject(DestroyRef).onDestroy(() => {
      this.statusRequest++;
      this.chapterRequest++;
      this.glossaryRequest++;
      this.instructionRequest++;
      offProgress();
      offChanged();
    });
  }

  async open(novelId: string): Promise<void> {
    if (novelId === this.novelId()) return;
    this.novelId.set(novelId);
    this.view.set('reader');
    this.display.set('original');
    this.languageChoice.set(null);
    this.status.set(null);
    this.chapter.set(null);
    this.glossary.set(null);
    this.instruction.set(null);
    this.progressValue.set(null);
    this.selectedIssue.set(null);
    this.dialog.set(null);
    await this.reload();
  }

  setChapter(file: string | null): void {
    if (file === this.chapterFile()) return;
    this.chapterFile.set(file);
    this.selectedIssue.set(null);
    this.chapter.set(null);
    void this.loadChapter();
  }

  setLanguage(language: TargetLanguage): void {
    if (language === this.language()) return;
    this.languageChoice.set(language);
    this.chapter.set(null);
    this.glossary.set(null);
    this.instruction.set(null);
    void this.reload();
  }

  setView(view: TranslationView): void {
    this.view.set(view);
    if (view === 'glossary') void this.loadGlossary();
  }

  chapterStatus(index: number): ChapterTranslationSummary | null {
    return this.status()?.chapters.find((item) => item.index === index) ?? null;
  }

  languageLabel(language: TargetLanguage): string {
    return this.i18n.t(`library.translation.language.${language}`);
  }

  selectIssue(id: string | null): void {
    this.selectedIssue.set(id);
  }

  openGlossaryDialog(): void {
    this.dialog.set({ kind: 'glossary' });
  }

  openContentDialog(preset: ContentRunOptions | null = null): void {
    this.dialog.set({ kind: 'content', preset });
  }

  openChapterDialog(index: number, overwrite: boolean): void {
    const language = this.language();
    if (!language) return;
    this.openContentDialog({ language, mode: 'range', from: index, to: index, overwrite });
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  async reload(): Promise<void> {
    const novelId = this.novelId();
    const request = ++this.statusRequest;
    if (!novelId) {
      this.status.set(null);
      return;
    }
    try {
      const status = (await this.api.translationStatus?.({ novelId, language: this.languageChoice() })) ?? null;
      if (request !== this.statusRequest) return;
      this.status.set(status);
      this.error.set('');
      await Promise.all([
        this.loadChapter(),
        this.loadInstruction(),
        this.view() === 'glossary' ? this.loadGlossary() : Promise.resolve(),
      ]);
    } catch (error) {
      if (request === this.statusRequest) this.error.set(errorMessage(error));
    }
  }

  async loadChapter(): Promise<void> {
    const novelId = this.novelId();
    const language = this.language();
    const file = this.chapterFile();
    const request = ++this.chapterRequest;
    if (!novelId || !language || !file) {
      this.chapter.set(null);
      return;
    }
    const chapter = await this.api.translationChapter({ novelId, language, file });
    if (request === this.chapterRequest) this.chapter.set(chapter);
  }

  async loadGlossary(): Promise<void> {
    const novelId = this.novelId();
    const language = this.language();
    const request = ++this.glossaryRequest;
    if (!novelId || !language) return;
    const glossary = await this.api.translationGlossary({ novelId, language });
    if (request === this.glossaryRequest) this.glossary.set(glossary);
  }

  async loadInstruction(): Promise<void> {
    const novelId = this.novelId();
    const language = this.language();
    const request = ++this.instructionRequest;
    if (!novelId || !language) return;
    const instruction = await this.api.translationInstruction({ novelId, language });
    if (request === this.instructionRequest) this.instruction.set(instruction);
  }

  async planContent(options: ContentRunOptions, instruction: string | null): Promise<ContentRunPlan | null> {
    const novelId = this.novelId();
    return novelId ? this.api.translationPlanContent({ ...options, novelId, instruction }) : null;
  }

  startContent(options: ContentRunOptions, instruction: string | null): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.translationStartContent({ ...options, novelId, instruction });
      this.closeDialog();
      await this.reload();
    });
  }

  async planGlossary(
    language: TargetLanguage,
    scope: GlossaryScope,
    batchSize: GlossaryBatchSize,
    instruction: string | null,
  ): Promise<GlossaryRunPlan | null> {
    const novelId = this.novelId();
    return novelId ? this.api.translationPlanGlossary({ novelId, language, scope, batchSize, instruction }) : null;
  }

  startGlossary(
    language: TargetLanguage,
    scope: GlossaryScope,
    batchSize: GlossaryBatchSize,
    instruction: string | null,
  ): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.translationStartGlossary({ novelId, language, scope, batchSize, instruction });
      this.closeDialog();
      await this.reload();
    });
  }

  cancel(): Promise<boolean> {
    return this.mutate(async (novelId) => {
      await this.api.translationCancel(novelId);
      await this.reload();
    });
  }

  editGlossary(key: GlossaryKey, translation: string | null): Promise<boolean> {
    return this.mutate(async (novelId) => {
      const language = this.language();
      if (!language) return;
      await this.api.translationEditGlossary({ novelId, language, key, translation });
      await Promise.all([this.reload(), this.loadGlossary()]);
    });
  }

  saveInstruction(text: string): Promise<boolean> {
    return this.mutate(async (novelId) => {
      const language = this.language();
      if (!language) return;
      this.instruction.set(await this.api.translationSaveInstruction({ novelId, language, text }));
    });
  }

  resetInstruction(): Promise<boolean> {
    return this.mutate(async (novelId) => {
      const language = this.language();
      if (!language) return;
      this.instruction.set(await this.api.translationResetInstruction({ novelId, language }));
    });
  }

  saveTranslation(title: string, paragraphs: string[]): Promise<boolean> {
    return this.mutate(async (novelId) => {
      const language = this.language();
      const file = this.chapterFile();
      if (!language || !file) return;
      this.chapter.set(await this.api.translationSave({ novelId, language, file, title, paragraphs }));
      await this.reload();
    });
  }

  private async mutate(action: (novelId: string) => Promise<void>): Promise<boolean> {
    const novelId = this.novelId();
    if (!novelId || this.busy()) return false;
    this.busy.set(true);
    try {
      await action(novelId);
      this.error.set('');
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
