import { afterNextRender } from '@angular/core';
import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { effect } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import { untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { CHAPTER_ERROR_KEYS } from '../library-format';
import { chapterRef } from '../library-format';
import { toParagraphs } from '../library-format';
import { CHAPTER_TITLE_MAX } from '@dreamer/shared/models/novel';
import type { ChapterRef } from '@dreamer/shared/models/novel';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { ChapterChangeError } from '../library.models';
import type { LibraryChapter } from '../library.models';
import { NovelStore } from '../novel.store';
import { TranslationStore } from '../translation.store';
import type { ChapterTranslation } from '@dreamer/shared/models/translation';
import type { TargetLanguage } from '@dreamer/shared/models/translation';
import type { ChapterTextState } from '../novel.store';

@Component({
  selector: 'ds-chapter-editor',
  imports: [BannerComponent, ButtonDirective, FieldComponent, IconComponent, PillComponent, TranslatePipe],
  host: { class: 'library-chapter-editor', 'data-testid': 'chapter-editor' },
  templateUrl: './chapter-editor.component.html',
})
export class ChapterEditorComponent {
  readonly novel = input.required<NovelDetail>();
  readonly chapter = input.required<LibraryChapter>();
  readonly mode = input<'original' | 'translation'>('original');
  readonly done = output<void>();
  readonly cancelled = output<void>();

  private readonly store: NovelStore = inject(NovelStore);
  protected readonly translationStore: TranslationStore = inject(TranslationStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly saved = signal<string[]>([]);
  private readonly opened = signal<LibraryChapter | null>(null);
  private readonly translationOpened = signal<ChapterTranslation | null>(null);
  private readonly translationReady = signal(false);
  private readonly translationSaved = signal<string[]>([]);
  private readonly translationSavedTitle = signal('');
  private readonly ready: Signal<boolean> = computed(() => !!this.opened());

  protected readonly titleMax: number = CHAPTER_TITLE_MAX;
  protected readonly title = signal<string>('');
  protected readonly content = signal<string>('');
  protected readonly translationValues = signal<string[]>([]);
  protected readonly titleRequired = signal<boolean>(false);
  protected readonly contentRequired = signal<boolean>(false);
  protected readonly error = signal<ChapterChangeError | null>(null);
  protected readonly errorKey: Signal<string> = computed(() => {
    const error: ChapterChangeError | null = this.error();
    return error ? CHAPTER_ERROR_KEYS[error] : '';
  });
  protected readonly text: Signal<ChapterTextState> = computed(() => this.store.text(this.chapter()));
  protected readonly sourceParagraphs = computed<string[]>(() => {
    const text: ChapterTextState = this.text();
    return text.status === 'ready' ? text.paragraphs : [];
  });
  protected readonly editable: Signal<boolean> = this.ready;
  protected readonly changing: Signal<boolean> = this.store.changing;
  protected readonly paragraphCount: Signal<number> = computed(() => toParagraphs(this.content()).length);
  protected readonly translationParagraphs = computed(() => this.translationValues().map((value) => value.trim()));
  protected readonly hasTranslationContent = computed(
    () => !!this.title().trim() || this.translationParagraphs().some((paragraph) => !!paragraph),
  );
  protected readonly translation = computed<ChapterTranslation | null>(() => {
    const chapter: ChapterTranslation | null = this.translationStore.chapter();
    return chapter?.file === this.chapter().file &&
      this.translationStore.chapterFile() === this.chapter().file &&
      chapter.language === this.translationStore.language()
      ? chapter
      : null;
  });
  protected readonly language = computed<TargetLanguage | null>(() => this.translationStore.language());
  protected readonly manualTranslation = computed(() => this.noTranslation(this.translationOpened()));
  protected readonly rows = computed(() => {
    const text: ChapterTextState = this.text();
    return Array.from(
      { length: Math.max(text.status === 'ready' ? text.paragraphs.length : 0, this.translationValues().length) },
      (_: unknown, index: number): number => index,
    );
  });
  protected readonly translationError = signal<string>('');
  protected readonly translationErrorMessage = computed(() => {
    const error: string = this.translationError();
    const key: string = `errors.${error}.message`;
    return this.i18n.has(key) ? this.i18n.t(key) : error;
  });
  readonly dirty: Signal<boolean> = computed(() =>
    this.mode() === 'translation'
      ? this.translationReady() &&
        (this.title().trim() !== this.translationSavedTitle() ||
          this.translationParagraphs().join('\n') !== this.translationSaved().join('\n'))
      : this.ready() &&
        (this.title().trim() !== this.opened()?.title ||
          toParagraphs(this.content()).join('\n') !== this.saved().join('\n')),
  );

  constructor() {
    afterNextRender(() =>
      this.host
        .querySelector<HTMLInputElement>(
          this.mode() === 'translation' ? '#translation-editor-title' : '#chapter-editor-title',
        )
        ?.focus(),
    );
    effect(() => {
      const chapter: LibraryChapter = this.chapter();
      untracked(() => this.store.ensure(chapter));
      const text: ChapterTextState = this.text();
      if (this.mode() === 'translation' || this.ready() || text.status !== 'ready') return;
      untracked(() => {
        this.saved.set(text.paragraphs);
        this.title.set(chapter.title);
        this.content.set(text.paragraphs.join('\n'));
        this.opened.set(chapter);
      });
    });
    effect(() => {
      if (this.mode() !== 'translation' || this.translationReady()) return;
      const chapter: ChapterTranslation | null = this.translation();
      const text: ChapterTextState = this.text();
      if (text.status !== 'ready' || !this.translationStore.language()) return;
      const status = this.translationStore.chapterStatus(this.chapter().position)?.status;
      if (!chapter && status !== 'not-translated' && status !== 'failed') return;
      untracked(() => {
        const paragraphs = this.noTranslation(chapter) ? [] : chapter!.paragraphs;
        this.translationValues.set([
          ...paragraphs,
          ...Array(Math.max(0, text.paragraphs.length - paragraphs.length)).fill(''),
        ]);
        this.translationSaved.set(this.translationParagraphs());
        this.title.set(paragraphs.length ? (chapter?.title ?? '') : '');
        this.translationSavedTitle.set(this.title().trim());
        this.translationOpened.set(chapter);
        this.translationReady.set(true);
      });
      requestAnimationFrame(() => this.host.querySelector<HTMLInputElement>('#translation-editor-title')?.focus());
    });
  }

  protected setTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
    this.titleRequired.set(false);
  }

  protected setContent(event: Event): void {
    this.content.set((event.target as HTMLTextAreaElement).value);
    this.contentRequired.set(false);
  }

  protected setTranslationParagraph(index: number, event: Event): void {
    const values: string[] = [...this.translationValues()];
    values[index] = (event.target as HTMLTextAreaElement).value;
    this.translationValues.set(values);
    this.contentRequired.set(false);
  }

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.mode() === 'translation') {
      if (!this.translationReady() || this.translationStore.busy() || !this.dirty() || !this.hasTranslationContent())
        return;
      const title: string = this.title().trim();
      const paragraphs: string[] = this.translationParagraphs();
      this.titleRequired.set(!title);
      this.contentRequired.set(!paragraphs.some((paragraph) => !!paragraph));
      if (this.titleRequired() || this.contentRequired()) return;
      const ok: boolean = await this.translationStore.saveTranslation(title, paragraphs);
      if (ok) {
        this.toast.show({ kind: 'success', title: this.i18n.t('library.translation.reader.editor.saved', { title }) });
        this.done.emit();
      } else this.translationError.set(this.translationStore.error());
      return;
    }
    if (!this.ready() || this.changing() || !this.dirty()) return;
    const title: string = this.title().trim();
    const paragraphs: string[] = toParagraphs(this.content());
    this.titleRequired.set(!title);
    this.contentRequired.set(!paragraphs.length);
    if (this.titleRequired() || this.contentRequired()) return;
    const error: ChapterChangeError | null = await this.store.change({
      kind: 'edit',
      chapter: this.editedRef(),
      title,
      paragraphs,
    });
    this.error.set(error);
    if (error) return;
    this.toast.show({ kind: 'success', title: this.i18n.t('library.chapterEditor.saved', { title }) });
    this.done.emit();
  }

  private editedRef(): ChapterRef {
    const opened: LibraryChapter = this.opened()!;
    const chapter: LibraryChapter = this.chapter();
    return chapterRef(chapter.file === opened.file ? chapter : opened);
  }

  private noTranslation(chapter: ChapterTranslation | null): boolean {
    return (
      !chapter || chapter.status === 'not-translated' || (chapter.status === 'failed' && !chapter.paragraphs.length)
    );
  }
}
