import { glossaryTerm } from '@dreamer/shared/core/glossary';
import { ErrorCode } from '@dreamer/shared/errors/app-error';
import type { GlossaryRow, TargetLanguage } from '@dreamer/shared/models/translation';
import type { Logger } from '../../logging/logger';
import { askChecked } from '../llm/llm-checked';
import type { AskLlm } from '../llm/llm-checked';

export const TRANSLATION_TIMEOUT_MS: number = 10 * 60 * 1000;

interface GlossaryBatchOutput {
  translations: GlossaryBatchTranslation[];
}

interface GlossaryBatchTranslation {
  id: number;
  translation: string;
}

export interface ChapterPartTranslation {
  title: string;
  paragraphs: string[];
}

const glossaryBatchSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          translation: { type: 'string' },
        },
        required: ['id', 'translation'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

const chapterPartSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'paragraphs'],
  additionalProperties: false,
};

function targetLanguageName(language: TargetLanguage): string {
  return language === 'en' ? 'English' : 'Vietnamese';
}

function nameLine(row: GlossaryRow, id: number, otherNames: string[]): string {
  const names: string = otherNames.length > 0 ? otherNames.join(', ') : 'none';
  return `${id}. ${glossaryTerm(row)}; kind: ${row.kind}; entity: ${row.entityName} (${row.entityType}); other names: ${names}`;
}

function glossaryBatchPrompt(input: {
  rows: GlossaryRow[];
  otherNames: Map<GlossaryRow, string[]>;
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  instruction: string;
}): string {
  return [
    `Translate these names of a novel from ${input.sourceLanguage} into ${targetLanguageName(input.targetLanguage)}; return JSON: {"translations":[{"id":1,"translation":"..."}]}.`,
    '## Instruction',
    input.instruction,
    '## Names',
    input.rows
      .map((row: GlossaryRow, index: number): string => nameLine(row, index + 1, input.otherNames.get(row) ?? []))
      .join('\n'),
    '## Rules',
    [
      '- Return one translation per id.',
      '- Keep the names of one entity consistent.',
      '- Translate titles as titles.',
      '- Return every id exactly once.',
    ].join('\n'),
  ].join('\n\n');
}

function chapterPartPrompt(input: {
  chapter: number;
  part: number;
  parts: number;
  title: string | null;
  paragraphs: string[];
  glossary: { term: string; translation: string; entityType: string }[];
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  instruction: string;
}): string {
  const glossary: string =
    input.glossary.length === 0
      ? 'none'
      : input.glossary
          .map((entry: { term: string; translation: string; entityType: string }): string => {
            return `${entry.term} → ${entry.translation} (${entry.entityType})`;
          })
          .join('\n');
  return [
    `Translate part ${input.part}/${input.parts} of chapter ${input.chapter} from ${input.sourceLanguage} into ${targetLanguageName(input.targetLanguage)}; return JSON: {"title":"...","paragraphs":["..."]}.`,
    '## Instruction',
    input.instruction,
    '## Glossary',
    glossary,
    ...(input.title === null ? [] : ['## Title', input.title]),
    '## Paragraphs',
    input.paragraphs.map((paragraph: string, index: number): string => `[${index + 1}] ${paragraph}`).join('\n'),
    '## Rules',
    [
      '- Return one translated paragraph per numbered paragraph, in the same order, exactly ' +
        input.paragraphs.length +
        '.',
      '- Use the glossary translations for those names.',
      '- `title` must be the translated title, or "" when no title was given.',
    ].join('\n'),
  ].join('\n\n');
}

function checkChapterPart(
  input: { title: string | null; paragraphs: string[] },
  output: ChapterPartTranslation,
): { result: ChapterPartTranslation; errors: string[] } {
  const title: string = input.title === null ? '' : output.title.trim();
  const paragraphs: string[] = output.paragraphs.map((paragraph: string): string => paragraph.trim());
  const errors: string[] = [];
  if (paragraphs.length !== input.paragraphs.length) {
    errors.push(`Return exactly ${input.paragraphs.length} paragraphs, got ${paragraphs.length}.`);
  }
  paragraphs.forEach((paragraph: string, index: number): void => {
    if (paragraph === '') errors.push(`Empty paragraph ${index + 1}.`);
  });
  if (input.title !== null && title === '') errors.push('Empty title.');
  return { result: { title, paragraphs }, errors };
}

function checkGlossaryBatch(
  rows: GlossaryRow[],
  output: GlossaryBatchOutput,
): {
  result: Map<GlossaryRow, string>;
  errors: string[];
} {
  const result: Map<GlossaryRow, string> = new Map();
  const errors: string[] = [];
  const seen: Set<number> = new Set();
  for (const item of output.translations) {
    if (!Number.isInteger(item.id) || item.id < 1 || item.id > rows.length) {
      errors.push(`Unknown id ${String(item.id)}.`);
      continue;
    }
    if (seen.has(item.id)) {
      errors.push(`Duplicate id ${item.id}.`);
      continue;
    }
    seen.add(item.id);
    const translation: string = item.translation.trim();
    if (translation === '') {
      errors.push(`Empty translation for id ${item.id}.`);
      continue;
    }
    result.set(rows[item.id - 1], translation);
  }
  for (let id: number = 1; id <= rows.length; id++) {
    if (!seen.has(id)) errors.push(`Missing id ${id}.`);
  }
  return { result, errors };
}

export function askGlossaryBatch(input: {
  batch: number;
  rows: GlossaryRow[];
  otherNames: Map<GlossaryRow, string[]>;
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  instruction: string;
  ask: AskLlm;
  log: Logger;
}): Promise<Map<GlossaryRow, string>> {
  return askChecked<GlossaryBatchOutput, Map<GlossaryRow, string>>({
    label: `Glossary batch ${input.batch}`,
    slug: `glossary-b${String(input.batch).padStart(3, '0')}`,
    prompt: glossaryBatchPrompt(input),
    schema: glossaryBatchSchema,
    timeoutMs: TRANSLATION_TIMEOUT_MS,
    failureCode: ErrorCode.TranslationLlmOutputInvalid,
    ask: input.ask,
    log: input.log,
    check: (output: GlossaryBatchOutput): { result: Map<GlossaryRow, string>; errors: string[] } =>
      checkGlossaryBatch(input.rows, output),
  });
}

export function askChapterPart(input: {
  chapter: number;
  part: number;
  parts: number;
  title: string | null;
  paragraphs: string[];
  glossary: { term: string; translation: string; entityType: string }[];
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  instruction: string;
  ask: AskLlm;
  log: Logger;
}): Promise<ChapterPartTranslation> {
  return askChecked<ChapterPartTranslation, ChapterPartTranslation>({
    label: `Chapter ${input.chapter} part ${input.part}/${input.parts}`,
    slug: `chapter-c${String(input.chapter).padStart(4, '0')}-p${String(input.part).padStart(2, '0')}`,
    prompt: chapterPartPrompt(input),
    schema: chapterPartSchema,
    timeoutMs: TRANSLATION_TIMEOUT_MS,
    failureCode: ErrorCode.TranslationLlmOutputInvalid,
    ask: input.ask,
    log: input.log,
    check: (output: ChapterPartTranslation): { result: ChapterPartTranslation; errors: string[] } =>
      checkChapterPart(input, output),
  });
}
