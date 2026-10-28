import { Component, input, signal } from '@angular/core';
import { ButtonDirective } from '@components/button/button.directive';
import { previewEdits } from '@dreamer/shared/core/world';
import type { WorldModel } from '@dreamer/shared/core/world';
import { checkWorld } from '@dreamer/shared/core/world-checks';
import type { DraftState } from '@dreamer/shared/core/world-edit';
import type { EntityType, Ontology, WorldDraftEdit, WorldFact } from '@dreamer/shared/models/analysis';
import type { WorldEditEntity, WorldEditPreview, WorldEditScope } from '@dreamer/shared/models/analysis';
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

function editModel(scope: WorldEditScope, ontology: Ontology): WorldModel {
  const state = withCatalog(scope, scope);
  const issues = checkWorld({ ...state, ontology, texts: [] });
  return { state, issues, orphans: [], touched: { entities: [], facts: [] }, staleChapters: [] };
}

export function fakePreview(scope: WorldEditScope, edits: WorldDraftEdit[], ontology: Ontology): WorldEditPreview {
  return previewEdits(editModel(scope, ontology), { edits, issueKey: scope.issue?.key ?? null, ontology, texts: [] });
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
