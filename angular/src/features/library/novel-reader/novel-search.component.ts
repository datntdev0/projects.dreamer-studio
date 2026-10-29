import { Component } from '@angular/core';
import { computed } from '@angular/core';
import { ElementRef } from '@angular/core';
import { inject } from '@angular/core';
import { input } from '@angular/core';
import { output } from '@angular/core';
import { signal } from '@angular/core';
import { viewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { BadgeComponent } from '@components/status/badge.component';
import { ConfirmService } from '@components/dialog/confirm.service';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { SearchChapterResult } from '../library.models';
import type { ChapterRef } from '@dreamer/shared/models/novel';
import type { NovelDetail } from '@dreamer/shared/models/novel';
import type { SearchHit } from '@dreamer/shared/models/novel';
import { NovelSearchStore } from '../novel-search.store';
import { NovelStore } from '../novel.store';
import { chapterRef } from '../library-format';

export interface NovelSearchSelection {
  hit: SearchHit;
  query: string;
  occurrence: number;
}

@Component({
  selector: 'ds-novel-search',
  imports: [AreaStateComponent, BadgeComponent, ButtonDirective, IconComponent, TooltipDirective, TranslatePipe],
  host: { class: 'library-novel-search', 'data-testid': 'novel-search' },
  templateUrl: './novel-search.component.html',
})
export class NovelSearchComponent {
  readonly novel = input.required<NovelDetail>();
  readonly selected = output<NovelSearchSelection>();

  private readonly i18n: I18nService = inject(I18nService);
  private readonly novelStore: NovelStore = inject(NovelStore);
  private readonly confirm: ConfirmService = inject(ConfirmService);
  private readonly toast: ToastService = inject(ToastService);
  protected readonly search: NovelSearchStore = inject(NovelSearchStore);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly value = this.search.value;
  protected readonly collapsed = signal<Set<string>>(new Set());
  protected readonly running: Signal<boolean> = this.search.running;
  protected readonly done: Signal<number> = this.search.done;
  protected readonly total: Signal<number> = this.search.total;
  protected readonly results: Signal<SearchChapterResult[]> = this.search.results;
  protected readonly count: Signal<number> = this.search.totalHits;
  protected readonly chapterCount: Signal<number> = this.search.totalChapters;
  protected readonly replaceOpen = signal<boolean>(false);
  protected readonly replacement = signal<string>('');
  protected readonly replaceReason: Signal<string> = computed(() =>
    this.novel().lock ? this.i18n.t('library.chapters.error.locked') : '',
  );
  protected readonly canReplace: Signal<boolean> = computed(
    () => this.search.complete() && this.count() > 0 && !this.replaceReason() && !this.novelStore.changing(),
  );

  focus(): void {
    this.searchInput()?.nativeElement.focus();
  }

  protected setValue(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.run();
    }
  }

  protected run(): void {
    this.collapsed.set(new Set());
    this.search.start(this.novel().id, this.value());
  }

  protected clear(): void {
    this.collapsed.set(new Set());
    this.search.clear();
    this.focus();
  }

  protected stop(): void {
    this.search.cancel();
  }

  protected toggle(chapterId: string): void {
    this.collapsed.update((collapsed: Set<string>): Set<string> => {
      const next: Set<string> = new Set(collapsed);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  protected isCollapsed(chapterId: string): boolean {
    return this.collapsed().has(chapterId);
  }

  protected select(hit: SearchHit): void {
    const group: SearchChapterResult | undefined = this.results().find(
      (result: SearchChapterResult): boolean =>
        result.chapter.position === hit.position && result.chapter.file === hit.file,
    );
    const occurrence: number =
      group?.hits
        .slice(0, group.hits.indexOf(hit))
        .filter((earlier: SearchHit): boolean => earlier.paragraph === hit.paragraph).length ?? 0;
    this.selected.emit({ hit, query: this.search.query(), occurrence });
  }

  protected toggleReplace(): void {
    this.replaceOpen.update((open: boolean): boolean => !open);
  }

  protected setReplacement(event: Event): void {
    this.replacement.set((event.target as HTMLInputElement).value);
  }

  protected replaceAll(): Promise<void> {
    const chapters: ChapterRef[] = this.novel().chapters.map(({ position, file }): ChapterRef => ({ position, file }));
    return this.replace(chapters, this.count(), this.chapterCount());
  }

  protected replaceIn(group: SearchChapterResult): Promise<void> {
    return this.replace([chapterRef(group.chapter)], group.hits.length, 1);
  }

  private async replace(chapters: ChapterRef[], count: number, chapterCount: number): Promise<void> {
    if (!this.canReplace()) return;
    const query: string = this.search.query();
    const replacement: string = this.replacement();
    const params = { count: this.countText(count), chapters: this.countText(chapterCount), query, replacement };
    const confirmed: boolean = await this.confirm.confirm({
      title: this.i18n.t('library.search.replace.confirmTitle'),
      message: this.i18n.t('library.search.replace.confirmMessage', params),
      confirmLabel: this.i18n.t('library.search.replace.confirm'),
      cancelLabel: this.i18n.t('library.search.replace.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    const error = await this.novelStore.change({ kind: 'replace', chapters, query, replacement });
    if (error) {
      this.toast.show({
        kind: 'danger',
        title: this.i18n.t('library.chapters.error.title'),
        message: this.i18n.t(`library.chapters.error.${error}`),
      });
      return;
    }
    this.toast.show({ kind: 'success', title: this.i18n.t('library.search.replace.done', params) });
  }

  protected countText(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }
}
