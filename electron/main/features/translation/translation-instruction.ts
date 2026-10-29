import { createHash } from 'node:crypto';
import { promises as fs, Stats } from 'node:fs';
import { TargetLanguage, TranslationInstruction } from '@dreamer/shared/models/translation';
import { translationInstructionDefaultFile } from '@storage/paths';
import { asWriteError } from '../library/library-io';
import { NovelFolder } from '../library/library-files';
import { writeFileAtomic } from '../library/novel/novel-files';
import { translationInstructionFile, translationLanguageDir } from './translation-files';

export async function loadInstruction(
  folder: NovelFolder,
  novelId: string,
  language: TargetLanguage,
): Promise<TranslationInstruction> {
  const file: string = translationInstructionFile(folder, language);
  try {
    const text: string = await fs.readFile(file, 'utf8');
    const { mtime }: Stats = await fs.stat(file);
    return { novelId, language, text, isDefault: false, updatedAt: mtime.toISOString() };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    const text: string = await fs.readFile(translationInstructionDefaultFile(language), 'utf8');
    return { novelId, language, text, isDefault: true, updatedAt: null };
  }
}

export async function saveInstruction(
  folder: NovelFolder,
  novelId: string,
  language: TargetLanguage,
  text: string,
): Promise<TranslationInstruction> {
  try {
    await fs.mkdir(translationLanguageDir(folder, language), { recursive: true });
    await writeFileAtomic(translationInstructionFile(folder, language), text.trim());
  } catch (error: unknown) {
    asWriteError(error);
  }
  return loadInstruction(folder, novelId, language);
}

export async function resetInstruction(
  folder: NovelFolder,
  novelId: string,
  language: TargetLanguage,
): Promise<TranslationInstruction> {
  try {
    await fs.unlink(translationInstructionFile(folder, language));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      asWriteError(error);
    }
  }
  return loadInstruction(folder, novelId, language);
}

export function instructionHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}
