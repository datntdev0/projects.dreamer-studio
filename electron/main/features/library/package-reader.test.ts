import { Buffer } from 'node:buffer';
import { createWriteStream, Dirent, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { ImportPreview, PACKAGE_LIMITS, PackageLimits, PackageReadResult } from '@dreamer/shared/models/novel-package';
import { PackageWarning, PreviewChapter } from '@dreamer/shared/models/novel-package';
import { readPackage } from './package-reader';

interface ZipEntry {
  name: string;
  data: Buffer;
  mode?: number;
}

interface SampleOverrides {
  metadata?: string | Buffer;
  add?: ZipEntry[];
  remove?: string[];
  replace?: ZipEntry[];
}

const fixtureFolder: string = join(__dirname, 'fixtures', 'sample-novel');
const utf8: BufferEncoding = 'utf8';
let tempFolder: string;
let zipNumber: number;

function zipEntry(name: string, data: string | Buffer, mode?: number): ZipEntry {
  return { name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, utf8), mode };
}

function metadata(overrides: Record<string, unknown> = {}): Buffer {
  const value: Record<string, unknown> = {
    formatVersion: 1,
    type: 'novel',
    originalTitle: 'Original',
    language: 'en',
    chapters: [],
    ...overrides,
  };
  return Buffer.from(JSON.stringify(value), utf8);
}

function limits(overrides: Partial<PackageLimits>): PackageLimits {
  return { ...PACKAGE_LIMITS, ...overrides };
}

function fixtureZipEntries(folder: string, prefix: string = ''): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const children: Dirent[] = readdirSync(folder, { withFileTypes: true });
  children.forEach((child: Dirent): void => {
    const filePath: string = join(folder, child.name);
    const entryName: string = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.isDirectory()) {
      entries.push(...fixtureZipEntries(filePath, entryName));
    } else {
      entries.push(zipEntry(entryName, readFileSync(filePath)));
    }
  });
  return entries;
}

async function buildZip(entries: ZipEntry[], fileName?: string): Promise<string> {
  const path: string = join(tempFolder, fileName ?? `package-${++zipNumber}.zip`);
  const zip: yazl.ZipFile = new yazl.ZipFile();
  entries.forEach((entry: ZipEntry): void => {
    zip.addBuffer(entry.data, entry.name, entry.mode === undefined ? undefined : { mode: entry.mode });
  });
  const complete: Promise<void> = new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
    const output: ReturnType<typeof createWriteStream> = createWriteStream(path);
    output.on('close', resolve);
    output.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.pipe(output);
  });
  zip.end();
  await complete;
  return path;
}

async function buildPackageZip(
  metadataOverrides: Record<string, unknown> = {},
  entries: ZipEntry[] = [],
  fileName?: string,
): Promise<string> {
  return buildZip([zipEntry('metadata.json', metadata(metadataOverrides)), ...entries], fileName);
}

async function buildSampleZip(overrides: SampleOverrides = {}): Promise<string> {
  const removed: Set<string> = new Set(overrides.remove ?? []);
  const replacements: Map<string, ZipEntry> = new Map(
    (overrides.replace ?? []).map((entry: ZipEntry): [string, ZipEntry] => [entry.name, entry]),
  );
  let entries: ZipEntry[] = fixtureZipEntries(fixtureFolder).filter(
    (entry: ZipEntry): boolean => !removed.has(entry.name),
  );
  entries = entries.map((entry: ZipEntry): ZipEntry => replacements.get(entry.name) ?? entry);
  replacements.forEach((entry: ZipEntry, name: string): void => {
    if (!entries.some((candidate: ZipEntry): boolean => candidate.name === name)) {
      entries.push(entry);
    }
  });
  if (overrides.metadata !== undefined) {
    entries = entries.filter((entry: ZipEntry): boolean => entry.name !== 'metadata.json');
    entries.push(zipEntry('metadata.json', overrides.metadata));
  }
  entries.push(...(overrides.add ?? []));
  return buildZip(entries, `sample-${++zipNumber}.zip`);
}

function patchEntryName(path: string, safeName: string, unsafeName: string): void {
  const safe: Buffer = Buffer.from(safeName, utf8);
  const unsafe: Buffer = Buffer.from(unsafeName, utf8);
  const bytes: Buffer = readFileSync(path);
  let count: number = 0;
  let offset: number = bytes.indexOf(safe);
  expect(unsafe.length).toBe(safe.length);
  while (offset !== -1) {
    unsafe.copy(bytes, offset);
    count += 1;
    offset = bytes.indexOf(safe, offset + unsafe.length);
  }
  expect(count).toBe(2);
  writeFileSync(path, bytes);
}

function markEntryEncrypted(path: string, name: string): void {
  const bytes: Buffer = readFileSync(path);
  const target: Buffer = Buffer.from(name, utf8);
  let matches: number = 0;
  for (let offset: number = 0; offset <= bytes.length - 4; offset += 1) {
    const signature: number = bytes.readUInt32LE(offset);
    const local: boolean = signature === 0x04034b50;
    const central: boolean = signature === 0x02014b50;
    if (!local && !central) {
      continue;
    }
    const nameLengthOffset: number = offset + (local ? 26 : 28);
    const nameOffset: number = offset + (local ? 30 : 46);
    const nameLength: number = bytes.readUInt16LE(nameLengthOffset);
    if (bytes.subarray(nameOffset, nameOffset + nameLength).equals(target)) {
      const flagOffset: number = offset + (local ? 6 : 8);
      bytes.writeUInt16LE(bytes.readUInt16LE(flagOffset) | 0x1, flagOffset);
      matches += 1;
    }
  }
  expect(matches).toBe(2);
  writeFileSync(path, bytes);
}

function folderSnapshot(folder: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const visit: (current: string) => void = (current: string): void => {
    readdirSync(current, { withFileTypes: true }).forEach((child: Dirent): void => {
      const path: string = join(current, child.name);
      if (child.isDirectory()) {
        visit(path);
      } else {
        snapshot[relative(folder, path)] = readFileSync(path).toString('base64');
      }
    });
  };
  visit(folder);
  return snapshot;
}

async function readOk(path: string, customLimits?: PackageLimits): Promise<ImportPreview> {
  const result: PackageReadResult = await readPackage(path, customLimits);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') {
    throw new Error(`Expected ok, received ${result.refusal}`);
  }
  return result.preview;
}

beforeEach(() => {
  tempFolder = mkdtempSync(join(tmpdir(), 'dreamer-package-reader-'));
  zipNumber = 0;
});

afterEach(() => {
  rmSync(tempFolder, { recursive: true, force: true });
});

describe('package reader', () => {
  it('reads the sample package', async () => {
    const path: string = await buildSampleZip();
    const preview: ImportPreview = await readOk(path);

    expect(preview.file).toEqual({
      name: basename(path),
      size: statSync(path).size,
      modifiedMs: statSync(path).mtimeMs,
    });
    expect(preview.metadata.publication).toBe('ongoing');
    expect(preview.cover).toEqual({ file: 'cover.png', size: 101, mime: 'image/png' });
    expect(preview.chapters).toHaveLength(4);
    expect(preview.chapters.map((chapter: PreviewChapter): string => chapter.title)).toEqual([
      '第一章 出山',
      '第二章 夜雨',
      '第三章 空白',
      '第四章 重逢',
    ]);
    expect(preview.chapters[0]).toMatchObject({ index: 1, bytes: 89, paragraphs: 3, chars: 23 });
    expect(preview.chapters[2].warnings).toEqual([
      { code: 'chapterEmpty', params: { index: 3 }, where: 'chapters/0003.txt' },
    ]);
    expect(preview.chapters[3].warnings).toEqual([
      { code: 'sameText', params: { index: 4, sameAs: 2 }, where: 'chapters/0004.txt' },
    ]);
    expect(preview.ignoredFiles).toEqual(['notes.txt']);
    expect(preview.warnings).toEqual([
      { code: 'chapterEmpty', params: { index: 3 }, where: 'chapters/0003.txt' },
      { code: 'sameText', params: { index: 4, sameAs: 2 }, where: 'chapters/0004.txt' },
      { code: 'ignoredFile', params: { file: 'notes.txt' }, where: 'notes.txt' },
    ]);
  });

  it('refuses a non-zip extension', async () => {
    const path: string = await buildPackageZip({}, [], 'package.txt');

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'notZip',
      params: {},
      problems: [],
      file: { name: 'package.txt', size: statSync(path).size },
    });
  });

  it('refuses a corrupt zip', async () => {
    const path: string = join(tempFolder, 'corrupt.zip');
    writeFileSync(path, 'not a zip');

    await expect(readPackage(path)).resolves.toMatchObject({ status: 'refused', refusal: 'notZip', problems: [] });
  });

  it('refuses an encrypted entry', async () => {
    const path: string = await buildPackageZip();
    markEntryEncrypted(path, 'metadata.json');

    await expect(readPackage(path)).resolves.toMatchObject({ status: 'refused', refusal: 'notZip', problems: [] });
  });

  it.each<[string, string]>([
    ['../x.txt', 'xx/x.txt'],
    ['/x.txt', 'a/x.tx'],
    ['C:/x.txt', 'xx/x.txt'],
    ['x\\x.txt', 'x/x.txt'],
  ])('refuses unsafe path %s', async (unsafeName: string, safeName: string) => {
    const path: string = await buildZip([zipEntry(safeName, 'unsafe')]);
    patchEntryName(path, safeName, unsafeName);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'unsafePath',
      params: { entry: unsafeName },
      problems: [],
    });
  });

  it('refuses duplicate names case-insensitively', async () => {
    const path: string = await buildZip([zipEntry('metadata.json', metadata()), zipEntry('Metadata.json', metadata())]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'unsafePath',
      params: { entry: 'Metadata.json' },
      problems: [],
    });
  });

  it('refuses an unsupported package type', async () => {
    const path: string = await buildPackageZip({ type: 'music' });

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'unsupportedType',
      params: { type: 'music' },
      problems: [],
    });
  });

  it('enforces the zip size limit', async () => {
    const path: string = await buildPackageZip();
    const size: number = statSync(path).size;

    await expect(readPackage(path, limits({ zipBytes: size - 1 }))).resolves.toMatchObject({
      status: 'refused',
      refusal: 'tooLarge',
      params: { limit: 'zip', size, max: size - 1 },
    });
  });

  it('enforces the entry count limit', async () => {
    const path: string = await buildPackageZip({}, [zipEntry('extra.txt', 'extra')]);

    await expect(readPackage(path, limits({ entries: 1 }))).resolves.toMatchObject({
      status: 'refused',
      refusal: 'tooLarge',
      params: { limit: 'entries', size: 2, max: 1 },
    });
  });

  it('enforces the unpacked size limit', async () => {
    const metadataBytes: Buffer = metadata();
    const extra: Buffer = Buffer.from('extra', utf8);
    const unpackedSize: number = metadataBytes.length + extra.length;
    const path: string = await buildZip([zipEntry('metadata.json', metadataBytes), zipEntry('extra.txt', extra)]);

    await expect(readPackage(path, limits({ unpackedBytes: unpackedSize - 1 }))).resolves.toMatchObject({
      status: 'refused',
      refusal: 'tooLarge',
      params: { limit: 'unpacked', size: unpackedSize, max: unpackedSize - 1 },
    });
  });

  it('enforces the chapter size limit', async () => {
    const chapter: Buffer = Buffer.from('chapter '.repeat(100), utf8);
    const metadataBytes: Buffer = metadata({ chapters: [{ file: 'chapters/one.txt' }] });
    const path: string = await buildZip([
      zipEntry('metadata.json', metadataBytes),
      zipEntry('chapters/one.txt', chapter),
    ]);

    await expect(readPackage(path, limits({ chapterBytes: metadataBytes.length }))).resolves.toMatchObject({
      status: 'refused',
      refusal: 'tooLarge',
      params: { limit: 'chapter', size: chapter.length, max: metadataBytes.length, file: 'chapters/one.txt' },
    });
  });

  it('enforces the cover size limit', async () => {
    const cover: Buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const path: string = await buildPackageZip({ cover: 'cover.png' }, [zipEntry('cover.png', cover)]);

    await expect(readPackage(path, limits({ coverBytes: cover.length - 1 }))).resolves.toMatchObject({
      status: 'refused',
      refusal: 'tooLarge',
      params: { limit: 'cover', size: cover.length, max: cover.length - 1, file: 'cover.png' },
    });
  });

  it('reports missing metadata', async () => {
    const path: string = await buildZip([zipEntry('notes.txt', 'notes')]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      params: { count: 1 },
      problems: [{ code: 'metadataMissing', params: {}, where: 'metadata.json' }],
    });
  });

  it('reports invalid metadata JSON with its line', async () => {
    const path: string = await buildZip([zipEntry('metadata.json', '{"formatVersion": }')]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'metadataInvalid', params: { line: 1 }, where: 'metadata.json' }],
    });
  });

  it('reports an unsupported format version', async () => {
    const path: string = await buildPackageZip({ formatVersion: 2 });

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'versionUnsupported', params: { version: 2 }, where: 'metadata.json · formatVersion' }],
    });
  });

  it.each<[string]>([['originalTitle'], ['language']])('reports missing required field %s', async (field: string) => {
    const value: Record<string, unknown> = {
      formatVersion: 1,
      type: 'novel',
      originalTitle: 'Original',
      language: 'en',
      chapters: [],
    };
    delete value[field];
    const path: string = await buildZip([zipEntry('metadata.json', JSON.stringify(value))]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'fieldMissing', params: { field }, where: `metadata.json · ${field}` }],
    });
  });

  it('reports an invalid language', async () => {
    const path: string = await buildPackageZip({ language: 'not_a_language' });

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'languageInvalid', params: { value: 'not_a_language' }, where: 'metadata.json · language' }],
    });
  });

  it('reports a chapter listed twice', async () => {
    const chapters: Record<string, string>[] = [{ file: 'chapters/one.txt' }, { file: 'chapters/one.txt' }];
    const path: string = await buildPackageZip({ chapters }, [zipEntry('chapters/one.txt', 'chapter')]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [
        {
          code: 'chapterListedTwice',
          params: { file: 'chapters/one.txt' },
          where: 'metadata.json · chapters[0], chapters[1]',
        },
      ],
    });
  });

  it('reports a listed chapter file missing', async () => {
    const path: string = await buildPackageZip({ chapters: [{ file: 'chapters/missing.txt' }] });

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [
        {
          code: 'chapterFileMissing',
          params: { index: 1, file: 'chapters/missing.txt' },
          where: 'metadata.json · chapters[0]',
        },
      ],
    });
  });

  it('reports a non-UTF-8 chapter by file name', async () => {
    const file: string = 'chapters/bad.txt';
    const path: string = await buildPackageZip({ chapters: [{ file }] }, [zipEntry(file, Buffer.from([0xc3, 0x28]))]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'notUtf8', params: { file }, where: file }],
    });
  });

  it('reports invalid cover bytes', async () => {
    const path: string = await buildPackageZip({ cover: 'cover.png' }, [zipEntry('cover.png', 'not an image')]);

    await expect(readPackage(path)).resolves.toMatchObject({
      status: 'refused',
      refusal: 'problems',
      problems: [{ code: 'coverInvalid', params: { file: 'cover.png' }, where: 'cover.png' }],
    });
  });

  it('reports several safe problems together', async () => {
    const path: string = await buildZip([
      zipEntry(
        'metadata.json',
        metadata({
          originalTitle: ' ',
          language: 'not_a_language',
          cover: 'cover.png',
          chapters: [{ file: 'chapters/missing.txt' }],
        }),
      ),
      zipEntry('cover.png', 'not an image'),
    ]);
    const result: PackageReadResult = await readPackage(path);

    expect(result).toMatchObject({ status: 'refused', refusal: 'problems', params: { count: 4 } });
    if (result.status === 'refused') {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'fieldMissing', params: { field: 'originalTitle' } }),
          expect.objectContaining({ code: 'languageInvalid', params: { value: 'not_a_language' } }),
          expect.objectContaining({ code: 'chapterFileMissing', params: { file: 'chapters/missing.txt', index: 1 } }),
          expect.objectContaining({ code: 'coverInvalid', params: { file: 'cover.png' } }),
        ]),
      );
    }
  });

  it('accepts a package with no chapters', async () => {
    const path: string = await buildPackageZip();
    const preview: ImportPreview = await readOk(path);

    expect(preview.chapters).toEqual([]);
  });

  it('reports empty chapters without treating their normalized text as a duplicate', async () => {
    const files: string[] = ['chapters/empty-one.txt', 'chapters/empty-two.txt', 'chapters/real.txt'];
    const path: string = await buildPackageZip(
      { chapters: files.map((file: string): { file: string } => ({ file })) },
      [zipEntry(files[0], ''), zipEntry(files[1], ' \r\n\t'), zipEntry(files[2], 'Real text')],
    );
    const preview: ImportPreview = await readOk(path);

    expect(preview.chapters.map((chapter: PreviewChapter): PackageWarning[] => chapter.warnings)).toEqual([
      [{ code: 'chapterEmpty', params: { index: 1 }, where: files[0] }],
      [{ code: 'chapterEmpty', params: { index: 2 }, where: files[1] }],
      [],
    ]);
    expect(preview.warnings).toEqual([
      { code: 'chapterEmpty', params: { index: 1 }, where: files[0] },
      { code: 'chapterEmpty', params: { index: 2 }, where: files[1] },
    ]);
  });

  it('trims and deduplicates tags', async () => {
    const path: string = await buildPackageZip({ tags: ['  Fantasy ', '', 'fantasy', ' Sci-Fi ', 'SCI-FI'] });
    const preview: ImportPreview = await readOk(path);

    expect(preview.metadata.tags).toEqual(['Fantasy', 'Sci-Fi']);
  });

  it('keeps completed publication', async () => {
    const path: string = await buildPackageZip({ publication: 'completed' });
    const preview: ImportPreview = await readOk(path);

    expect(preview.metadata.publication).toBe('completed');
  });

  it('does not modify files while reading', async () => {
    const path: string = await buildSampleZip();
    const before: Record<string, string> = folderSnapshot(tempFolder);

    await readPackage(path);

    expect(folderSnapshot(tempFolder)).toEqual(before);
  });
});
