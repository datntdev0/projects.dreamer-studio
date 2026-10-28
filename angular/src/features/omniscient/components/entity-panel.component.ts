import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { TabsComponent } from '@components/tabs/tabs.component';
import type { TabItem } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type { Occurrence, WorldEntity, WorldLink, WorldScalar } from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys, pluralKey } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';
import { issueIcons, issueLabelKeys, issuePillKinds } from '../omniscient-labels';

type EntityTab = 'entity' | 'relations' | 'occurrences';

interface ScalarGroup {
  predicate: string;
  values: WorldScalar[];
}

interface OccurrenceResult {
  id: string;
  items: Occurrence[];
  error: string;
}

const OCCURRENCE_PAGE = 50;

@Component({
  selector: 'ds-entity-panel',
  imports: [
    AreaStateComponent,
    ButtonDirective,
    IconComponent,
    PillComponent,
    TabsComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  templateUrl: './entity-panel.component.html',
  host: { class: 'ds-world-detail' },
})
export class EntityPanelComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  private occurrenceRequest = 0;

  protected readonly typeKeys = entityTypeKeys;
  protected readonly pluralKey = pluralKey;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly issueIcons = issueIcons;
  protected readonly issueKinds = issuePillKinds;
  protected readonly issueKeys = issueLabelKeys;
  protected readonly tab = signal<EntityTab>('entity');
  protected readonly expanded = signal<string[]>([]);
  protected readonly occurrenceLimit = signal(OCCURRENCE_PAGE);
  protected readonly occurrenceResult = signal<OccurrenceResult | null>(null);

  protected readonly links = computed(() => {
    const id = this.store.selectedId();
    return id ? [...this.store.linksOf(id)].sort((a, b) => firstChapter(a) - firstChapter(b)) : [];
  });
  protected readonly scalarGroups = computed<ScalarGroup[]>(() => {
    const groups = new Map<string, WorldScalar[]>();
    const scalars = [...(this.store.selected()?.scalars ?? [])].sort((a, b) => b.chapterIndex - a.chapterIndex);
    for (const scalar of scalars) groups.set(scalar.predicate, [...(groups.get(scalar.predicate) ?? []), scalar]);
    return [...groups].map(([predicate, values]) => ({ predicate, values }));
  });
  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'entity', label: this.i18n.t('analysis.entity.tab.entity') },
    { id: 'relations', label: this.i18n.t('analysis.entity.tab.relations'), count: this.links().length },
    {
      id: 'occurrences',
      label: this.i18n.t('analysis.entity.tab.occurrences'),
      count: this.store.selected()?.chapters.length ?? null,
    },
  ]);
  protected readonly occurrences = computed(() => {
    const result = this.occurrenceResult();
    return result && result.id === this.store.selectedId() ? result : null;
  });

  constructor() {
    effect(() => {
      this.store.selectedId();
      untracked(() => {
        this.expanded.set([]);
        this.occurrenceLimit.set(OCCURRENCE_PAGE);
      });
    });
    effect(() => {
      const id = this.tab() === 'occurrences' ? this.store.selectedId() : null;
      this.store.world();
      untracked(() => void this.loadOccurrences(id));
    });
  }

  protected selectTab(id: string): void {
    this.tab.set(id as EntityTab);
  }

  protected otherOf(link: WorldLink, entity: WorldEntity): WorldEntity | null {
    const otherId = this.store.otherId(link, entity.id);
    return this.store.entities().find((item) => item.id === otherId) ?? null;
  }

  protected linkKey(link: WorldLink): string {
    return `${link.source}|${link.predicate}|${link.label ?? ''}|${link.target}`;
  }

  protected toggleQuote(link: WorldLink): void {
    const key = this.linkKey(link);
    this.expanded.update((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
  }

  protected edit(entity: WorldEntity): void {
    void this.store.openEdit({ entityIds: [entity.id] });
  }

  protected editRelation(entity: WorldEntity, link: WorldLink): void {
    void this.store.openEdit({ entityIds: [entity.id, this.store.otherId(link, entity.id)] });
  }

  protected firstChapter(link: WorldLink): number {
    return firstChapter(link);
  }

  protected showMoreOccurrences(): void {
    this.occurrenceLimit.update((limit) => limit + OCCURRENCE_PAGE);
  }

  private async loadOccurrences(id: string | null): Promise<void> {
    const request = ++this.occurrenceRequest;
    if (!id) return;
    try {
      const items = await this.store.occurrences(id);
      if (request === this.occurrenceRequest) this.occurrenceResult.set({ id, items, error: '' });
    } catch (error) {
      if (request === this.occurrenceRequest) this.occurrenceResult.set({ id, items: [], error: errorMessage(error) });
    }
  }
}

function firstChapter(link: WorldLink): number {
  return link.chapters[0] ?? 0;
}
