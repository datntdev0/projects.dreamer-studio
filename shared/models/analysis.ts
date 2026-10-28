import type { Language } from '../i18n/translate';

export const ENTITY_TYPES = ['Character', 'Persona', 'Location', 'Organization', 'Artifact', 'Glossary'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export type EntityTypeName = EntityType | 'unknown';
export const ENTITY_PROPERTIES = ['name', 'alias', 'title'] as const;
export type EntityPropertyName = (typeof ENTITY_PROPERTIES)[number];
export type ChapterAnalysisStatus = 'not-analysed' | 'analysed' | 'stale' | 'failed';
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
export type IssueSeverity = 'error' | 'warning';

export interface AnalysisEntity {
  id: string;
  type: EntityTypeName;
  name: string;
  aliases: string[];
  titles?: string[];
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
}

export interface ChapterAnalysisCounts {
  entities: number;
  facts: number;
}

export interface ChapterAnalysisSummary {
  index: number;
  title: string;
  file: string;
  resultFile?: string;
  status: ChapterAnalysisStatus;
  counts: ChapterAnalysisCounts;
  error?: string;
}

export interface AnalysisChapterDetail extends ChapterAnalysisSummary {
  paragraphs: string[];
  entities: AnalysisEntity[];
  facts: AnalysisFact[];
}

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
  display?: Partial<Record<Language, string>>;
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
  | 'section-not-map'
  | 'item-not-map'
  | 'unknown-key'
  | 'text-invalid'
  | 'flag-invalid'
  | 'entity-type-unknown'
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

export interface FactRef {
  factId: string;
  chapterIndex: number;
}

export interface WorldIssue {
  key: string;
  reason: FailReason;
  severity: IssueSeverity;
  entityIds: string[];
  fact?: FactRef;
  chapters: number[];
  params: Record<string, string>;
}

export interface WorldEditEntity {
  id: string;
  type: EntityTypeName;
  name: string;
  aliases: string[];
  titles: string[];
  chapters: number[];
}

export interface WorldFact {
  id: string;
  chapterIndex: number;
  kind: 'relationship' | 'scalar';
  predicate: string;
  subjectId: string;
  objectId?: string;
  subjectName?: string;
  objectName?: string;
  label?: string;
  quote: string | null;
}

export type EntityPatch = Partial<Pick<WorldEditEntity, 'name' | 'type' | 'aliases' | 'titles'>>;
export type FactPatch = Partial<Pick<WorldFact, 'subjectId' | 'predicate' | 'objectId' | 'label' | 'quote'>>;

export type WorldDraftEdit =
  | { kind: 'entity-add'; entity: WorldEditEntity }
  | { kind: 'entity-edit'; entityId: string; patch: EntityPatch }
  | { kind: 'entity-delete'; entityId: string }
  | { kind: 'entity-merge'; sourceIds: string[]; targetId: string }
  | { kind: 'entity-split'; entityId: string; newEntity: WorldEditEntity; aliases: string[]; facts: FactRef[] }
  | { kind: 'fact-add'; fact: WorldFact }
  | { kind: 'fact-edit'; factId: string; chapterIndex: number; patch: FactPatch }
  | { kind: 'fact-delete'; factId: string; chapterIndex: number };

export interface OverlayFile {
  version: 2;
  edits: WorldDraftEdit[];
}

export interface WorldEditScope {
  issue: WorldIssue | null;
  entities: WorldEditEntity[];
  facts: WorldFact[];
  catalog: WorldEditEntity[];
  focus: string[];
}

export interface WorldEditPreview {
  resolved: boolean;
  added: WorldIssue[];
}

export interface WorldScalar {
  factId: string;
  predicate: string;
  chapterIndex: number;
  quote: string | null;
  overlay?: boolean;
  stale?: boolean;
  issue?: IssueSeverity;
}

export interface WorldEntity {
  id: string;
  type: EntityTypeName;
  name: string;
  aliases: string[];
  titles: string[];
  degree: number;
  chapters: number[];
  scalars: WorldScalar[];
  overlay?: boolean;
  stale?: boolean;
  staleChapters: number[];
  issue?: IssueSeverity;
}

export interface WorldLink {
  factRefs: FactRef[];
  source: string;
  target: string;
  predicate: string;
  label?: string;
  chapters: number[];
  quotes: string[];
  overlay?: boolean;
  stale?: boolean;
  staleChapters: number[];
  issue?: IssueSeverity;
}

export interface World {
  entities: WorldEntity[];
  links: WorldLink[];
  orphans: WorldDraftEdit[];
}

export interface AnalysisIssueCounts {
  errors: number;
  warnings: number;
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
  issues: AnalysisIssueCounts;
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
  counts: ChapterAnalysisCounts;
  error?: string;
  analysedAt: string;
}

export interface AnalysisIndexFile {
  version: 1;
  chapters: AnalysisIndexEntry[];
  lastRun: AnalysisLastRun | null;
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

export interface ReviewQuery {
  novelId: string;
  chapterIndex: number | null;
  itemKind: 'entity' | 'fact' | 'all';
}

export interface ReviewItem {
  issue: WorldIssue;
  entities: WorldEditEntity[];
  fact: WorldFact | null;
  chapterIndex: number;
  chapterTitle: string;
  context: TextContext | null;
}

export interface ReviewPage {
  items: ReviewItem[];
  counts: AnalysisIssueCounts;
}

export interface WorldScopeRequest {
  novelId: string;
  issueKey: string | null;
  entityIds: string[];
}

export interface WorldPreviewRequest {
  novelId: string;
  issueKey: string | null;
  edits: WorldDraftEdit[];
}

export interface AnalysisEditRequest {
  novelId: string;
  edits: WorldDraftEdit[];
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
