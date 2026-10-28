import { Component, input, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { nameKey } from '@dreamer/shared/core/analysis-checks';
import { applyDraftEdits, factKey } from '@dreamer/shared/core/world-edit';
import type { DraftState } from '@dreamer/shared/core/world-edit';
import type { EntityType, Ontology, WorldDraftEdit, WorldFact } from '@dreamer/shared/models/analysis';
import type { WorldEditEntity, WorldEditPreview, WorldEditScope, WorldIssue } from '@dreamer/shared/models/analysis';
import { WorldEditDialogComponent } from '../../src/features/omniscient/components/world-edit-dialog.component';
import { DEFAULT_ONTOLOGY } from './analysis';

export type EditScenario = 'fixTypeNotAllowed' | 'fixEntityNotFound' | 'editEntity' | 'mergeEntities' | 'splitEntity';

export const EDIT_SCENARIOS: EditScenario[] = [
  'fixTypeNotAllowed',
  'fixEntityNotFound',
  'editEntity',
  'mergeEntities',
  'splitEntity',
];

export const EDIT_ONTOLOGY: Ontology = {
  ...DEFAULT_ONTOLOGY,
  predicates: DEFAULT_ONTOLOGY.predicates.map((predicate) =>
    predicate.name === 'leads' ? { ...predicate, subjectTypes: ['Character', 'Persona'] } : predicate,
  ),
};

function entity(
  id: string,
  type: EntityType,
  name: string,
  chapters: number[],
  extra: Partial<WorldEditEntity> = {},
): WorldEditEntity {
  return { id, type, name, aliases: [], titles: [], chapters, ...extra };
}

function fact(
  id: string,
  chapterIndex: number,
  predicate: string,
  subjectId: string,
  objectId: string | undefined,
  quote: string,
  extra: Partial<WorldFact> = {},
): WorldFact {
  return {
    id,
    chapterIndex,
    kind: 'relationship',
    predicate,
    subjectId,
    ...(objectId ? { objectId } : {}),
    quote,
    ...extra,
  };
}

const LAN = entity('persona-lan', 'Persona', '藍依凝', [3, 12, 15], { aliases: ['依凝'], titles: ['聖女'] });
const QINGYUN = entity('location-qingyun', 'Location', '青雲帝國', [1, 12, 20]);
const TIANJI = entity('org-tianji', 'Organization', '天機閣', [3, 12]);
const XIAO = entity('persona-xiao', 'Persona', '蕭寒', [5, 8, 9, 14], { aliases: ['寒公子', '小寒'] });
const LIN = entity('persona-lin', 'Persona', '林月', [8], { aliases: ['林姑娘'] });
const YUER = entity('persona-yuer', 'Persona', '月兒', [9, 11]);
const TIANJIAN = entity('org-tianjian', 'Organization', '天劍宗', [5, 14]);

const CATALOG: WorldEditEntity[] = [
  LAN,
  QINGYUN,
  TIANJI,
  XIAO,
  LIN,
  YUER,
  TIANJIAN,
  entity('org-qingyun-sect', 'Organization', '青雲宗', [2, 7]),
  entity('character-bailu', 'Character', '白鹿', [4]),
];

function scope(partial: Partial<WorldEditScope>): WorldEditScope {
  return { issue: null, entities: [], facts: [], catalog: CATALOG, focus: [], ...partial };
}

export const EDIT_SCOPES: Record<EditScenario, WorldEditScope> = {
  fixTypeNotAllowed: scope({
    issue: {
      key: 'type-not-allowed:fact:12:f-7',
      reason: 'type-not-allowed',
      severity: 'error',
      entityIds: [LAN.id, QINGYUN.id],
      fact: { factId: 'f-7', chapterIndex: 12 },
      chapters: [12],
      params: { name: '青雲帝國', type: 'Location', predicate: 'leads', allowed: 'Organization' },
    },
    entities: [LAN, QINGYUN, TIANJI],
    facts: [
      fact('f-7', 12, 'leads', LAN.id, QINGYUN.id, '藍依凝執掌青雲帝國已有三百年。'),
      fact('f-9', 12, 'located_in', TIANJI.id, QINGYUN.id, '天機閣坐落於青雲帝國的北境。'),
      fact('f-2', 3, 'member_of', LAN.id, TIANJI.id, '藍依凝早年拜入天機閣。'),
    ],
  }),
  fixEntityNotFound: scope({
    issue: {
      key: 'entity-not-found:fact:5:f-3',
      reason: 'entity-not-found',
      severity: 'error',
      entityIds: [XIAO.id],
      fact: { factId: 'f-3', chapterIndex: 5 },
      chapters: [5],
      params: { name: '天劍門' },
    },
    entities: [XIAO],
    facts: [fact('f-3', 5, 'member_of', XIAO.id, undefined, '蕭寒是天劍門的內門弟子。', { objectName: '天劍門' })],
  }),
  editEntity: scope({
    entities: [LAN, QINGYUN, TIANJI],
    facts: [
      fact('f-7', 12, 'member_of', LAN.id, TIANJI.id, '藍依凝執掌天機閣已有三百年。'),
      fact('f-11', 15, 'located_in', LAN.id, QINGYUN.id, '藍依凝回到青雲帝國。'),
      fact('f-12', 15, 'status', LAN.id, undefined, '藍依凝閉關不出。', { kind: 'scalar' }),
    ],
    focus: [LAN.id],
  }),
  mergeEntities: scope({
    entities: [LIN, YUER, XIAO],
    facts: [
      fact('f-4', 8, 'lover_of', LIN.id, XIAO.id, '林月與蕭寒在月下定情。'),
      fact('f-5', 9, 'lover_of', YUER.id, XIAO.id, '月兒輕聲喚蕭寒的名字。'),
      fact('f-6', 11, 'member_of', YUER.id, 'org-qingyun-sect', '月兒自幼在青雲宗長大。'),
    ],
  }),
  splitEntity: scope({
    entities: [XIAO, TIANJIAN],
    facts: [
      fact('f-3', 5, 'member_of', XIAO.id, TIANJIAN.id, '蕭寒是天劍宗的內門弟子。'),
      fact('f-8', 9, 'enemy_of', XIAO.id, 'character-bailu', '寒公子與白鹿素有仇怨。'),
      fact('f-10', 14, 'leads', XIAO.id, TIANJIAN.id, '小寒接掌天劍宗。'),
    ],
    focus: [XIAO.id],
  }),
};

function withCatalog(state: DraftState, scope: WorldEditScope): DraftState {
  const known = new Set([...scope.entities, ...state.entities].map((item) => item.id));
  return { ...state, entities: [...state.entities, ...scope.catalog.filter((item) => !known.has(item.id))] };
}

function factIssues(state: DraftState, item: WorldFact, ontology: Ontology): WorldIssue[] {
  const find = (id: string | undefined): WorldEditEntity | undefined =>
    state.entities.find((candidate) => candidate.id === id);
  const subject = find(item.subjectId);
  const object = find(item.objectId);
  const predicate = ontology.predicates.find((entry) => nameKey(entry.name) === nameKey(item.predicate));
  const issue = (reason: WorldIssue['reason'], params: Record<string, string>): WorldIssue[] => [
    {
      key: `${reason}:fact:${factKey(item)}`,
      reason,
      severity: reason === 'label-missing' ? 'warning' : 'error',
      entityIds: [subject?.id, object?.id].filter((id): id is string => !!id),
      fact: { factId: item.id, chapterIndex: item.chapterIndex },
      chapters: [item.chapterIndex],
      params,
    },
  ];
  if (!subject) return issue('entity-not-found', { name: item.subjectName ?? '' });
  if (item.kind === 'relationship' && !object) return issue('entity-not-found', { name: item.objectName ?? '' });
  if (!predicate) return issue('predicate-not-in-ontology', { predicate: item.predicate });
  const roles = [
    [subject, predicate.subjectTypes],
    [object, predicate.objectTypes ?? []],
  ] as const;
  for (const [current, types] of roles)
    if (current && !types.includes(current.type))
      return issue('type-not-allowed', {
        name: current.name,
        type: current.type,
        predicate: predicate.name,
        allowed: types.join(', '),
      });
  if (predicate.labeled && !item.label?.trim()) return issue('label-missing', { predicate: predicate.name });
  if (!item.quote?.trim()) return issue('quote-not-found', { chapter: String(item.chapterIndex) });
  return [];
}

function entityIssues(state: DraftState): WorldIssue[] {
  const issues: WorldIssue[] = [];
  const groups = new Map<string, WorldEditEntity[]>();
  for (const item of state.entities) groups.set(nameKey(item.name), [...(groups.get(nameKey(item.name)) ?? []), item]);
  for (const [key, group] of groups) {
    const types = [...new Set(group.map((item) => item.type))].sort();
    if (types.length > 1 && types.join() !== 'Character,Persona')
      issues.push({
        key: `name-conflict:${key}`,
        reason: 'name-conflict',
        severity: 'warning',
        entityIds: group.map((item) => item.id),
        chapters: [...new Set(group.flatMap((item) => item.chapters))],
        params: { name: group[0].name, types: types.join(', ') },
      });
  }
  for (const item of state.entities) {
    const alias = item.aliases.find((value) => nameKey(value) !== nameKey(item.name) && groups.has(nameKey(value)));
    if (alias)
      issues.push({
        key: `alias-conflict:entity:${item.id}`,
        reason: 'alias-conflict',
        severity: 'warning',
        entityIds: [item.id],
        chapters: item.chapters,
        params: { alias, name: item.name },
      });
  }
  return issues;
}

export function fakeIssues(state: DraftState, scope: WorldEditScope, ontology: Ontology): WorldIssue[] {
  const world = withCatalog(state, scope);
  return [...state.facts.flatMap((item) => factIssues(world, item, ontology)), ...entityIssues(world)];
}

export function fakePreview(scope: WorldEditScope, edits: WorldDraftEdit[], ontology: Ontology): WorldEditPreview {
  const before = new Set(fakeIssues(scope, scope, ontology).map((issue) => issue.key));
  const after = fakeIssues(applyDraftEdits(scope, edits), scope, ontology);
  return {
    resolved: !after.some((issue) => issue.key === scope.issue?.key),
    added: after.filter((issue) => !before.has(issue.key)),
  };
}

@Component({
  selector: 'ds-world-edit-story-host',
  imports: [ButtonDirective, WorldEditDialogComponent],
  template: `
    <div class="d-flex flex-column gap-2 p-3">
      <div>
        <button dsBtn variant="primary" type="button" data-testid="world-edit-story-open" (click)="open.set(true)">
          Open world edit dialog
        </button>
      </div>
      @if (saved(); as edits) {
        <p class="meta">Overlay edits that would be saved:</p>
        <pre data-testid="world-edit-story-saved">{{ edits }}</pre>
      }
    </div>
    <ds-world-edit-dialog
      [open]="open()"
      [scope]="scopes[scenario()]"
      [ontology]="ontology"
      [preview]="preview()"
      [checking]="checking()"
      [busy]="busy()"
      (draftChange)="check($event)"
      (confirmed)="save($event)"
      (closed)="open.set(false)"
    />
  `,
})
export class WorldEditStoryHostComponent {
  readonly scenario = input<EditScenario>('fixTypeNotAllowed');
  protected readonly scopes = EDIT_SCOPES;
  protected readonly ontology = EDIT_ONTOLOGY;
  protected readonly open = signal(true);
  protected readonly preview = signal<WorldEditPreview | null>(null);
  protected readonly checking = signal(false);
  protected readonly busy = signal(false);
  protected readonly saved = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected check(edits: WorldDraftEdit[]): void {
    clearTimeout(this.timer);
    this.preview.set(null);
    this.checking.set(edits.length > 0);
    if (!edits.length) return;
    this.timer = setTimeout(() => {
      this.preview.set(fakePreview(this.scopes[this.scenario()], edits, this.ontology));
      this.checking.set(false);
    }, 350);
  }

  protected save(edits: WorldDraftEdit[]): void {
    this.busy.set(true);
    setTimeout(() => {
      this.saved.set(JSON.stringify(edits, null, 2));
      this.busy.set(false);
      this.open.set(false);
    }, 400);
  }
}
