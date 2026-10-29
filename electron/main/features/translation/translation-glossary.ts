import { promises as fs } from 'node:fs';
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

export async function readGlossary(folder: NovelFolder, language: TargetLanguage): Promise<GlossaryEntry[]> {
  const file: string = translationGlossaryFile(folder, language);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
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
  return glossaryRows(entities, await readGlossary(folder, language));
}

export async function editGlossaryEntry(
  folder: NovelFolder,
  language: TargetLanguage,
  key: GlossaryKey,
  translation: string | null,
): Promise<void> {
  const id: string = glossaryKeyId(key);
  const entries: GlossaryEntry[] = (await readGlossary(folder, language)).filter(
    (entry: GlossaryEntry) => glossaryKeyId(entry) !== id,
  );
  const trimmed: string = translation?.trim() ?? '';
  if (trimmed) entries.push(glossaryEntry(key, trimmed, 'user'));
  await writeGlossary(folder, language, entries);
}

export async function pruneGlossary(folder: NovelFolder, entities: WorldEditEntity[]): Promise<boolean> {
  let changed: boolean = false;
  for (const language of TARGET_LANGUAGES) {
    const entries: GlossaryEntry[] = await readGlossary(folder, language);
    const kept: GlossaryEntry[] = pruneEntries(entries, entities);
    if (kept.length !== entries.length) {
      await writeGlossary(folder, language, kept);
      changed = true;
    }
  }
  return changed;
}

export async function saveLlmEntries(
  folder: NovelFolder,
  language: TargetLanguage,
  translations: { key: GlossaryKey; translation: string }[],
): Promise<number> {
  const entries: Map<string, GlossaryEntry> = new Map(
    (await readGlossary(folder, language)).map((entry: GlossaryEntry) => [glossaryKeyId(entry), entry]),
  );
  let saved: number = 0;
  for (const { key, translation } of translations) {
    const id: string = glossaryKeyId(key);
    if (entries.get(id)?.source === 'user') continue;
    entries.set(id, glossaryEntry(key, translation, 'llm'));
    saved++;
  }
  if (saved > 0) await writeGlossary(folder, language, [...entries.values()]);
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
