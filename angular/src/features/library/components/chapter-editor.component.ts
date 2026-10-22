import { afterNextRender } from '@angular/core';
import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import type { Signal } from '@angular/core';
import { BannerComponent } from '@components/banner/banner.component';
import { ButtonDirective } from '@components/button/button.directive';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ToastService } from '@components/toast/toast.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { toParagraphs } from '../library-format';
import type { ChapterChangeError } from '../library.models';
import type { LibraryChapter } from '../library.models';
import type { LibraryNovel } from '../library.models';
import { LibraryStore } from '../library.store';

@Component({
  selector: 'ds-chapter-editor',
  imports: [BannerComponent, ButtonDirective, FieldComponent, IconComponent, PillComponent, TranslatePipe],
  host: { class: 'library-chapter-editor', 'data-testid': 'chapter-editor' },
  templateUrl: './chapter-editor.component.html',
})
export class ChapterEditorComponent implements OnInit {
  readonly novel = input.required<LibraryNovel>();
  readonly chapter = input.required<LibraryChapter>();
  readonly done = output<void>();
  readonly cancelled = output<void>();

  private readonly store: LibraryStore = inject(LibraryStore);
  private readonly i18n: I18nService = inject(I18nService);
  private readonly toast: ToastService = inject(ToastService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly saved = signal<string[]>([]);

  protected readonly title = signal<string>('');
  protected readonly content = signal<string>('');
  protected readonly error = signal<ChapterChangeError | null>(null);
  protected readonly paragraphCount: Signal<number> = computed(() => toParagraphs(this.content()).length);
  readonly dirty: Signal<boolean> = computed(
    () =>
      this.title().trim() !== this.chapter().title ||
      toParagraphs(this.content()).join('\n') !== this.saved().join('\n'),
  );

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('#chapter-editor-title')?.focus());
  }

  ngOnInit(): void {
    const paragraphs: string[] = this.store.paragraphs(this.chapter());
    this.saved.set(paragraphs);
    this.title.set(this.chapter().title);
    this.content.set(paragraphs.join('\n\n'));
  }

  protected setTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected setContent(event: Event): void {
    this.content.set((event.target as HTMLTextAreaElement).value);
  }

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const title: string = this.title().trim();
    const error: ChapterChangeError | null = this.store.editChapter(
      this.novel().id,
      this.chapter().id,
      title,
      toParagraphs(this.content()),
    );
    this.error.set(error);
    if (error) return;
    this.toast.show({ kind: 'success', title: this.i18n.t('library.chapterEditor.saved', { title }) });
    this.done.emit();
  }
}
