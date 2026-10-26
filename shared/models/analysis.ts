export type EntityType = 'character' | 'persona' | 'location' | 'organization' | 'glossary';
export type ChapterAnalysisStatus = 'not-analysed' | 'clean' | 'has-issues' | 'reviewed' | 'stale' | 'failed';
export type ItemStatus = 'verified' | 'failed' | 'accepted' | 'rejected';
export type FailReason =
  'words-not-found' | 'quote-not-found' | 'type-not-in-ontology' | 'predicate-not-in-ontology' | 'value-not-allowed';

export interface AnalysisEntity {
  id: string;
  type: EntityType | 'artifact';
  name: string;
  aliases: string[];
  wordsFound: string[];
  status: ItemStatus;
  reason?: FailReason;
  edited?: boolean;
}

export interface AnalysisFact {
  id: string;
  kind: 'relationship' | 'scalar';
  predicate: string;
  subjectId: string;
  objectId?: string;
  value?: string;
  quote: string | null;
  status: ItemStatus;
  reason?: FailReason;
  edited?: boolean;
  addedByUser?: boolean;
}

export interface ChapterAnalysisCounts {
  entities: number;
  facts: number;
  verified: number;
  failed: number;
  accepted: number;
  rejected: number;
}

export interface ChapterAnalysisSummary {
  index: number;
  title: string;
  file: string;
  resultFile?: string;
  status: ChapterAnalysisStatus;
  counts: ChapterAnalysisCounts;
  pending: boolean;
  error?: string;
}

export interface AnalysisChapterDetail extends ChapterAnalysisSummary {
  paragraphs: string[];
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

export type ChapterAnalysis = AnalysisChapterDetail;
export type AnalysisStep = 'preparation' | 'candidates' | 'predicates' | 'verification';

export interface AnalysisRun {
  runningChapter: number | null;
  step: AnalysisStep;
  done: number;
  total: number;
  failed: number;
}

export interface OntologyPredicate {
  name: string;
  kind: 'relationship' | 'scalar';
  subjectTypes: EntityType[];
  objectTypes?: EntityType[];
  allowedValues?: string[];
  description?: string;
}

export interface Ontology {
  entityTypes: EntityType[];
  entityTypeDescriptions: Partial<Record<EntityType, string>>;
  predicates: OntologyPredicate[];
}

export type OntologyProblemCode =
  | 'yaml-syntax'
  | 'file-unreadable'
  | 'root-not-map'
  | 'version-unsupported'
  | 'section-missing'
  | 'section-not-map'
  | 'unknown-key'
  | 'entity-type-unknown'
  | 'entity-type-not-listed'
  | 'description-not-text'
  | 'predicate-name-empty'
  | 'predicate-not-map'
  | 'kind-invalid'
  | 'type-list-invalid'
  | 'object-missing'
  | 'object-not-allowed'
  | 'values-not-allowed'
  | 'values-invalid'
  | 'value-duplicate'
  | 'character-outside-persona-of'
  | 'persona-of-invalid'
  | 'persona-of-missing'
  | 'persona-missing';

export interface OntologyProblem {
  line: number;
  code: OntologyProblemCode;
  params: Record<string, string>;
}

export interface OntologyParseResult {
  ontology: Ontology;
  problems: OntologyProblem[];
}

export interface WorldScalar {
  factId?: string;
  predicate: string;
  value: string;
  chapterIndex: number;
  quote: string | null;
  overlay?: boolean;
  stale?: boolean;
}

export interface WorldEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  degree: number;
  chapters: number[];
  scalars: WorldScalar[];
  overlay?: boolean;
  stale?: boolean;
  staleChapters: number[];
}

export interface WorldLink {
  factIds?: string[];
  source: string;
  target: string;
  predicate: string;
  chapters: number[];
  quotes: string[];
  overlay?: boolean;
  stale?: boolean;
  staleChapters: number[];
}

export interface World {
  entities: WorldEntity[];
  links: WorldLink[];
  mergedAt?: string | null;
}

export interface AnalysisMergeState {
  pending: number;
  openIssues: number;
  mergedAt: string | null;
}

export interface AnalysisStatus {
  novelId: string;
  chapters: ChapterAnalysisSummary[];
  run: AnalysisRun | null;
  merge: AnalysisMergeState;
  ontology: Ontology;
  ontologyProblems: OntologyProblem[];
}

export interface AnalysisChapterRequest {
  novelId: string;
  file: string;
}

export interface AnalysisRunOptions {
  mode: 'missing' | 'range' | 'full';
  from: number | null;
  to: number | null;
  overwrite: boolean;
  stage: EntityType | 'all';
  batchSize: number;
}

export interface AnalysisRunRequest extends AnalysisRunOptions {
  novelId: string;
}

export interface AnalysisPlan {
  count: number;
  from: number | null;
  to: number | null;
  batches: number;
  blockedReason: string | null;
}

export interface WorldQuery {
  novelId: string;
  chapter: number | null;
  only: boolean;
}

export interface TextContext {
  before: string;
  match: string;
  after: string;
}

export type ReviewStatusFilter = ItemStatus | 'open' | 'all';

export interface ReviewQuery {
  novelId: string;
  status: ReviewStatusFilter;
  chapterIndex: number | null;
  itemKind: 'entity' | 'fact' | 'all';
}

export interface ReviewItem {
  chapterIndex: number;
  chapterTitle: string;
  itemKind: 'entity' | 'fact';
  entity?: AnalysisEntity;
  fact?: AnalysisFact;
  subjectName?: string;
  objectName?: string;
  context: TextContext | null;
}

export interface ReviewPage {
  items: ReviewItem[];
  openCount: number;
  failedChapters: ChapterAnalysisSummary[];
}

export interface QuoteQuery {
  novelId: string;
  quote: string;
}

export interface QuoteMatch {
  chapterIndex: number;
  chapterTitle: string;
  context: TextContext;
}

export interface OccurrenceQuery {
  novelId: string;
  entityId: string;
}

export interface Occurrence {
  chapterIndex: number;
  chapterTitle: string;
  context: TextContext | null;
}

export type ReviewEdit =
  | { kind: 'review-reject'; chapterIndex: number; itemKind: 'entity' | 'fact'; itemId: string }
  | {
      kind: 'review-fix';
      chapterIndex: number;
      itemKind: 'entity' | 'fact';
      itemId: string;
      entity?: Partial<AnalysisEntity>;
      fact?: Partial<AnalysisFact>;
    }
  | { kind: 'review-accept'; chapterIndex: number; itemKind: 'entity' | 'fact'; itemId: string };

export type OverlayEdit =
  | { kind: 'entity-add'; entity: { id: string; type: EntityType; name: string; aliases?: string[] } }
  | { kind: 'entity-rename'; entityId: string; name: string }
  | { kind: 'entity-change-type'; entityId: string; entityType: EntityType }
  | { kind: 'entity-add-alias'; entityId: string; alias: string }
  | { kind: 'entity-remove-alias'; entityId: string; alias: string }
  | { kind: 'entity-merge'; sourceIds: string[]; targetId: string }
  | {
      kind: 'entity-split';
      entityId: string;
      newEntity: { id: string; type: EntityType; name: string };
      aliases: string[];
      factIds: string[];
    }
  | { kind: 'entity-delete'; entityId: string }
  | { kind: 'entity-reset'; entityId: string }
  | { kind: 'fact-add'; fact: AnalysisFact; chapterIndex: number }
  | { kind: 'fact-edit'; factId: string; chapterIndex: number; patch: Partial<AnalysisFact> }
  | { kind: 'fact-delete'; factId: string; chapterIndex: number }
  | { kind: 'fact-reset'; factId: string; chapterIndex: number };

export type WorldEdit = ReviewEdit | OverlayEdit;

export interface AnalysisEditRequest {
  novelId: string;
  edit: WorldEdit;
}

export interface AnalysisProgress {
  novelId: string;
  chapter: number | null;
  step: AnalysisStep;
  done: number;
  total: number;
  failed: number;
}

export interface AnalysisChanged {
  novelId: string;
}
