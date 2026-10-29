import { promises as fs, readFileSync } from 'node:fs';
import { glossaryKeyId, glossaryRows, pruneEntries } from '@dreamer/shared/core/glossary';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { GlossaryEntry, GlossaryFile, GlossaryKey, GlossaryRow } from '@dreamer/shared/models/translation';
import { TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { createLogger, Logger } from '../../logging/logger';
import { asWriteError } from '../library/library-io';
import { NovelFolder } from '../library/library-files';
import { writeFileAtomic } from '../library/novel/novel-files';
import { readAnalysisIndex } from '../analysis/analysis-files';
import { AnalysisSnapshots } from '../analysis/analysis-snapshot';
import { translationGlossaryFile, translationLanguageDir } from './translation-files';

const logger: Logger = createLogger('translation');

export function readGlossary(folder: NovelFolder, language: TargetLanguage): GlossaryEntry[] {
  const file: string = translationGlossaryFile(folder, language);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return [];
  }
  try {
    const parsed: GlossaryFile = JSON.parse(text) as GlossaryFile;
    if (parsed.version === 1 && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
    logger.warn(`glossary ignored, unsupported format: ${file}`);
  } catch (error: unknown) {
    logger.warn(`glossary ignored, invalid json: ${file} (${errorMessage(error)})`);
  }
  return [];
}

export function hasAnalysedWorld(folder: NovelFolder): boolean {
  return readAnalysisIndex(folder)?.chapters.some((entry) => !entry.error) ?? false;
}

export async function loadGlossaryRows(
  snapshots: AnalysisSnapshots,
  folder: NovelFolder,
  novel: NovelMetadata,
  language: TargetLanguage,
): Promise<GlossaryRow[]> {
  const entities: WorldEditEntity[] = (await snapshots.get(folder, novel)).model.state.entities;
  return glossaryRows(entities, readGlossary(folder, language));
}

export async function editGlossaryEntry(
  folder: NovelFolder,
  language: TargetLanguage,
  key: GlossaryKey,
  translation: string | null,
): Promise<void> {
  const id: string = glossaryKeyId(key);
  const entries: GlossaryEntry[] = readGlossary(folder, language).filter(
    (entry: GlossaryEntry) => glossaryKeyId(entry) !== id,
  );
  const trimmed: string = translation?.trim() ?? '';
  if (trimmed) entries.push(glossaryEntry(key, trimmed, 'user'));
  await writeGlossary(folder, language, entries);
}

export async function pruneGlossary(
  folder: NovelFolder,
  entities: WorldEditEntity[],
): Promise<Map<TargetLanguage, Set<string>>> {
  const removed: Map<TargetLanguage, Set<string>> = new Map();
  for (const language of TARGET_LANGUAGES) {
    const entries: GlossaryEntry[] = readGlossary(folder, language);
    const kept: GlossaryEntry[] = pruneEntries(entries, entities);
    if (kept.length !== entries.length) {
      await writeGlossary(folder, language, kept);
      removed.set(
        language,
        new Set(
          entries
            .filter((entry: GlossaryEntry): boolean => !kept.includes(entry))
            .map((entry: GlossaryEntry): string => glossaryKeyId(entry)),
        ),
      );
    }
  }
  return removed;
}

export async function saveLlmEntries(
  folder: NovelFolder,
  language: TargetLanguage,
  translations: { key: GlossaryKey; translation: string }[],
): Promise<string[]> {
  const entries: Map<string, GlossaryEntry> = new Map(
    readGlossary(folder, language).map((entry: GlossaryEntry) => [glossaryKeyId(entry), entry]),
  );
  const saved: string[] = [];
  for (const { key, translation } of translations) {
    const id: string = glossaryKeyId(key);
    if (entries.get(id)?.source === 'user') continue;
    entries.set(id, glossaryEntry(key, translation, 'llm'));
    saved.push(id);
  }
  if (saved.length > 0) await writeGlossary(folder, language, [...entries.values()]);
  return saved;
}

function glossaryEntry(key: GlossaryKey, translation: string, source: GlossaryEntry['source']): GlossaryEntry {
  const { entityType, entityName, term, kind }: GlossaryKey = key;
  return { entityType, entityName, term, kind, translation, source, updatedAt: new Date().toISOString() };
}

async function writeGlossary(folder: NovelFolder, language: TargetLanguage, entries: GlossaryEntry[]): Promise<void> {
  const data: GlossaryFile = { version: 1, entries };
  try {
    await fs.mkdir(translationLanguageDir(folder, language), { recursive: true });
    await writeFileAtomic(translationGlossaryFile(folder, language), JSON.stringify(data, null, 2));
  } catch (error: unknown) {
    asWriteError(error);
  }
}
