import { Buffer } from 'node:buffer';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { chapterStats, contentHash, decodeUtf8, normalizeChapterText } from '@dreamer/shared/core/novel-text';
import { DEFAULT_PUBLICATION, PACKAGE_CHAPTERS_DIR } from '@dreamer/shared/models/novel-package';
import { PACKAGE_FORMAT_VERSION, PACKAGE_LIMITS } from '@dreamer/shared/models/novel-package';
import { PACKAGE_METADATA_FILE, PACKAGE_TYPE_NOVEL } from '@dreamer/shared/models/novel-package';
import { ImportPreview, PackageChapter, PackageCover, PackageFile } from '@dreamer/shared/models/novel-package';
import { PackageLimit, PackageLimits, PackageMetadata, PackageParams } from '@dreamer/shared/models/novel-package';
import { PackageProblem, PackageReadResult, PackageRefusal } from '@dreamer/shared/models/novel-package';
import { PackageRefused } from '@dreamer/shared/models/novel-package';
import { PackageWarning, PreviewChapter, Publication } from '@dreamer/shared/models/novel-package';
import { normalizeTags } from '@dreamer/shared/models/novel-store';
import { createLogger, Logger } from '../../logging/logger';

const logger: Logger = createLogger('library');

interface IndexedEntry {
  entry: yauzl.Entry;
  name: string;
  symlink: boolean;
}

interface CentralDirectory {
  entries: IndexedEntry[];
  byName: Map<string, IndexedEntry>;
  encrypted: boolean;
  unsafeName: string | null;
  duplicateName: string | null;
  unpackedBytes: number;
}

interface MetadataCheck {
  metadata: PackageMetadata;
  chapterIndexes: number[];
  problems: PackageProblem[];
}

interface CheckedChapters {
  chapters: PackageChapter[];
  indexes: number[];
}

interface ChapterCheck {
  chapters: PreviewChapter[];
  problems: PackageProblem[];
  warnings: PackageWarning[];
}

interface PackageFileInspection {
  file: PackageFile;
  regular: boolean;
}

interface ParsedMetadata {
  value: Record<string, unknown> | null;
  line: number;
}

interface MetadataValue {
  value: Record<string, unknown>;
}

interface CoverCheck {
  cover: PackageCover | null;
  problem: PackageProblem | null;
}

export class EntryTooLargeError extends Error {
  readonly limit: PackageLimit;
  readonly file: string;
  readonly size: number;
  readonly max: number;

  constructor(limit: PackageLimit, size: number, max: number, file: string) {
    super('ZIP entry exceeds its limit');
    this.limit = limit;
    this.file = file;
    this.size = size;
    this.max = max;
  }
}

function refused(
  file: PackageFile,
  refusal: PackageRefusal,
  params: PackageParams = {},
  problems: PackageProblem[] = [],
): PackageRefused {
  return { status: 'refused', refusal, params, problems, file };
}

function refusedProblems(file: PackageFile, problems: PackageProblem[]): PackageRefused {
  return refused(file, 'problems', { count: problems.length }, problems);
}

function problem(code: PackageProblem['code'], params: PackageParams, where: string): PackageProblem {
  return { code, params, where };
}

function warning(code: PackageWarning['code'], params: PackageParams, where: string): PackageWarning {
  return { code, params, where };
}

function metadataWhere(field: string): string {
  return `${PACKAGE_METADATA_FILE} · ${field}`;
}

async function packageFile(path: string): Promise<PackageFileInspection> {
  const file: PackageFile = { name: basename(path), size: 0, modifiedMs: 0 };
  try {
    const details: Awaited<ReturnType<typeof stat>> = await stat(path);
    file.size = details.size;
    file.modifiedMs = details.mtimeMs;
    return { file, regular: details.isFile() };
  } catch {
    return { file, regular: false };
  }
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve: (zip: yauzl.ZipFile) => void, reject: (reason?: unknown) => void): void => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, decodeStrings: false },
      (error: Error | null, zip: yauzl.ZipFile): void => {
        if (error) {
          reject(error);
          return;
        }
        resolve(zip);
      },
    );
  });
}

function entryName(entry: yauzl.Entry): string {
  return yauzl.getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields, true);
}

function isUnsafeName(name: string): boolean {
  return (
    name.startsWith('/') ||
    name.includes('\\') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').includes('..') ||
    name.includes('\0')
  );
}

function isSymlink(entry: yauzl.Entry): boolean {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}

function listEntries(zip: yauzl.ZipFile): Promise<CentralDirectory> {
  return new Promise((resolve: (directory: CentralDirectory) => void, reject: (reason?: unknown) => void): void => {
    const entries: IndexedEntry[] = [];
    const byName: Map<string, IndexedEntry> = new Map();
    const names: Set<string> = new Set();
    let encrypted: boolean = false;
    let unsafeName: string | null = null;
    let duplicateName: string | null = null;
    let unpackedBytes: number = 0;

    zip.on('entry', (entry: yauzl.Entry): void => {
      const name: string = entryName(entry);
      const indexed: IndexedEntry = { entry, name, symlink: isSymlink(entry) };
      const foldedName: string = name.toLocaleLowerCase('en-US');
      entries.push(indexed);
      byName.set(name, indexed);
      encrypted ||= (entry.generalPurposeBitFlag & 0x1) !== 0;
      unsafeName ??= isUnsafeName(name) ? name : null;
      duplicateName ??= names.has(foldedName) ? name : null;
      names.add(foldedName);
      unpackedBytes += entry.uncompressedSize;
      zip.readEntry();
    });
    zip.once('error', reject);
    zip.once('end', (): void => {
      resolve({ entries, byName, encrypted, unsafeName, duplicateName, unpackedBytes });
    });
    zip.readEntry();
  });
}

function openEntryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve: (stream: Readable) => void, reject: (reason?: unknown) => void): void => {
    zip.openReadStream(entry, (error: Error | null, stream: Readable): void => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stream);
    });
  });
}

async function readEntryBytes(
  zip: yauzl.ZipFile,
  indexed: IndexedEntry,
  limit: PackageLimit,
  max: number,
): Promise<Uint8Array> {
  if (indexed.entry.uncompressedSize > max) {
    throw new EntryTooLargeError(limit, indexed.entry.uncompressedSize, max, indexed.name);
  }
  const stream: Readable = await openEntryStream(zip, indexed.entry);
  return new Promise((resolve: (bytes: Uint8Array) => void, reject: (reason?: unknown) => void): void => {
    const chunks: Buffer[] = [];
    let size: number = 0;
    let settled: boolean = false;
    stream.on('data', (chunk: Buffer): void => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > max) {
        settled = true;
        stream.destroy();
        reject(new EntryTooLargeError(limit, size, max, indexed.name));
        return;
      }
      chunks.push(chunk);
    });
    stream.once('error', (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    stream.once('end', (): void => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks, size));
      }
    });
  });
}

function availableEntry(directory: CentralDirectory, name: string): IndexedEntry | null {
  const indexed: IndexedEntry | undefined = directory.byName.get(name);
  return indexed && !indexed.symlink && !indexed.name.endsWith('/') ? indexed : null;
}

function jsonErrorLine(error: unknown, text: string): number {
  if (!(error instanceof SyntaxError)) {
    return 1;
  }
  const lineMatch: RegExpMatchArray | null = error.message.match(/line (\d+)/i);
  if (lineMatch) {
    return Number(lineMatch[1]);
  }
  const positionMatch: RegExpMatchArray | null = error.message.match(/position (\d+)/i);
  if (!positionMatch) {
    return 1;
  }
  const position: number = Number(positionMatch[1]);
  return text.slice(0, position).split('\n').length;
}

function parseMetadata(text: string): ParsedMetadata {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { value: null, line: 1 };
    }
    return { value: parsed as Record<string, unknown>, line: 1 };
  } catch (error: unknown) {
    return { value: null, line: jsonErrorLine(error, text) };
  }
}

function requiredString(value: Record<string, unknown>, field: string, problems: PackageProblem[]): string {
  const candidate: unknown = value[field];
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    problems.push(problem('fieldMissing', { field }, metadataWhere(field)));
    return '';
  }
  return candidate.trim();
}

function optionalString(value: Record<string, unknown>, field: string, problems: PackageProblem[]): string {
  const candidate: unknown = value[field];
  if (candidate === undefined) {
    return '';
  }
  if (typeof candidate !== 'string') {
    problems.push(problem('fieldInvalid', { field }, metadataWhere(field)));
    return '';
  }
  return candidate.trim();
}

function checkTags(value: unknown, problems: PackageProblem[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((tag: unknown): boolean => typeof tag !== 'string')) {
    problems.push(problem('fieldInvalid', { field: 'tags' }, metadataWhere('tags')));
    return [];
  }
  return normalizeTags(value);
}

function checkPublication(value: unknown, problems: PackageProblem[]): Publication {
  if (value === undefined) {
    return DEFAULT_PUBLICATION;
  }
  if (value !== 'ongoing' && value !== 'completed') {
    problems.push(problem('fieldInvalid', { field: 'publication' }, metadataWhere('publication')));
    return DEFAULT_PUBLICATION;
  }
  return value;
}

function checkCover(value: unknown, problems: PackageProblem[]): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    problems.push(problem('fieldInvalid', { field: 'cover' }, metadataWhere('cover')));
    return null;
  }
  return value;
}

function checkChapters(value: unknown, problems: PackageProblem[]): CheckedChapters {
  if (value === undefined) {
    problems.push(problem('fieldMissing', { field: 'chapters' }, metadataWhere('chapters')));
    return { chapters: [], indexes: [] };
  }
  if (!Array.isArray(value)) {
    problems.push(problem('fieldInvalid', { field: 'chapters' }, metadataWhere('chapters')));
    return { chapters: [], indexes: [] };
  }
  const chapters: PackageChapter[] = [];
  const indexes: number[] = [];
  value.forEach((item: unknown, index: number): void => {
    const field: string = `chapters[${index}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      problems.push(problem('fieldInvalid', { field }, metadataWhere(field)));
      return;
    }
    const chapter: Record<string, unknown> = item as Record<string, unknown>;
    const validTitle: boolean = chapter.title === undefined || typeof chapter.title === 'string';
    if (typeof chapter.file !== 'string' || !chapter.file.startsWith(PACKAGE_CHAPTERS_DIR) || !validTitle) {
      problems.push(problem('fieldInvalid', { field }, metadataWhere(field)));
      return;
    }
    chapters.push({ file: chapter.file, title: typeof chapter.title === 'string' ? chapter.title.trim() : '' });
    indexes.push(index);
  });
  return { chapters, indexes };
}

function checkMetadata(value: Record<string, unknown>): MetadataCheck {
  const problems: PackageProblem[] = [];
  const originalTitle: string = requiredString(value, 'originalTitle', problems);
  const suppliedLanguage: string = requiredString(value, 'language', problems);
  const checkedChapters: CheckedChapters = checkChapters(value.chapters, problems);
  let language: string = suppliedLanguage;
  if (suppliedLanguage) {
    try {
      language = Intl.getCanonicalLocales(suppliedLanguage)[0];
    } catch {
      problems.push(problem('languageInvalid', { value: suppliedLanguage }, metadataWhere('language')));
    }
  }
  const metadata: PackageMetadata = {
    formatVersion: PACKAGE_FORMAT_VERSION,
    type: PACKAGE_TYPE_NOVEL,
    originalTitle,
    title: optionalString(value, 'title', problems),
    author: optionalString(value, 'author', problems),
    description: optionalString(value, 'description', problems),
    tags: checkTags(value.tags, problems),
    language,
    publication: checkPublication(value.publication, problems),
    cover: checkCover(value.cover, problems),
    chapters: checkedChapters.chapters,
  };
  return { metadata, chapterIndexes: checkedChapters.indexes, problems };
}

function checkListedTwice(chapters: PackageChapter[], chapterIndexes: number[]): PackageProblem[] {
  const problems: PackageProblem[] = [];
  const firstByFile: Map<string, number> = new Map();
  chapters.forEach((chapter: PackageChapter, index: number): void => {
    const folded: string = chapter.file.toLocaleLowerCase('en-US');
    const first: number | undefined = firstByFile.get(folded);
    if (first === undefined) {
      firstByFile.set(folded, index);
      return;
    }
    problems.push(
      problem(
        'chapterListedTwice',
        { file: chapter.file },
        `${PACKAGE_METADATA_FILE} · chapters[${chapterIndexes[first]}], chapters[${chapterIndexes[index]}]`,
      ),
    );
  });
  return problems;
}

async function checkChapterFiles(
  zip: yauzl.ZipFile,
  directory: CentralDirectory,
  metadata: PackageMetadata,
  chapterIndexes: number[],
  limit: number,
): Promise<ChapterCheck> {
  const chapters: PreviewChapter[] = [];
  const problems: PackageProblem[] = checkListedTwice(metadata.chapters, chapterIndexes);
  const warnings: PackageWarning[] = [];
  const firstByHash: Map<string, number> = new Map();
  for (let offset: number = 0; offset < metadata.chapters.length; offset += 1) {
    const chapter: PackageChapter = metadata.chapters[offset];
    const sourceIndex: number = chapterIndexes[offset];
    const index: number = sourceIndex + 1;
    const indexed: IndexedEntry | null = availableEntry(directory, chapter.file);
    if (!indexed) {
      problems.push(
        problem(
          'chapterFileMissing',
          { index, file: chapter.file },
          `${PACKAGE_METADATA_FILE} · chapters[${sourceIndex}]`,
        ),
      );
      continue;
    }
    const bytes: Uint8Array = await readEntryBytes(zip, indexed, 'chapter', limit);
    const decoded: string | null = decodeUtf8(bytes);
    if (decoded === null) {
      problems.push(problem('notUtf8', { file: chapter.file }, chapter.file));
      continue;
    }
    const text: string = normalizeChapterText(decoded);
    const stats: { paragraphs: number; chars: number } = chapterStats(text);
    const hash: string = await contentHash(text);
    const chapterWarnings: PackageWarning[] = [];
    if (stats.paragraphs === 0) {
      chapterWarnings.push(warning('chapterEmpty', { index }, chapter.file));
    } else {
      const sameAs: number | undefined = firstByHash.get(hash);
      if (sameAs !== undefined) {
        chapterWarnings.push(warning('sameText', { index, sameAs }, chapter.file));
      } else {
        firstByHash.set(hash, index);
      }
    }
    warnings.push(...chapterWarnings);
    chapters.push({
      index,
      file: chapter.file,
      title: chapter.title,
      bytes: bytes.byteLength,
      chars: stats.chars,
      paragraphs: stats.paragraphs,
      hash,
      warnings: chapterWarnings,
    });
  }
  return { chapters, problems, warnings };
}

export function coverMime(bytes: Uint8Array): PackageCover['mime'] | null {
  const jpeg: boolean = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (jpeg) {
    return 'image/jpeg';
  }
  const pngSignature: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png: boolean = pngSignature.every((byte: number, index: number): boolean => bytes[index] === byte);
  return png ? 'image/png' : null;
}

export interface PackageArchive {
  read(name: string, limit: PackageLimit, max: number): Promise<Uint8Array>;
  close(): void;
}

export async function openPackageArchive(path: string): Promise<PackageArchive> {
  const zip: yauzl.ZipFile = await openZip(path);
  try {
    const directory: CentralDirectory = await listEntries(zip);
    return {
      read: async (name: string, limit: PackageLimit, max: number): Promise<Uint8Array> => {
        const indexed: IndexedEntry | null = availableEntry(directory, name);
        if (indexed === null) {
          throw new Error(`ZIP entry not found: ${name}`);
        }
        return readEntryBytes(zip, indexed, limit, max);
      },
      close: (): void => zip.close(),
    };
  } catch (error: unknown) {
    zip.close();
    throw error;
  }
}

async function checkCoverFile(
  zip: yauzl.ZipFile,
  directory: CentralDirectory,
  file: string | null,
  limit: number,
): Promise<CoverCheck> {
  if (file === null) {
    return { cover: null, problem: null };
  }
  const indexed: IndexedEntry | null = availableEntry(directory, file);
  if (!indexed) {
    return { cover: null, problem: problem('coverInvalid', { file }, file) };
  }
  const bytes: Uint8Array = await readEntryBytes(zip, indexed, 'cover', limit);
  const mime: PackageCover['mime'] | null = coverMime(bytes);
  if (mime === null) {
    return { cover: null, problem: problem('coverInvalid', { file }, file) };
  }
  const url: string = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  return { cover: { file, size: bytes.byteLength, mime, url }, problem: null };
}

function ignoredFiles(directory: CentralDirectory, metadata: PackageMetadata): string[] {
  const used: Set<string> = new Set([
    PACKAGE_METADATA_FILE,
    ...metadata.chapters.map(({ file }: PackageChapter): string => file),
  ]);
  if (metadata.cover !== null) {
    used.add(metadata.cover);
  }
  return directory.entries
    .filter((indexed: IndexedEntry): boolean => !indexed.name.endsWith('/'))
    .filter((indexed: IndexedEntry): boolean => indexed.symlink || !used.has(indexed.name))
    .map((indexed: IndexedEntry): string => indexed.name)
    .sort();
}

function checkDirectory(directory: CentralDirectory, file: PackageFile, limits: PackageLimits): PackageRefused | null {
  if (directory.encrypted) {
    return refused(file, 'notZip');
  }
  if (directory.unsafeName !== null) {
    return refused(file, 'unsafePath', { entry: directory.unsafeName });
  }
  if (directory.duplicateName !== null) {
    return refused(file, 'unsafePath', { entry: directory.duplicateName });
  }
  if (directory.unpackedBytes > limits.unpackedBytes) {
    return refused(file, 'tooLarge', {
      limit: 'unpacked',
      size: directory.unpackedBytes,
      max: limits.unpackedBytes,
    });
  }
  return null;
}

async function readMetadataValue(
  zip: yauzl.ZipFile,
  directory: CentralDirectory,
  file: PackageFile,
  limit: number,
): Promise<MetadataValue | PackageRefused> {
  const metadataEntry: IndexedEntry | null = availableEntry(directory, PACKAGE_METADATA_FILE);
  if (!metadataEntry) {
    const problems: PackageProblem[] = [problem('metadataMissing', {}, PACKAGE_METADATA_FILE)];
    return refusedProblems(file, problems);
  }

  const metadataBytes: Uint8Array = await readEntryBytes(zip, metadataEntry, 'chapter', limit);
  const metadataText: string | null = decodeUtf8(metadataBytes);
  if (metadataText === null) {
    const problems: PackageProblem[] = [problem('notUtf8', { file: PACKAGE_METADATA_FILE }, PACKAGE_METADATA_FILE)];
    return refusedProblems(file, problems);
  }
  const parsed: ParsedMetadata = parseMetadata(metadataText);
  if (parsed.value === null) {
    const problems: PackageProblem[] = [problem('metadataInvalid', { line: parsed.line }, PACKAGE_METADATA_FILE)];
    return refusedProblems(file, problems);
  }

  const versionValue: unknown = parsed.value.formatVersion;
  if (versionValue === undefined) {
    const problems: PackageProblem[] = [
      problem('fieldMissing', { field: 'formatVersion' }, metadataWhere('formatVersion')),
    ];
    return refusedProblems(file, problems);
  }
  if (versionValue !== PACKAGE_FORMAT_VERSION) {
    const version: string | number = typeof versionValue === 'number' ? versionValue : String(versionValue);
    const problems: PackageProblem[] = [problem('versionUnsupported', { version }, metadataWhere('formatVersion'))];
    return refusedProblems(file, problems);
  }
  if (typeof parsed.value.type !== 'string') {
    const problems: PackageProblem[] = [problem('fieldMissing', { field: 'type' }, metadataWhere('type'))];
    return refusedProblems(file, problems);
  }
  if (parsed.value.type !== PACKAGE_TYPE_NOVEL) {
    return refused(file, 'unsupportedType', { type: parsed.value.type });
  }
  return { value: parsed.value };
}

async function readPackageContents(
  zip: yauzl.ZipFile,
  file: PackageFile,
  limits: PackageLimits,
): Promise<PackageReadResult> {
  if (zip.entryCount > limits.entries) {
    return refused(file, 'tooLarge', { limit: 'entries', size: zip.entryCount, max: limits.entries });
  }
  const directory: CentralDirectory = await listEntries(zip);
  const directoryRefusal: PackageRefused | null = checkDirectory(directory, file, limits);
  if (directoryRefusal !== null) {
    return directoryRefusal;
  }
  const metadataValue: MetadataValue | PackageRefused = await readMetadataValue(
    zip,
    directory,
    file,
    limits.chapterBytes,
  );
  if ('status' in metadataValue) {
    return metadataValue;
  }

  const checkedMetadata: MetadataCheck = checkMetadata(metadataValue.value);
  const metadata: PackageMetadata = checkedMetadata.metadata;
  const chapterCheck: ChapterCheck = await checkChapterFiles(
    zip,
    directory,
    metadata,
    checkedMetadata.chapterIndexes,
    limits.chapterBytes,
  );
  const coverCheck: CoverCheck = await checkCoverFile(zip, directory, metadata.cover, limits.coverBytes);
  const problems: PackageProblem[] = [...checkedMetadata.problems, ...chapterCheck.problems];
  if (coverCheck.problem !== null) {
    problems.push(coverCheck.problem);
  }
  if (problems.length > 0) {
    return refusedProblems(file, problems);
  }

  const ignored: string[] = ignoredFiles(directory, metadata);
  const ignoredWarnings: PackageWarning[] = ignored.map((ignoredFile: string): PackageWarning =>
    warning('ignoredFile', { file: ignoredFile }, ignoredFile),
  );
  const preview: ImportPreview = {
    file,
    formatVersion: PACKAGE_FORMAT_VERSION,
    metadata,
    cover: coverCheck.cover,
    chapters: chapterCheck.chapters,
    ignoredFiles: ignored,
    warnings: [...chapterCheck.warnings, ...ignoredWarnings],
  };
  return { status: 'ok', preview };
}

export async function readPackage(path: string, limits: PackageLimits = PACKAGE_LIMITS): Promise<PackageReadResult> {
  const inspected: PackageFileInspection = await packageFile(path);
  const file: PackageFile = inspected.file;
  if (!inspected.regular || extname(path).toLocaleLowerCase('en-US') !== '.zip') {
    return refused(file, 'notZip');
  }
  if (file.size > limits.zipBytes) {
    return refused(file, 'tooLarge', { limit: 'zip', size: file.size, max: limits.zipBytes });
  }

  let zip: yauzl.ZipFile | null = null;
  try {
    zip = await openZip(path);
    return await readPackageContents(zip, file, limits);
  } catch (error: unknown) {
    if (error instanceof EntryTooLargeError) {
      return refused(file, 'tooLarge', {
        limit: error.limit,
        size: error.size,
        max: error.max,
        file: error.file,
      });
    }
    logger.error(`package ${file.name} could not be read`, error);
    return refused(file, 'notZip');
  } finally {
    zip?.close();
  }
}
