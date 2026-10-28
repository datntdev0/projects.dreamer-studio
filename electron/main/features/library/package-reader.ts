import { Buffer } from 'node:buffer';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { chapterStats, contentHash, decodeUtf8, normalizeChapterText } from '@dreamer/shared/core/novel-text';
import { checkFields, checkGates, FieldProblem, FieldsCheck } from '@dreamer/shared/core/package-format';
import { GateCheck, PackageFormat } from '@dreamer/shared/core/package-format';
import { ImportPreview, PackageChapter, PackageCover, PackageFile } from '@dreamer/shared/models/novel-package';
import { PackageLimit, PackageMetadata, PackageParams } from '@dreamer/shared/models/novel-package';
import { PackageProblem, PackageProblemCode, PackageReadResult } from '@dreamer/shared/models/novel-package';
import { PACKAGE_REFUSALS, PackageRefusal, PackageRefused } from '@dreamer/shared/models/novel-package';
import { PackageWarning, PreviewChapter } from '@dreamer/shared/models/novel-package';
import { createLogger, Logger } from '../../logging/logger';
import { packageFormat } from './package-format';

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

function metadataWhere(format: PackageFormat, field: string): string {
  return `${format.metadataFile} · ${field}`;
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

function fieldProblem(format: PackageFormat, item: FieldProblem): PackageProblem {
  const params: PackageParams = item.code === 'languageInvalid' ? item.params : { field: item.field };
  return problem(item.code, params, metadataWhere(format, item.field));
}

function checkMetadata(format: PackageFormat, value: Record<string, unknown>): MetadataCheck {
  const checked: FieldsCheck = checkFields(value, format.metadata);
  return {
    metadata: checked.value as unknown as PackageMetadata,
    chapterIndexes: checked.kept.get('chapters') ?? [],
    problems: checked.problems.map((item: FieldProblem): PackageProblem => fieldProblem(format, item)),
  };
}

function checkListedTwice(
  format: PackageFormat,
  chapters: PackageChapter[],
  chapterIndexes: number[],
): PackageProblem[] {
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
        metadataWhere(format, `chapters[${chapterIndexes[first]}], chapters[${chapterIndexes[index]}]`),
      ),
    );
  });
  return problems;
}

async function checkChapterFiles(
  zip: yauzl.ZipFile,
  directory: CentralDirectory,
  format: PackageFormat,
  metadata: PackageMetadata,
  chapterIndexes: number[],
): Promise<ChapterCheck> {
  const chapters: PreviewChapter[] = [];
  const problems: PackageProblem[] = checkListedTwice(format, metadata.chapters, chapterIndexes);
  const warnings: PackageWarning[] = [];
  const firstByHash: Map<string, number> = new Map();
  for (let offset: number = 0; offset < metadata.chapters.length; offset += 1) {
    const chapter: PackageChapter = metadata.chapters[offset];
    const sourceIndex: number = chapterIndexes[offset];
    const index: number = sourceIndex + 1;
    const indexed: IndexedEntry | null = availableEntry(directory, chapter.file);
    if (!indexed) {
      problems.push(
        problem('chapterFileMissing', { index, file: chapter.file }, metadataWhere(format, `chapters[${sourceIndex}]`)),
      );
      continue;
    }
    const bytes: Uint8Array = await readEntryBytes(zip, indexed, 'chapter', format.chapterMaxBytes);
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

function detectMime(bytes: Uint8Array): PackageCover['mime'] | null {
  const jpeg: boolean = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (jpeg) {
    return 'image/jpeg';
  }
  const pngSignature: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png: boolean = pngSignature.every((byte: number, index: number): boolean => bytes[index] === byte);
  return png ? 'image/png' : null;
}

export function coverMime(bytes: Uint8Array, format: PackageFormat = packageFormat()): PackageCover['mime'] | null {
  const mime: PackageCover['mime'] | null = detectMime(bytes);
  return mime !== null && format.coverMimes.includes(mime) ? mime : null;
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
  format: PackageFormat,
  file: string | null,
): Promise<CoverCheck> {
  if (file === null) {
    return { cover: null, problem: null };
  }
  const indexed: IndexedEntry | null = availableEntry(directory, file);
  if (!indexed) {
    return { cover: null, problem: problem('coverInvalid', { file }, file) };
  }
  const bytes: Uint8Array = await readEntryBytes(zip, indexed, 'cover', format.coverMaxBytes);
  const mime: PackageCover['mime'] | null = coverMime(bytes, format);
  if (mime === null) {
    return { cover: null, problem: problem('coverInvalid', { file }, file) };
  }
  const url: string = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  return { cover: { file, size: bytes.byteLength, mime, url }, problem: null };
}

function ignoredFiles(directory: CentralDirectory, format: PackageFormat, metadata: PackageMetadata): string[] {
  const used: Set<string> = new Set([
    format.metadataFile,
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

function checkDirectory(directory: CentralDirectory, file: PackageFile, format: PackageFormat): PackageRefused | null {
  if (directory.encrypted && !format.encrypted) {
    return refused(file, 'notZip');
  }
  if (directory.unsafeName !== null) {
    return refused(file, 'unsafePath', { entry: directory.unsafeName });
  }
  if (directory.duplicateName !== null) {
    return refused(file, 'unsafePath', { entry: directory.duplicateName });
  }
  if (directory.unpackedBytes > format.maxUnpackedBytes) {
    return refused(file, 'tooLarge', {
      limit: 'unpacked',
      size: directory.unpackedBytes,
      max: format.maxUnpackedBytes,
    });
  }
  return null;
}

function refusedProblem(
  file: PackageFile,
  code: PackageProblemCode,
  params: PackageParams,
  where: string,
): PackageRefused {
  return refusedProblems(file, [problem(code, params, where)]);
}

function gateRefusal(file: PackageFile, format: PackageFormat, gate: GateCheck): PackageRefused | null {
  if (gate.status === 'ok') {
    return null;
  }
  const where: string = metadataWhere(format, gate.field);
  if (gate.status === 'missing') {
    return refusedProblem(file, 'fieldMissing', { field: gate.field }, where);
  }
  const params: PackageParams = { [gate.gate.param]: gate.value };
  if ((PACKAGE_REFUSALS as readonly string[]).includes(gate.gate.code)) {
    return refused(file, gate.gate.code as PackageRefusal, params);
  }
  return refusedProblem(file, gate.gate.code as PackageProblemCode, params, where);
}

async function readMetadataValue(
  zip: yauzl.ZipFile,
  directory: CentralDirectory,
  file: PackageFile,
  format: PackageFormat,
): Promise<MetadataValue | PackageRefused> {
  const metadataFile: string = format.metadataFile;
  const metadataEntry: IndexedEntry | null = availableEntry(directory, metadataFile);
  if (!metadataEntry) {
    return refusedProblem(file, 'metadataMissing', {}, metadataFile);
  }
  const metadataBytes: Uint8Array = await readEntryBytes(zip, metadataEntry, 'metadata', format.metadataMaxBytes);
  const metadataText: string | null = decodeUtf8(metadataBytes);
  if (metadataText === null) {
    return refusedProblem(file, 'notUtf8', { file: metadataFile }, metadataFile);
  }
  const parsed: ParsedMetadata = parseMetadata(metadataText);
  if (parsed.value === null) {
    return refusedProblem(file, 'metadataInvalid', { line: parsed.line }, metadataFile);
  }
  return gateRefusal(file, format, checkGates(parsed.value, format.metadata)) ?? { value: parsed.value };
}

async function readPackageContents(
  zip: yauzl.ZipFile,
  file: PackageFile,
  format: PackageFormat,
): Promise<PackageReadResult> {
  if (zip.entryCount > format.maxEntries) {
    return refused(file, 'tooLarge', { limit: 'entries', size: zip.entryCount, max: format.maxEntries });
  }
  const directory: CentralDirectory = await listEntries(zip);
  const directoryRefusal: PackageRefused | null = checkDirectory(directory, file, format);
  if (directoryRefusal !== null) {
    return directoryRefusal;
  }
  const metadataValue: MetadataValue | PackageRefused = await readMetadataValue(zip, directory, file, format);
  if ('status' in metadataValue) {
    return metadataValue;
  }

  const checkedMetadata: MetadataCheck = checkMetadata(format, metadataValue.value);
  const metadata: PackageMetadata = checkedMetadata.metadata;
  const chapterCheck: ChapterCheck = await checkChapterFiles(
    zip,
    directory,
    format,
    metadata,
    checkedMetadata.chapterIndexes,
  );
  const coverCheck: CoverCheck = await checkCoverFile(zip, directory, format, metadata.cover);
  const problems: PackageProblem[] = [...checkedMetadata.problems, ...chapterCheck.problems];
  if (coverCheck.problem !== null) {
    problems.push(coverCheck.problem);
  }
  if (problems.length > 0) {
    return refusedProblems(file, problems);
  }

  const ignored: string[] = ignoredFiles(directory, format, metadata);
  const ignoredWarnings: PackageWarning[] = ignored.map((ignoredFile: string): PackageWarning =>
    warning('ignoredFile', { file: ignoredFile }, ignoredFile),
  );
  const preview: ImportPreview = {
    file,
    formatVersion: metadata.formatVersion,
    metadata,
    cover: coverCheck.cover,
    chapters: chapterCheck.chapters,
    ignoredFiles: ignored,
    warnings: [...chapterCheck.warnings, ...ignoredWarnings],
  };
  return { status: 'ok', preview };
}

export async function readPackage(path: string, format: PackageFormat = packageFormat()): Promise<PackageReadResult> {
  const inspected: PackageFileInspection = await packageFile(path);
  const file: PackageFile = inspected.file;
  if (!inspected.regular || extname(path).toLocaleLowerCase('en-US') !== format.extension) {
    return refused(file, 'notZip');
  }
  if (file.size > format.maxBytes) {
    return refused(file, 'tooLarge', { limit: 'zip', size: file.size, max: format.maxBytes });
  }

  let zip: yauzl.ZipFile | null = null;
  try {
    zip = await openZip(path);
    return await readPackageContents(zip, file, format);
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
