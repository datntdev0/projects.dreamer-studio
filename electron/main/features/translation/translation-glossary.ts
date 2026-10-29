import { promises as fs } from 'node:fs';
import { glossaryKeyId, pruneEntries } from '@dreamer/shared/core/glossary';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { WorldEditEntity } from '@dreamer/shared/models/analysis';
import { GlossaryEntry, GlossaryFile, GlossaryKey } from '@dreamer/shared/models/translation';
import { TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { createLogger, Logger } from '../../logging/logger';
import { asWriteError } from '../library/library-io';
import { NovelFolder } from '../library/library-files';
import { writeFileAtomic } from '../library/novel/novel-files';
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
  if (trimmed) {
    const { entityType, entityName, term, kind }: GlossaryKey = key;
    entries.push({
      entityType,
      entityName,
      term,
      kind,
      translation: trimmed,
      source: 'user',
      updatedAt: new Date().toISOString(),
    });
  }
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

async function writeGlossary(folder: NovelFolder, language: TargetLanguage, entries: GlossaryEntry[]): Promise<void> {
  const data: GlossaryFile = { version: 1, entries };
  try {
    await fs.mkdir(translationLanguageDir(folder, language), { recursive: true });
    await writeFileAtomic(translationGlossaryFile(folder, language), JSON.stringify(data, null, 2));
  } catch (error: unknown) {
    asWriteError(error);
  }
}
