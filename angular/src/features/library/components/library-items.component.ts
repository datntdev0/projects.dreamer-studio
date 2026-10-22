import { Component, computed, inject, input, model, output, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { TranslateParams } from '@dreamer/shared/i18n/translate';
import { formatDateTime } from '../../../core/format';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { ImportState, LibraryNovel, LibraryView } from '../library.models';
import { toggled } from '../library-format';
import { LibraryStore } from '../library.store';
import { LibraryCoverComponent } from './library-cover.component';

@Component({
  selector: 'ds-library-items',
  imports: [
    ButtonDirective,
    CheckboxComponent,
    IconComponent,
    LibraryCoverComponent,
    PillComponent,
    ProgressComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  host: { class: 'library-items', 'data-testid': 'library-items', '[attr.data-view]': 'view()' },
  templateUrl: './library-items.component.html',
})
export class LibraryItemsComponent {
  readonly novels = input.required<LibraryNovel[]>();
  readonly view = input.required<LibraryView>();
  readonly active = input<string | null>(null);
  readonly selected = model<string[]>([]);
  readonly activate = output<string>();
  readonly open = output<string>();
  readonly delete = output<LibraryNovel>();
  protected readonly store: LibraryStore = inject(LibraryStore);
  private readonly i18n: I18nService = inject(I18nService);
  protected readonly importState: Signal<ImportState> = this.store.importState;
  protected readonly importBusy: Signal<boolean> = computed(() =>
    ['importing', 'paused', 'queued'].includes(this.importState()),
  );

  protected readonly allSelected: Signal<boolean> = computed(
    () => !!this.novels().length && this.novels().every((novel) => this.selected().includes(novel.id)),
  );

  protected isSelected(novel: LibraryNovel): boolean {
    return this.selected().includes(novel.id);
  }

  protected toggle(novel: LibraryNovel): void {
    this.selected.update((ids: string[]) => toggled(ids, novel.id));
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? [] : this.novels().map((novel) => novel.id));
  }

  protected count(value: number): string {
    return new Intl.NumberFormat(this.i18n.language()).format(value);
  }

  protected chapters(novel: LibraryNovel): string {
    const value =
      novel.id === 'n-0006' && this.importBusy()
        ? `${this.count(312)} / ${this.count(novel.chapterCount)}`
        : novel.id === 'n-0006' && this.importState() === 'incomplete'
          ? this.count(312)
          : this.count(novel.chapterCount);
    return this.i18n.t('library.mock.chaptersShort', { count: value });
  }

  protected percent(done: number, total: number): number {
    return total ? Math.round((100 * done) / total) : 0;
  }

  protected canOpen(novel: LibraryNovel): boolean {
    return novel.id !== 'n-0006' || !this.importBusy();
  }

  protected openNovel(novel: LibraryNovel): void {
    if (this.canOpen(novel)) this.open.emit(novel.id);
  }

  protected publicationKey(novel: LibraryNovel): string {
    return `library.mock.publication.${novel.publication}`;
  }

  protected tagKey(tag: string): string {
    return `library.mock.tag.${tag}`;
  }

  protected taskKey(novel: LibraryNovel): string {
    return novel.id === 'n-0006'
      ? `library.mock.import.${this.importState()}`
      : `library.mock.task.${novel.taskStatus}`;
  }

  protected taskKind(novel: LibraryNovel): 'neutral' | 'success' | 'info' | 'warning' {
    if (novel.id === 'n-0006' && this.importState() === 'queued') return 'neutral';
    const status = this.store.taskStatus(novel);
    return status === 'running' ? 'info' : status === 'completed' ? 'success' : 'warning';
  }

  protected listTaskKey(novel: LibraryNovel): string | null {
    if (novel.id === 'n-0006')
      return this.importState() === 'done' ? null : `library.mock.listImport.${this.importState()}`;
    if (novel.id === 'n-0001') return 'library.mock.listTask.translating';
    if (novel.id === 'n-0004') return 'library.mock.listTask.paused';
    return novel.taskStatus === 'completedEarly' ? 'library.mock.task.completedEarly' : null;
  }

  protected cardTask(
    novel: LibraryNovel,
  ): { key: string; icon: string; warning: boolean; params: TranslateParams } | null {
    if (novel.id === 'n-0006') {
      if (this.importState() === 'done') return null;
      const key = `library.mock.import.${this.importState()}`;
      return {
        key,
        icon: this.importState() === 'paused' ? 'pause' : 'download',
        warning: ['paused', 'incomplete'].includes(this.importState()),
        params: { done: '312', total: '746' },
      };
    }
    if (novel.id === 'n-0001')
      return { key: 'library.mock.translating', icon: 'languages', warning: false, params: {} };
    if (novel.id === 'n-0004')
      return { key: 'library.mock.translationPaused', icon: 'pause', warning: true, params: {} };
    return null;
  }

  protected shortDate(iso: string): string {
    return new Intl.DateTimeFormat('en', { month: '2-digit', day: '2-digit', timeZone: 'UTC' })
      .format(new Date(iso))
      .replace('/', '-');
  }

  protected fullDate(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }
}
