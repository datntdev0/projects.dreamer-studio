import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { CheckboxComponent } from '@components/form/checkbox.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, FactRef } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys, pluralKey } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

function sameRef(a: FactRef, b: FactRef): boolean {
  return a.factId === b.factId && a.chapterIndex === b.chapterIndex;
}

@Component({
  selector: 'ds-entity-split-dialog',
  imports: [ButtonDirective, CheckboxComponent, DialogComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './entity-split-dialog.component.html',
})
export class EntitySplitDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);

  protected readonly types = ENTITY_TYPES;
  protected readonly typeKeys = entityTypeKeys;
  protected readonly pluralKey = pluralKey;
  protected readonly name = signal('');
  protected readonly type = signal<EntityType>('Character');
  protected readonly aliases = signal<string[]>([]);
  protected readonly facts = signal<FactRef[]>([]);
  protected readonly error = signal('');

  protected readonly request = computed(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'split' ? dialog : null;
  });
  protected readonly entity = computed(
    () => this.store.entities().find((item) => item.id === this.request()?.entityId) ?? null,
  );
  protected readonly scalars = computed(() =>
    (this.entity()?.scalars ?? []).flatMap((item) =>
      item.factId ? [{ ...item, ref: { factId: item.factId, chapterIndex: item.chapterIndex } }] : [],
    ),
  );
  protected readonly links = computed(() => {
    const id = this.entity()?.id;
    return id ? this.store.linksOf(id).filter((link) => !!link.factRefs?.length) : [];
  });
  protected readonly selectedCount = computed(
    () =>
      this.aliases().length +
      this.scalars().filter((item) => this.hasFacts([item.ref])).length +
      this.links().filter((link) => this.hasFacts(link.factRefs ?? [])).length,
  );
  protected readonly sameName = computed(
    () => this.name().trim().toLocaleLowerCase() === this.entity()?.name.toLocaleLowerCase(),
  );
  protected readonly duplicate = computed(() => {
    const name = this.name().trim().toLocaleLowerCase();
    return this.store.entities().some((item) => item.type === this.type() && item.name.toLocaleLowerCase() === name);
  });
  protected readonly nameError = computed(() =>
    this.sameName()
      ? this.i18n.t('analysis.entity.splitSameName', { name: this.entity()?.name ?? '' })
      : this.duplicate()
        ? this.i18n.t('analysis.entity.duplicate')
        : '',
  );
  protected readonly canSave = computed(
    () =>
      !!this.entity() &&
      !!this.name().trim() &&
      !this.nameError() &&
      this.selectedCount() > 0 &&
      !this.store.busy() &&
      !this.store.locked(),
  );

  constructor() {
    effect(() => {
      this.request();
      untracked(() => {
        this.name.set('');
        this.type.set(this.entity()?.type ?? 'Character');
        this.aliases.set([]);
        this.facts.set([]);
        this.error.set('');
      });
    });
  }

  protected hasFacts(refs: FactRef[]): boolean {
    return refs.some((ref) => this.facts().some((item) => sameRef(item, ref)));
  }

  protected toggleAlias(alias: string, checked: boolean): void {
    this.aliases.update((items) => (checked ? [...items, alias] : items.filter((item) => item !== alias)));
  }

  protected toggleFacts(refs: FactRef[], checked: boolean): void {
    this.facts.update((items) => [
      ...items.filter((item) => !refs.some((ref) => sameRef(item, ref))),
      ...(checked ? refs : []),
    ]);
  }

  protected setType(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as EntityType);
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const entity = this.entity();
    if (!entity || !this.canSave()) return;
    const id = crypto.randomUUID();
    const ok = await this.store.edit({
      kind: 'entity-split',
      entityId: entity.id,
      newEntity: { id, type: this.type(), name: this.name().trim() },
      aliases: this.aliases(),
      facts: this.facts(),
    });
    if (!ok) {
      this.error.set(this.store.error() || this.i18n.t('analysis.entity.saveFailed'));
      return;
    }
    this.store.select(id);
    this.close();
  }
}
