import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
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
import { entityTypeIcons, entityTypeKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

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
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(I18nService);
  private occurrenceRequest = 0;

  protected readonly typeKeys = entityTypeKeys;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly tab = signal<EntityTab>('entity');
  protected readonly alias = signal('');
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
  protected readonly aliasExists = computed(() => {
    const alias = this.alias().trim().toLocaleLowerCase();
    const entity = this.store.selected();
    return !!entity && !!alias && [entity.name, ...entity.aliases].some((item) => item.toLocaleLowerCase() === alias);
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
        this.alias.set('');
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

  protected openDialog(kind: 'rename' | 'type', entity: WorldEntity): void {
    this.store.dialog.set({ kind: 'entity', mode: kind, entityId: entity.id });
  }

  protected openMerge(entity: WorldEntity): void {
    const others = this.store.mergeIds().filter((id) => id !== entity.id);
    this.store.dialog.set({ kind: 'merge', entityIds: [entity.id, ...others] });
  }

  protected openFact(entity: WorldEntity, factId: string | null): void {
    this.store.dialog.set({ kind: 'fact', entityId: entity.id, factId });
  }

  protected async addAlias(entity: WorldEntity): Promise<void> {
    const alias = this.alias().trim();
    if (!alias || this.aliasExists()) return;
    if (await this.store.edit({ kind: 'entity-add-alias', entityId: entity.id, alias })) this.alias.set('');
  }

  protected removeAlias(entity: WorldEntity, alias: string): void {
    void this.store.edit({ kind: 'entity-remove-alias', entityId: entity.id, alias });
  }

  protected resetEntity(entity: WorldEntity): void {
    void this.store.edit({ kind: 'entity-reset', entityId: entity.id });
  }

  protected resetScalar(scalar: WorldScalar): void {
    if (scalar.factId)
      void this.store.edit({ kind: 'fact-reset', factId: scalar.factId, chapterIndex: scalar.chapterIndex });
  }

  protected resetLink(link: WorldLink): void {
    const factId = link.factIds?.[0];
    if (factId) void this.store.edit({ kind: 'fact-reset', factId, chapterIndex: firstChapter(link) });
  }

  protected async deleteEntity(entity: WorldEntity): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.entity.deleteTitle', { name: entity.name }),
      message: this.i18n.t('analysis.entity.deleteMessage'),
      confirmLabel: this.i18n.t('analysis.world.delete'),
      cancelLabel: this.i18n.t('common.cancel'),
      danger: true,
    });
    if (confirmed && (await this.store.edit({ kind: 'entity-delete', entityId: entity.id }))) this.store.select(null);
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
