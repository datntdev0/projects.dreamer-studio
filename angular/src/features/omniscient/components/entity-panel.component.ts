import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { IconComponent } from '@components/icon/icon.component';
import { AreaStateComponent } from '@components/state/area-state.component';
import { PillComponent } from '@components/status/pill.component';
import { TabsComponent } from '@components/tabs/tabs.component';
import type { TabItem } from '@components/tabs/tabs.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import { hasProperty } from '@dreamer/shared/core/ontology-rules';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import type {
  FactRef,
  Occurrence,
  WorldEdit,
  WorldEntity,
  WorldLink,
  WorldScalar,
} from '@dreamer/shared/models/analysis';
import { entityTypeIcons, entityTypeKeys, pluralKey } from '../omniscient-labels';
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
const REMOVAL_KEYS = {
  reset: {
    title: 'analysis.entity.resetAddedTitle',
    message: 'analysis.entity.resetAddedMessage',
    confirm: 'analysis.entity.resetAddedConfirm',
  },
  delete: {
    title: 'analysis.entity.deleteFactTitle',
    message: 'analysis.entity.deleteFactMessage',
    confirm: 'analysis.world.delete',
  },
};

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
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private occurrenceRequest = 0;

  protected readonly typeKeys = entityTypeKeys;
  protected readonly pluralKey = pluralKey;
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
  protected readonly hasAliases = computed(() =>
    hasProperty(this.store.ontology(), this.store.selected()?.type, 'alias'),
  );
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

  protected openFact(entity: WorldEntity, ref: FactRef | null): void {
    this.store.dialog.set({
      kind: 'fact',
      entityId: entity.id,
      factId: ref?.factId ?? null,
      chapterIndex: ref?.chapterIndex ?? null,
    });
  }

  protected scalarRef(scalar: WorldScalar): FactRef | null {
    return scalar.factId ? { factId: scalar.factId, chapterIndex: scalar.chapterIndex } : null;
  }

  protected async addAlias(entity: WorldEntity): Promise<void> {
    const alias = this.alias().trim();
    if (!alias || this.aliasExists()) return;
    if (await this.store.edit({ kind: 'entity-add-alias', entityId: entity.id, alias })) this.alias.set('');
  }

  protected removeAlias(entity: WorldEntity, alias: string): void {
    void this.store.edit({ kind: 'entity-remove-alias', entityId: entity.id, alias });
  }

  protected async resetEntity(entity: WorldEntity): Promise<void> {
    if (!entity.chapters.length && !(await this.confirmRemoval('reset', entity.name))) return;
    if ((await this.store.edit({ kind: 'entity-reset', entityId: entity.id })) && !entity.chapters.length)
      this.store.select(null);
  }

  protected resetScalar(scalar: WorldScalar): void {
    if (scalar.factId)
      void this.store.edit({ kind: 'fact-reset', factId: scalar.factId, chapterIndex: scalar.chapterIndex });
  }

  protected resetLink(link: WorldLink): void {
    void this.store.editMany((link.factRefs ?? []).map((ref) => ({ kind: 'fact-reset', ...ref })));
  }

  protected async deleteScalar(scalar: WorldScalar): Promise<void> {
    const ref = this.scalarRef(scalar);
    if (ref && (await this.confirmRemoval('delete', scalar.predicate))) await this.deleteFacts([ref], scalar.predicate);
  }

  protected async deleteLink(link: WorldLink): Promise<void> {
    const name = link.label ?? link.predicate;
    if (await this.confirmRemoval('delete', name)) await this.deleteFacts(link.factRefs ?? [], name);
  }

  private async deleteFacts(refs: FactRef[], name: string): Promise<void> {
    const deleted = await this.store.editMany(refs.map((ref) => ({ kind: 'fact-delete', ...ref })));
    if (deleted)
      this.offerUndo(
        name,
        refs.map((ref) => ({ kind: 'fact-restore', ...ref })),
      );
  }

  private offerUndo(name: string, edits: WorldEdit[]): void {
    this.toast.show({
      kind: 'success',
      title: this.i18n.t('analysis.entity.deletedToast', { name }),
      action: { label: this.i18n.t('analysis.entity.undo'), run: () => void this.store.editMany(edits) },
    });
  }

  private confirmRemoval(kind: 'reset' | 'delete', name: string): Promise<boolean> {
    const keys = REMOVAL_KEYS[kind];
    return this.confirm.confirm({
      title: this.i18n.t(keys.title, { name }),
      message: this.i18n.t(keys.message),
      confirmLabel: this.i18n.t(keys.confirm),
      cancelLabel: this.i18n.t('common.cancel'),
      danger: true,
    });
  }

  protected async deleteEntity(entity: WorldEntity): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.entity.deleteTitle', { name: entity.name }),
      message: this.i18n.t('analysis.entity.deleteMessage'),
      confirmLabel: this.i18n.t('analysis.world.delete'),
      cancelLabel: this.i18n.t('common.cancel'),
      danger: true,
    });
    if (!confirmed || !(await this.store.edit({ kind: 'entity-delete', entityId: entity.id }))) return;
    this.store.select(null);
    this.offerUndo(entity.name, [{ kind: 'entity-restore', entityId: entity.id }]);
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
