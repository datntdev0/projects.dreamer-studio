import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { SegmentedComponent } from '@components/form/segmented.component';
import type { SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { BadgeComponent } from '@components/status/badge.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { ENTITY_TYPE_FILTERS, entityTypeIcons, entityTypeKeys, pluralKey } from '../omniscient-labels';
import type { EntityTypeFilter } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';
import { issueIcons, issueLabelKeys } from '../omniscient-labels';
import { sortEntities } from './entity-table.component';

const MOVE_KEYS: Record<string, (index: number, last: number) => number> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, last) => last,
};

@Component({
  selector: 'ds-entity-list',
  imports: [BadgeComponent, ButtonDirective, IconComponent, SegmentedComponent, TooltipDirective, TranslatePipe],
  templateUrl: './entity-list.component.html',
})
export class EntityListComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  private readonly listbox = viewChild<ElementRef<HTMLElement>>('listbox');
  protected readonly typeKeys = entityTypeKeys;
  protected readonly pluralKey = pluralKey;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly issueIcons = issueIcons;
  protected readonly issueKeys = issueLabelKeys;
  protected readonly activeId = signal<string | null>(null);
  protected readonly entities = computed(() => sortEntities(this.store.visibleEntities(), 'chapters', 'desc'));
  protected readonly typeOptions = computed<SegmentedOption[]>(() => [
    { value: 'all', label: this.i18n.t('analysis.world.allTypes'), icon: 'layers' },
    ...ENTITY_TYPE_FILTERS.map((type) => ({
      value: type,
      label: this.i18n.t(type === 'Character' ? 'analysis.world.charactersAndPersonas' : entityTypeKeys[type]),
      icon: entityTypeIcons[type],
    })),
  ]);
  protected readonly activeDescendant = computed(() => {
    const id = this.activeId() ?? this.store.selectedId();
    return id && this.entities().some((entity) => entity.id === id) ? 'world-entity-' + id : null;
  });

  protected setType(value: string): void {
    this.store.typeFilter.set(value as EntityTypeFilter);
  }

  protected search(event: Event): void {
    this.store.query.set((event.target as HTMLInputElement).value);
    this.activeId.set(null);
  }

  protected open(id: string): void {
    this.activeId.set(id);
    this.store.select(id);
  }

  protected toggleChecked(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.store.locked()) this.store.toggleChecked(id);
  }

  protected add(): void {
    void this.store.openEdit({ entityIds: [] });
  }

  protected editChecked(): void {
    void this.store.openEdit({ entityIds: this.store.checkedIds() });
  }

  protected keydown(event: KeyboardEvent): void {
    const items = this.entities();
    if (!items.length) return;
    const current = items.findIndex((entity) => 'world-entity-' + entity.id === this.activeDescendant());
    const move = MOVE_KEYS[event.key];
    if (move) {
      event.preventDefault();
      const id = items[current < 0 ? 0 : move(current, items.length - 1)].id;
      this.activeId.set(id);
      this.listbox()
        ?.nativeElement.querySelector(`#world-entity-${CSS.escape(id)}`)
        ?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (current < 0 || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (event.key === 'Enter') this.open(items[current].id);
    else this.toggleChecked(items[current].id, event);
  }
}
