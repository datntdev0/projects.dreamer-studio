import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { ConfirmService } from '@components/dialog/confirm.service';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, WorldEntity } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeIcons, entityTypeKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

const CANDIDATE_LIMIT = 8;

@Component({
  selector: 'ds-entity-merge-dialog',
  imports: [ButtonDirective, DialogComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './entity-merge-dialog.component.html',
})
export class EntityMergeDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(I18nService);

  protected readonly types = ENTITY_TYPES;
  protected readonly typeKeys = entityTypeKeys;
  protected readonly typeIcons = entityTypeIcons;
  protected readonly ids = signal<string[]>([]);
  protected readonly keepId = signal('');
  protected readonly type = signal<EntityType>('Character');
  protected readonly query = signal('');
  protected readonly error = signal('');

  protected readonly request = computed(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'merge' ? dialog : null;
  });
  protected readonly items = computed(() =>
    this.ids()
      .map((id) => this.store.entities().find((item) => item.id === id))
      .filter((item): item is WorldEntity => !!item),
  );
  protected readonly keep = computed(() => this.items().find((item) => item.id === this.keepId()) ?? null);
  protected readonly candidates = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const type = this.keep()?.type;
    return this.store
      .entities()
      .filter((item) => !this.ids().includes(item.id))
      .filter((item) =>
        query
          ? [item.name, ...item.aliases].some((name) => name.toLocaleLowerCase().includes(query))
          : item.type === type,
      )
      .sort((a, b) => Number(b.type === type) - Number(a.type === type) || a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  });
  protected readonly result = computed(() => {
    const items = this.items();
    const ids = items.map((item) => item.id);
    const keep = this.keep();
    const names = new Set(
      items.flatMap((item) => [item.name, ...item.aliases].map((name) => name.toLocaleLowerCase())),
    );
    if (keep) names.delete(keep.name.toLocaleLowerCase());
    const links = this.store.links().filter((link) => ids.includes(link.source) !== ids.includes(link.target));
    return {
      aliases: names.size,
      values: items.reduce((sum, item) => sum + item.scalars.length, 0),
      relations: links.length,
      chapters: new Set(items.flatMap((item) => item.chapters)).size,
    };
  });
  protected readonly canSave = computed(
    () => this.items().length > 1 && !!this.keep() && !this.store.busy() && !this.store.locked(),
  );

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => {
        const ids = request?.entityIds ?? [];
        this.ids.set(ids);
        this.setKeep(ids[0] ?? '');
        this.query.set('');
        this.error.set('');
      });
    });
  }

  protected setKeep(id: string): void {
    this.keepId.set(id);
    this.type.set(this.store.entities().find((item) => item.id === id)?.type ?? 'Character');
  }

  protected add(entity: WorldEntity): void {
    this.ids.update((ids) => [...ids, entity.id]);
    this.query.set('');
  }

  protected remove(entity: WorldEntity): void {
    this.ids.update((ids) => ids.filter((id) => id !== entity.id));
    if (this.keepId() === entity.id) this.setKeep(this.ids()[0] ?? '');
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const keep = this.keep();
    if (!keep || !this.canSave()) return;
    const sourceIds = this.items().map((item) => item.id);
    const confirmed = await this.confirm.confirm({
      title: this.i18n.t('analysis.entity.mergeConfirmTitle', { count: sourceIds.length, name: keep.name }),
      message: this.i18n.t('analysis.entity.mergeConfirmMessage', { name: keep.name }),
      confirmLabel: this.i18n.t('analysis.entity.mergeAction'),
      cancelLabel: this.i18n.t('common.cancel'),
    });
    if (!confirmed) return;
    const merged = await this.store.edit({ kind: 'entity-merge', sourceIds, targetId: keep.id });
    const typed =
      merged &&
      (keep.type === this.type() ||
        (await this.store.edit({ kind: 'entity-change-type', entityId: keep.id, entityType: this.type() })));
    if (!typed) {
      this.error.set(this.store.error() || this.i18n.t('analysis.entity.saveFailed'));
      return;
    }
    this.store.mergeIds.set([]);
    this.store.select(keep.id);
    this.close();
  }

  protected setType(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as EntityType);
  }

  protected setKeepFromEvent(event: Event): void {
    this.setKeep((event.target as HTMLSelectElement).value);
  }
}
