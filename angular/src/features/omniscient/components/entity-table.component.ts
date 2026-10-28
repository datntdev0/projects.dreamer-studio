import { Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { WorldEntity } from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';
import { issueIcons, issueLabelKeys, issueRanks } from '../omniscient-labels';

export type EntitySortKey = 'name' | 'type' | 'aliases' | 'chapters' | 'degree' | 'overlay' | 'issue';
export type SortDirection = 'asc' | 'desc';

const SORT_VALUES: Record<EntitySortKey, (entity: WorldEntity) => string | number> = {
  name: (entity) => entity.name.toLocaleLowerCase(),
  type: (entity) => entity.type,
  aliases: (entity) => entity.aliases.length,
  chapters: (entity) => entity.chapters.length,
  degree: (entity) => entity.degree,
  overlay: (entity) => (entity.overlay ? 1 : 0),
  issue: (entity) => issueRanks[entity.issue ?? 'none'],
};

export function sortEntities(entities: WorldEntity[], key: EntitySortKey, direction: SortDirection): WorldEntity[] {
  const value = SORT_VALUES[key];
  const sign = direction === 'asc' ? 1 : -1;
  return [...entities].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = left < right ? -1 : left > right ? 1 : 0;
    return order * sign || a.name.localeCompare(b.name);
  });
}

interface EntityColumn {
  key: EntitySortKey;
  label: string;
  numeric: boolean;
}

@Component({
  selector: 'ds-entity-table',
  imports: [IconComponent, TooltipDirective, TranslatePipe],
  templateUrl: './entity-table.component.html',
})
export class EntityTableComponent {
  protected readonly store = inject(OmniscientStore);
  protected readonly typeKeys = entityTypeKeys;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly issueIcons = issueIcons;
  protected readonly issueKeys = issueLabelKeys;
  protected readonly columns: EntityColumn[] = [
    { key: 'name', label: 'analysis.world.newName', numeric: false },
    { key: 'type', label: 'analysis.world.typeLabel', numeric: false },
    { key: 'aliases', label: 'analysis.world.aliases', numeric: false },
    { key: 'chapters', label: 'analysis.entities.chapters', numeric: true },
    { key: 'degree', label: 'analysis.world.degree', numeric: true },
    { key: 'issue', label: 'analysis.world.issue', numeric: false },
    { key: 'overlay', label: 'analysis.world.edited', numeric: false },
  ];
  protected readonly sortKey = signal<EntitySortKey>('chapters');
  protected readonly sortDirection = signal<SortDirection>('desc');
  protected readonly rows = computed(() =>
    sortEntities(this.store.visibleEntities(), this.sortKey(), this.sortDirection()),
  );

  protected sort(key: EntitySortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.sortKey.set(key);
    this.sortDirection.set(key === 'name' || key === 'type' ? 'asc' : 'desc');
  }

  protected ariaSort(key: EntitySortKey): string {
    if (this.sortKey() !== key) return 'none';
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }
}
