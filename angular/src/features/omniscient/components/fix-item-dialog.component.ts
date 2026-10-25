import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, ReviewItem } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys, reasonKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

@Component({
  selector: 'ds-fix-item-dialog',
  imports: [ButtonDirective, DialogComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './fix-item-dialog.component.html',
})
export class FixItemDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  protected readonly types = computed(() => this.store.ontology()?.entityTypes ?? ENTITY_TYPES);
  protected readonly type = signal<EntityType>('character');
  protected readonly predicate = signal('');
  protected readonly value = signal('');

  protected readonly item = computed<ReviewItem | null>(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'fix' ? dialog.item : null;
  });
  protected readonly scalar = computed(() => this.item()?.fact?.kind === 'scalar');
  protected readonly predicates = computed(() => {
    const fact = this.item()?.fact;
    if (!fact) return [];
    return (this.store.ontology()?.predicates ?? [])
      .filter((predicate) => predicate.kind === fact.kind)
      .map((predicate) => predicate.name);
  });
  protected readonly values = computed(
    () =>
      this.store.ontology()?.predicates.find((predicate) => predicate.name === this.predicate())?.allowedValues ?? [],
  );
  protected readonly objects = computed(() =>
    [...this.store.entities()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entity) => ({ id: entity.id, name: entity.name })),
  );
  protected readonly reason = computed(() => {
    const reason = this.item()?.entity?.reason ?? this.item()?.fact?.reason;
    return reason ? this.i18n.t(reasonKeys[reason]) : '';
  });
  protected readonly changed = computed(() => {
    const item = this.item();
    if (item?.entity) return this.type() !== item.entity.type;
    const fact = item?.fact;
    if (!fact || !this.predicate() || !this.value()) return false;
    const current = fact.kind === 'scalar' ? fact.value : fact.objectId;
    return this.predicate() !== fact.predicate || this.value() !== current;
  });
  protected readonly canSave = computed(() => this.changed() && !this.store.locked() && !this.store.busy());

  constructor() {
    effect(() => {
      const item = this.item();
      if (item) untracked(() => this.reset(item));
    });
  }

  protected typeLabel(type: EntityType | 'artifact'): string {
    return this.i18n.t(entityTypeKeys[type]);
  }

  protected setType(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as EntityType);
  }

  protected setPredicate(event: Event): void {
    this.predicate.set((event.target as HTMLSelectElement).value);
    if (this.scalar()) this.value.set(this.values()[0] ?? '');
  }

  protected setValue(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const item = this.item();
    const id = item?.entity?.id ?? item?.fact?.id;
    if (!item || !id || !this.canSave()) return;
    const saved = await this.store.edit({
      kind: 'review-fix',
      chapterIndex: item.chapterIndex,
      itemKind: item.itemKind,
      itemId: id,
      ...(item.entity
        ? { entity: { type: this.type(), reason: undefined } }
        : {
            fact: {
              predicate: this.predicate(),
              ...(this.scalar() ? { value: this.value() } : { objectId: this.value() }),
              reason: undefined,
            },
          }),
    });
    if (saved) this.close();
  }

  private reset(item: ReviewItem): void {
    const entityType = item.entity?.type;
    this.type.set(entityType && entityType !== 'artifact' ? entityType : this.types()[0]);
    const fact = item.fact;
    if (!fact) return;
    const predicate = this.predicates().includes(fact.predicate) ? fact.predicate : (this.predicates()[0] ?? '');
    this.predicate.set(predicate);
    if (fact.kind === 'scalar') {
      this.value.set(fact.value && this.values().includes(fact.value) ? fact.value : (this.values()[0] ?? ''));
    } else {
      this.value.set(fact.objectId ?? this.objects()[0]?.id ?? '');
    }
  }
}
