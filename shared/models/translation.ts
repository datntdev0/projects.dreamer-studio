import type { EntityType } from './analysis';

export type TargetLanguage = 'en' | 'vi';
export type TranslationView = 'reader' | 'glossary';
export type TranslationDisplay = 'original' | 'translation' | 'side';
export type GlossaryStatus = 'untranslated' | 'llm' | 'user';
export type GlossaryTermKind = 'name' | 'alias' | 'title';
export type GlossaryScope = 'untranslated' | 'all';
export type GlossaryBatchSize = 50 | 100 | 200;
export type ChapterTranslationStatus = 'not-translated' | 'translated' | 'has-issues' | 'stale' | 'failed';
export type StaleReason = 'source' | 'glossary';
export type TranslationIssueKind = 'missing-name' | 'untranslated-name' | 'paragraph-count';
export type TranslationRunKind = 'glossary' | 'content';
export type TranslationRunMode = 'missing' | 'range' | 'full';

export const TARGET_LANGUAGES: TargetLanguage[] = ['en', 'vi'];
export const GLOSSARY_BATCH_SIZES: GlossaryBatchSize[] = [50, 100, 200];

export interface GlossaryKey {
  entityType: EntityType;
  entityName: string;
  term: string | null;
  kind: GlossaryTermKind;
}

export interface GlossaryRow extends GlossaryKey {
  translation: string | null;
  status: GlossaryStatus;
  chapters: number;
  chapterIndexes: number[];
}

export interface GlossaryEntry extends GlossaryKey {
  translation: string;
  source: 'llm' | 'user';
  updatedAt: string;
}

export interface GlossaryFile {
  version: 1;
  entries: GlossaryEntry[];
}

export interface GlossaryPage {
  novelId: string;
  language: TargetLanguage;
  analysed: boolean;
  rows: GlossaryRow[];
}

export interface TranslationInstruction {
  novelId: string;
  language: TargetLanguage;
  text: string;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface LlmChoiceState {
  available: boolean;
  label: string;
  reason: string | null;
}

export interface ChapterTranslationSummary {
  index: number;
  file: string;
  title: string | null;
  status: ChapterTranslationStatus;
  issues: number;
  edited: boolean;
  staleReason: StaleReason | null;
  instructionChanged: boolean;
  error: string | null;
}

export interface TranslationLanguageSummary {
  language: TargetLanguage;
  translated: number;
  total: number;
}

export interface TranslationRun {
  kind: TranslationRunKind;
  language: TargetLanguage;
  runningChapter: number | null;
  done: number;
  total: number;
  failed: number;
}

export interface TranslationLastRun {
  runId: string;
  kind: TranslationRunKind;
  language: TargetLanguage;
  translated: number;
  failed: number;
}

export interface TranslationStatus {
  novelId: string;
  language: TargetLanguage;
  targets: TargetLanguage[];
  languages: TranslationLanguageSummary[];
  chapters: ChapterTranslationSummary[];
  glossary: { total: number; untranslated: number };
  run: TranslationRun | null;
  lastRun: TranslationLastRun | null;
  llm: { glossary: LlmChoiceState; content: LlmChoiceState };
}

export interface TranslationIssue {
  id: string;
  kind: TranslationIssueKind;
  name: string | null;
  translation: string | null;
  inTitle: boolean;
  sourceParagraph: number | null;
  translatedParagraph: number | null;
  sourceCount: number | null;
  translatedCount: number | null;
}

export interface ChapterTranslation extends ChapterTranslationSummary {
  language: TargetLanguage;
  title: string;
  paragraphs: string[];
  issueList: TranslationIssue[];
  translatedAt: string | null;
}

export interface TranslationStatusQuery {
  novelId: string;
  language: TargetLanguage | null;
}

export interface TranslationChapterRequest {
  novelId: string;
  language: TargetLanguage;
  file: string;
}

export interface ContentRunOptions {
  language: TargetLanguage;
  mode: TranslationRunMode;
  from: number | null;
  to: number | null;
  overwrite: boolean;
}

export interface ContentRunRequest extends ContentRunOptions {
  novelId: string;
  instruction: string | null;
}

export interface ContentRunPlan {
  count: number;
  from: number | null;
  to: number | null;
  userEdited: number;
  untranslatedNames: number;
  blockedReason: string | null;
}

export interface GlossaryRunRequest {
  novelId: string;
  language: TargetLanguage;
  scope: GlossaryScope;
  batchSize: GlossaryBatchSize;
  instruction: string | null;
}

export interface GlossaryRunPlan {
  count: number;
  batches: number;
  blockedReason: string | null;
}

export interface GlossaryEditRequest {
  novelId: string;
  language: TargetLanguage;
  key: GlossaryKey;
  translation: string | null;
}

export interface InstructionRequest {
  novelId: string;
  language: TargetLanguage;
}

export interface InstructionSaveRequest extends InstructionRequest {
  text: string;
}

export interface TranslationSaveRequest {
  novelId: string;
  language: TargetLanguage;
  file: string;
  title: string;
  paragraphs: string[];
}

export interface TranslationProgress {
  novelId: string;
  run: TranslationRun | null;
}

export interface TranslationChanged {
  novelId: string;
  language: TargetLanguage;
}
