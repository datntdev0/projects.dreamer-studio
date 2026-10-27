import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { DialogComponent } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { IconComponent } from '@components/icon/icon.component';
import { I18nService } from '@core/i18n/i18n.service';
import { TranslatePipe } from '@core/i18n/translate.pipe';
import type { EntityType, ReviewEdit, ReviewItem } from '@dreamer/shared/models/analysis';
import { ENTITY_TYPES, entityTypeKeys, reasonKeys } from '../omniscient-labels';
import { OmniscientStore } from '../omniscient.store';

interface FixForm {
  name: string;
  type: string;
  aliases: string;
  subject: string;
  predicate: string;
  value: string;
  label: string;
  quote: string;
}

type FixField = keyof FixForm;

const EMPTY_FORM: FixForm = {
  name: '',
  type: '',
  aliases: '',
  subject: '',
  predicate: '',
  value: '',
  label: '',
  quote: '',
};

function splitAliases(value: string): string[] {
  return value
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);
}

@Component({
  selector: 'ds-fix-item-dialog',
  imports: [ButtonDirective, DialogComponent, FieldComponent, IconComponent, TranslatePipe],
  templateUrl: './fix-item-dialog.component.html',
})
export class FixItemDialogComponent {
  protected readonly store = inject(OmniscientStore);
  private readonly i18n = inject(I18nService);
  protected readonly form = signal<FixForm>(EMPTY_FORM);
  private readonly original = signal<FixForm>(EMPTY_FORM);
  protected readonly types = computed(() => this.store.ontology()?.entityTypes ?? ENTITY_TYPES);

  protected readonly item = computed<ReviewItem | null>(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'fix' ? dialog.item : null;
  });
  protected readonly items = computed<ReviewItem[]>(() => {
    const dialog = this.store.dialog();
    return dialog?.kind === 'fix' ? (dialog.items ?? [dialog.item]) : [];
  });
  protected readonly chapterCount = computed(() => new Set(this.items().map((item) => item.chapterIndex)).size);
  protected readonly scalar = computed(() => this.item()?.fact?.kind === 'scalar');
  protected readonly predicates = computed(() => {
    const fact = this.item()?.fact;
    if (!fact) return [];
    return (this.store.ontology()?.predicates ?? [])
      .filter((predicate) => predicate.kind === fact.kind)
      .map((predicate) => predicate.name);
  });
  private readonly predicate = computed(() =>
    this.store.ontology()?.predicates.find((predicate) => predicate.name === this.form().predicate),
  );
  protected readonly values = computed(() => this.predicate()?.allowedValues ?? []);
  protected readonly freeText = computed(() => this.scalar() && !this.values().length);
  protected readonly labeled = computed(() => this.predicate()?.labeled === true);
  protected readonly entities = computed(() =>
    [...(this.store.review()?.entities[this.item()?.chapterIndex ?? -1] ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entity) => ({ id: entity.id, name: `${entity.name} · ${this.typeLabel(entity.type)}` })),
  );
  protected readonly reason = computed(() => {
    const reason = this.item()?.entity?.reason ?? this.item()?.fact?.reason;
    return reason ? this.i18n.t(reasonKeys[reason]) : '';
  });
  protected readonly valid = computed(() => {
    const form = this.form();
    if (this.item()?.entity) return !!form.name.trim() && !!form.type;
    return (
      !!form.subject &&
      !!form.predicate &&
      !!form.value.trim() &&
      !!form.quote.trim() &&
      (!this.labeled() || !!form.label.trim())
    );
  });
  protected readonly canSave = computed(
    () =>
      this.valid() &&
      JSON.stringify(this.form()) !== JSON.stringify(this.original()) &&
      !this.store.locked() &&
      !this.store.busy(),
  );

  constructor() {
    effect(() => {
      const item = this.item();
      if (item) untracked(() => this.reset(item));
    });
  }

  protected typeLabel(type: EntityType | 'artifact'): string {
    const key = entityTypeKeys[type] as string | undefined;
    return key ? this.i18n.t(key) : type;
  }

  protected set(field: FixField, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    this.form.update((form) => ({ ...form, [field]: value }));
    if (field === 'predicate' && this.scalar() && this.values().length)
      this.form.update((form) => ({ ...form, value: this.values()[0] }));
  }

  protected missing(field: FixField): boolean {
    return !this.form()[field].trim();
  }

  protected close(): void {
    this.store.dialog.set(null);
  }

  protected async save(): Promise<void> {
    const item = this.item();
    if (!item || !this.canSave()) return;
    const saved = await this.store.editMany(this.items().map((target) => this.edit(target)));
    if (saved) this.close();
  }

  private edit(target: ReviewItem): ReviewEdit {
    const form = this.form();
    const base = { kind: 'review-fix' as const, chapterIndex: target.chapterIndex, itemKind: target.itemKind };
    if (target.entity)
      return {
        ...base,
        itemId: target.entity.id,
        entity: { name: form.name.trim(), type: form.type as EntityType, aliases: splitAliases(form.aliases) },
      };
    return {
      ...base,
      itemId: target.fact?.id ?? '',
      fact: {
        subjectId: form.subject,
        predicate: form.predicate,
        ...(this.scalar() ? { value: form.value.trim() } : { objectId: form.value }),
        ...(this.labeled() ? { label: form.label.trim() } : {}),
        quote: form.quote.trim(),
      },
    };
  }

  private reset(item: ReviewItem): void {
    const entity = item.entity;
    const fact = item.fact;
    const values = this.store.ontology()?.predicates.find((predicate) => predicate.name === fact?.predicate);
    const form: FixForm = entity
      ? {
          ...EMPTY_FORM,
          name: entity.name,
          type: entity.type === 'artifact' ? (this.types()[0] ?? '') : entity.type,
          aliases: entity.aliases.join(', '),
        }
      : {
          ...EMPTY_FORM,
          subject: fact?.subjectId ?? '',
          predicate: fact?.predicate ?? '',
          value:
            fact?.kind === 'scalar'
              ? (fact.value ?? values?.allowedValues?.[0] ?? '')
              : (fact?.objectId ?? this.entities()[0]?.id ?? ''),
          label: fact?.label ?? '',
          quote: fact?.quote ?? '',
        };
    this.form.set(form);
    this.original.set(entity ? { ...form, type: entity.type } : form);
  }
}
