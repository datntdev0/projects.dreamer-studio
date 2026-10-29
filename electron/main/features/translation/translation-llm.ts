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
