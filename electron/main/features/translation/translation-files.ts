import { join } from 'node:path';
import { TARGET_LANGUAGES, TargetLanguage } from '@dreamer/shared/models/translation';
import { isContentHash } from '@dreamer/shared/models/novel-store';
import { NovelFolder } from '../library/library-files';

export function translationLanguageDir(folder: NovelFolder, language: TargetLanguage): string {
  assertTargetLanguage(language);
  return join(folder.translation, language);
}

export function translationInstructionFile(folder: NovelFolder, language: TargetLanguage): string {
  return join(translationLanguageDir(folder, language), 'instruction.md');
}

export function translationGlossaryFile(folder: NovelFolder, language: TargetLanguage): string {
  return join(translationLanguageDir(folder, language), 'glossary.json');
}

export function translationIndexFile(folder: NovelFolder, language: TargetLanguage): string {
  return join(translationLanguageDir(folder, language), 'index.json');
}

export function translationChaptersDir(folder: NovelFolder, language: TargetLanguage): string {
  return join(translationLanguageDir(folder, language), 'chapters');
}

export function translationChapterFile(folder: NovelFolder, language: TargetLanguage, file: string): string {
  if (!isContentHash(file)) throw new Error('invalid content hash');
  return join(translationChaptersDir(folder, language), `${file}.json`);
}

function assertTargetLanguage(language: TargetLanguage): void {
  if (!TARGET_LANGUAGES.includes(language)) {
    throw new Error('invalid target language');
  }
}
