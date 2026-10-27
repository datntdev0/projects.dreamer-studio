export const ENTITY_TYPES = ['Character', 'Persona', 'Location', 'Organization', 'Artifact', 'Glossary'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_PROPERTIES = ['name', 'alias', 'title'] as const;
export type EntityPropertyName = (typeof ENTITY_PROPERTIES)[number];
export type ChapterAnalysisStatus = 'not-analysed' | 'clean' | 'has-issues' | 'reviewed' | 'stale' | 'failed';
export type ItemStatus = 'verified' | 'failed' | 'accepted' | 'rejected';
export type FailReason =
  | 'words-not-found'
  | 'quote-not-found'
  | 'entity-not-in-ontology'
  | 'predicate-not-in-ontology'
  | 'entity-not-found'
  | 'type-not-allowed'
  | 'label-missing'
  | 'name-conflict'
  | 'alias-conflict';

export interface AnalysisEntity {
  id: string;
  type: EntityType | 'unknown';
  name: string;
  aliases: string[];
  titles?: string[];
  wordsFound: string[];
  status: ItemStatus;
  reason?: FailReason;
  issue?: FailReason;
  edited?: boolean;
}

export interface AnalysisFact {
  id: string;
  kind: 'relationship' | 'scalar';
  predicate: string;
  subjectId: string;
  objectId?: string;
  subjectName?: string;
  objectName?: string;
  label?: string;
  quote: string | null;
  status: ItemStatus;
  reason?: FailReason;
  issue?: FailReason;
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
  symmetric?: boolean;
  labeled?: boolean;
  description?: string;
}

export interface EntityProperty {
  name: EntityPropertyName;
  required: boolean;
  multiple: boolean;
  description?: string;
}

export interface Ontology {
  name: string;
  task: string;
  rules: string[];
  entityTypes: EntityType[];
  entityTypeDescriptions: Partial<Record<EntityType, string>>;
  entityTypeExamples: Partial<Record<EntityType, string[]>>;
  entityTypeProperties: Partial<Record<EntityType, EntityProperty[]>>;
  predicates: OntologyPredicate[];
}

export type OntologyProblemCode =
  | 'yaml-syntax'
  | 'file-unreadable'
  | 'root-not-map'
  | 'version-unsupported'
  | 'section-missing'
  | 'section-not-list'
  | 'item-not-map'
  | 'unknown-key'
  | 'text-invalid'
  | 'flag-invalid'
  | 'entity-type-unknown'
  | 'entity-type-duplicate'
  | 'entity-type-not-listed'
  | 'predicate-name-invalid'
  | 'predicate-duplicate'
  | 'type-list-invalid'
  | 'symmetric-types-differ'
  | 'character-outside-has-persona'
  | 'has-persona-invalid'
  | 'has-persona-missing'
  | 'persona-missing'
  | 'property-unknown'
  | 'property-duplicate'
  | 'name-property-invalid'
  | 'property-not-multiple';

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
  titles: string[];
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
  label?: string;
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

export interface AnalysisIssueCounts {
  open: number;
  errors: number;
}

export interface AnalysisMergeState {
  pending: number;
  openIssues: number;
  openErrors: number;
  mergedAt: string | null;
}

export interface AnalysisLastRun {
  runId: string;
  analysed: number;
  failed: number;
  issues: number;
  finishedAt: string;
}

export interface AnalysisStatus {
  novelId: string;
  chapters: ChapterAnalysisSummary[];
  run: AnalysisRun | null;
  merge: AnalysisMergeState;
  ontology: Ontology;
  ontologyProblems: OntologyProblem[];
  lastRun: AnalysisLastRun | null;
}

export interface ChapterResult {
  version: 1;
  file: string;
  index: number;
  title: string;
  analysedAt: string;
  llm: string;
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

export interface AnalysisIndexEntry {
  index: number;
  file: string;
  status: 'clean' | 'has-issues' | 'reviewed' | 'failed';
  counts: ChapterAnalysisCounts;
  error?: string;
  analysedAt: string;
  updatedAt?: string;
}

export interface AnalysisIndexFile {
  version: 1;
  chapters: AnalysisIndexEntry[];
  lastRun: AnalysisLastRun | null;
  mergedAt: string | null;
  issues?: AnalysisIssueCounts;
}

export interface WorldFileChapter {
  index: number;
  file: string;
  title: string;
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

export interface WorldFile {
  version: 1;
  mergedAt: string;
  chapters: WorldFileChapter[];
}

export interface CandidateOutput {
  entities: { type: string; name: string; aliases: string[]; titles?: string[] }[];
}

export interface PredicateOutput {
  facts: {
    predicate: string;
    subject: string;
    object: string | null;
    label: string | null;
    quote: string;
  }[];
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

export interface ReviewRelated {
  name: string;
  type: EntityType | 'unknown';
  chapters: number[];
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
  issueKey?: string;
  related?: ReviewRelated[];
}

export interface ReviewEntityOption {
  id: string;
  name: string;
  type: EntityType | 'unknown';
}

export interface ReviewPage {
  items: ReviewItem[];
  openCount: number;
  entities: Record<number, ReviewEntityOption[]>;
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
