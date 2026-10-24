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
  readonly done = output<void>();
  readonly cancelled = output<void>();

  private readonly store: NovelStore = inject(NovelStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly saved = signal<string[]>([]);
  private readonly opened = signal<LibraryChapter | null>(null);
  private readonly ready: Signal<boolean> = computed(() => !!this.opened());

  protected readonly titleMax: number = CHAPTER_TITLE_MAX;
  protected readonly title = signal<string>('');
  protected readonly content = signal<string>('');
  protected readonly titleRequired = signal<boolean>(false);
  protected readonly contentRequired = signal<boolean>(false);
  protected readonly error = signal<ChapterChangeError | null>(null);
  protected readonly errorKey: Signal<string> = computed(() => {
    const error: ChapterChangeError | null = this.error();
    return error ? CHAPTER_ERROR_KEYS[error] : '';
  });
  protected readonly text: Signal<ChapterTextState> = computed(() => this.store.text(this.chapter()));
  protected readonly editable: Signal<boolean> = this.ready;
  protected readonly changing: Signal<boolean> = this.store.changing;
  protected readonly paragraphCount: Signal<number> = computed(() => toParagraphs(this.content()).length);
  readonly dirty: Signal<boolean> = computed(
    () =>
      this.ready() &&
      (this.title().trim() !== this.opened()?.title ||
        toParagraphs(this.content()).join('\n') !== this.saved().join('\n')),
  );

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('#chapter-editor-title')?.focus());
    effect(() => {
      const chapter: LibraryChapter = this.chapter();
      untracked(() => this.store.ensure(chapter));
      const text: ChapterTextState = this.text();
      if (this.ready() || text.status !== 'ready') return;
      untracked(() => {
        this.saved.set(text.paragraphs);
        this.title.set(chapter.title);
        this.content.set(text.paragraphs.join('\n'));
        this.opened.set(chapter);
      });
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

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
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
}
