import { Component, computed, inject, input, model, output, type Signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { IconComponent } from '@components/icon/icon.component';
import { PillComponent } from '@components/status/pill.component';
import { ProgressComponent } from '@components/status/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import type { NovelSummary } from '@dreamer/shared/models/novel';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { formatCount, formatDateTime, formatShortDate } from '@core/format';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { LibraryView } from '@core/stores/library-store';
import { coverPalette, coverUrl, toggled } from '../library-format';
import { LibraryCoverComponent } from './library-cover.component';

const CARD_GENRES = 2;

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
  readonly novels = input.required<NovelSummary[]>();
  readonly pending = input<PipelineRun[]>([]);
  readonly view = input.required<LibraryView>();
  readonly active = input<string | null>(null);
  readonly selected = model<string[]>([]);
  readonly activate = output<string>();
  readonly open = output<string>();
  readonly delete = output<NovelSummary>();
  protected readonly coverUrl = coverUrl;
  protected readonly coverPalette = coverPalette;
  private readonly i18n: I18nService = inject(I18nService);

  protected readonly allSelected: Signal<boolean> = computed(
    () => !!this.novels().length && this.novels().every((novel) => this.selected().includes(novel.id)),
  );

  protected isSelected(novel: NovelSummary): boolean {
    return this.selected().includes(novel.id);
  }

  protected toggle(novel: NovelSummary): void {
    this.selected.update((ids: string[]) => toggled(ids, novel.id));
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? [] : this.novels().map((novel) => novel.id));
  }

  protected count(value: number): string {
    return formatCount(value, this.i18n.language());
  }

  protected genres(novel: NovelSummary): string[] {
    return novel.tags.slice(0, CARD_GENRES);
  }

  protected publicationKey(novel: NovelSummary): string {
    return `library.browse.publication.${novel.publication}`;
  }

  protected pendingKey(run: PipelineRun): string {
    return run.status === 'queued' ? 'library.items.queued' : 'library.items.importing';
  }

  protected shortDate(iso: string): string {
    return formatShortDate(iso, this.i18n.language());
  }

  protected fullDate(iso: string): string {
    return formatDateTime(iso, this.i18n.language());
  }
}
