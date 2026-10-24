import { readFile } from 'node:fs/promises';
import { ChapterFile, ChapterTexts } from '@dreamer/shared/core/chapter-changes';
import { splitParagraphs } from '@dreamer/shared/core/novel-text';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { chapterPath, NovelFolder } from './library-files';
import { writeChapter } from './novel/novel-files';

export function chapterTexts(folder: NovelFolder): ChapterTexts {
  return {
    read: async (file: string): Promise<string[]> => {
      try {
        return splitParagraphs(await readFile(chapterPath(folder, file), 'utf-8'));
      } catch {
        throw new CodedError(ErrorCode.ChapterFileMissing, `Chapter file is missing: ${file}`);
      }
    },
    write: (paragraphs: string[]): Promise<ChapterFile> => writeChapter(folder, paragraphs.join('\n')),
  };
}
