import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, WorldEdit } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

type EntityMode = 'add' | 'rename' | 'type';

const HEADINGS: Record<EntityMode, string> = {
  add: 'analysis.world.addEntity',
  rename: 'analysis.entity.renameTitle',
  type: 'analysis.entity.typeTitle',
};
const ICONS: Record<EntityMode, string> = { add: 'plus', rename: 'pencil', type: 'tag' };

@Component({
  selector: 'ds-entity-dialog',
  imports: [ButtonDirective, DialogComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './entity-dialog.component.html',
})
export class EntityDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);

  protected readonly types = ENTITY_TYPES;
  protected readonly typeKeys = entityTypeKeys;
  protected readonly icons = ICONS;
  protected readonly name = signal('');
  protected readonly type = signal<EntityType>('character');
  protected readonly error = signal('');

  protected readonly request = computed(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'entity' ? dialog : null;
  });
  protected readonly entity = computed(() => {
    const id = this.request()?.entityId;
    return this.store.entities().find((item) => item.id === id) ?? null;
  });
  protected readonly heading = computed(() => {
    const mode = this.request()?.mode ?? 'add';
    return this.i18n.t(HEADINGS[mode], { name: this.entity()?.name ?? '' });
  });
  protected readonly duplicate = computed(() => {
    const name = this.name().trim().toLocaleLowerCase();
    return this.store
      .entities()
      .some(
        (item) => item.id !== this.entity()?.id && item.type === this.type() && item.name.toLocaleLowerCase() === name,
      );
  });
  protected readonly canSave = computed(() => {
    const mode = this.request()?.mode;
    const entity = this.entity();
    const name = this.name().trim();
    if (!mode || this.store.busy() || this.store.locked() || this.duplicate()) return false;
    if (mode === 'add') return !!name;
    if (mode === 'rename') return !!name && name !== entity?.name;
    return this.type() !== entity?.type;
  });

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => {
        const entity = this.entity();
        const filter = this.store.typeFilter();
        this.name.set(request?.mode === 'add' ? '' : (entity?.name ?? ''));
        this.type.set(entity?.type ?? (filter === 'all' ? 'character' : filter));
        this.error.set('');
      });
    });
  }

  protected setType(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as EntityType);
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const request = this.request();
    if (!request || !this.canSave()) return;
    const name = this.name().trim();
    const newId = crypto.randomUUID();
    const entityId = this.entity()?.id ?? '';
    const edit: WorldEdit =
      request.mode === 'add'
        ? { kind: 'entity-add', entity: { id: newId, type: this.type(), name } }
        : request.mode === 'rename'
          ? { kind: 'entity-rename', entityId, name }
          : { kind: 'entity-change-type', entityId, entityType: this.type() };
    if (!(await this.store.edit(edit))) {
      this.error.set(this.store.error() || this.i18n.t('analysis.entity.saveFailed'));
      return;
    }
    if (request.mode === 'add') this.store.select(newId);
    this.close();
  }
}
