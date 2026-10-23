import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { appendFileSync, createWriteStream, Dirent, existsSync, mkdtempSync, promises as fs } from 'node:fs';
import { readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import yazl from 'yazl';
import { contentHash } from '@dreamer/shared/core/novel-text';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { ImportCoverChoice, ImportPreview } from '@dreamer/shared/models/novel-package';
import { NovelImportRequest, PACKAGE_LIMITS } from '@dreamer/shared/models/novel-package';
import { NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths, resolveAppPaths } from '@storage/paths';
import { abortError, PipelineStep, StepContext } from '../../pipelines/pipeline-definition';
import { importStagingDir, novelFolder } from '../library-files';
import { readMetadata } from './novel-files';
import { importParams, novelImportPipeline } from './novel-import-pipeline';
import { readPackage } from '../package-reader';

vi.mock('electron', () => ({ app: { getPath: (): string => 'appData', isPackaged: false } }));
vi.mock('../../../logging/logger', () => ({
  createLogger: (): object => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../app/app-i18n', () => ({
  t: (_key: string, params?: { index?: number }): string => `Chapter ${params?.index ?? ''}`,
}));

interface TestRun {
  ctx: StepContext;
  setNovelId: Mock<(id: string) => void>;
}

const fixtureFolder: string = join(__dirname, '../../../../fixtures/sample-novel');
let tempDir: string;
let paths: AppPaths;
let packagePath: string;
let preview: ImportPreview;

function fixtureFiles(folder: string, prefix: string = ''): Array<{ path: string; name: string }> {
  const files: Array<{ path: string; name: string }> = [];
  readdirSync(folder, { withFileTypes: true }).forEach((entry: Dirent): void => {
    const path: string = join(folder, entry.name);
    const name: string = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...fixtureFiles(path, name));
    } else {
      files.push({ path, name });
    }
  });
  return files;
}

async function buildSamplePackage(name: string = 'sample.zip'): Promise<string> {
  const path: string = join(tempDir, name);
  const zip: yazl.ZipFile = new yazl.ZipFile();
  fixtureFiles(fixtureFolder).forEach((file: { path: string; name: string }): void =>
    zip.addFile(file.path, file.name),
  );
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

async function readPreview(path: string): Promise<ImportPreview> {
  const result: Awaited<ReturnType<typeof readPackage>> = await readPackage(path);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') {
    throw new Error('Expected a valid sample package');
  }
  return result.preview;
}

function requestFor(cover: ImportCoverChoice = { kind: 'package' }): NovelImportRequest {
  return {
    path: packagePath,
    size: statSync(packagePath).size,
    modifiedMs: statSync(packagePath).mtimeMs,
    metadata: {
      originalTitle: ` ${preview.metadata.originalTitle} `,
      title: ' Edited title ',
      author: ' Edited author ',
      description: ' Edited description ',
      tags: [' Fantasy ', 'fantasy', '', ' Adventure '],
      language: 'EN-us',
      publication: 'completed',
    },
    cover,
    chapters: preview.chapters.map((chapter, position) => ({
      index: chapter.index,
      title: position === 2 ? ' ' : `Edited ${position + 1}`,
      included: position !== 1,
    })),
  };
}

function makeRun(request: NovelImportRequest, checkpoint?: () => void, suppliedController?: AbortController): TestRun {
  const controller: AbortController = suppliedController ?? new AbortController();
  const setNovelId: Mock<(id: string) => void> = vi.fn<(id: string) => void>();
  const ctx: StepContext = {
    runId: randomUUID(),
    paths,
    params: importParams(request),
    signal: controller.signal,
    progress: vi.fn(),
    checkpoint:
      checkpoint ??
      ((): void => {
        if (controller.signal.aborted) {
          throw abortError();
        }
      }),
    setNovelId: (id: string): void => setNovelId(id),
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { ctx, setNovelId };
}

function pipelineSteps(): [PipelineStep, PipelineStep, PipelineStep] {
  expect(novelImportPipeline.steps.map((step: PipelineStep): string => step.key)).toEqual([
    'library.import.step.check',
    'library.import.step.extract',
    'library.import.step.save',
  ]);
  return novelImportPipeline.steps as [PipelineStep, PipelineStep, PipelineStep];
}

async function execute(request: NovelImportRequest): Promise<TestRun> {
  const run: TestRun = makeRun(request);
  for (const step of pipelineSteps()) {
    await step.run(run.ctx);
  }
  return run;
}

function libraryFolders(): string[] {
  if (!existsSync(paths.library) || !statSync(paths.library).isDirectory()) {
    return [];
  }
  return readdirSync(paths.library, { withFileTypes: true })
    .filter((entry: Dirent): boolean => entry.isDirectory())
    .map((entry: Dirent): string => entry.name);
}

async function cleanup(run: TestRun): Promise<void> {
  await novelImportPipeline.cleanup?.(run.ctx);
}

function expectCode(error: unknown, code: ErrorCode): void {
  expect(error).toBeInstanceOf(CodedError);
  expect((error as CodedError).code).toBe(code);
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'dreamer-novel-import-'));
  paths = resolveAppPaths(join(tempDir, 'app-data'));
  packagePath = await buildSamplePackage();
  preview = await readPreview(packagePath);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('novel import pipeline', () => {
  it('AC-5, AC-6: imports edited metadata, selected chapters and the package cover atomically', async () => {
    const run: TestRun = await execute(requestFor());
    const ids: string[] = libraryFolders();

    expect(ids).toHaveLength(1);
    expect(run.setNovelId).toHaveBeenCalledOnce();
    expect(run.setNovelId).toHaveBeenCalledWith(ids[0]);
    expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(false);

    const metadata: NovelMetadata | null = readMetadata(novelFolder(paths, ids[0]));
    expect(metadata).not.toBeNull();
    expect(metadata).toMatchObject({
      id: ids[0],
      originalTitle: preview.metadata.originalTitle,
      title: 'Edited title',
      author: 'Edited author',
      description: 'Edited description',
      tags: ['Fantasy', 'Adventure'],
      language: 'en-US',
      publication: 'completed',
      cover: 'cover.png',
    });
    expect(metadata?.chapters.map((chapter): string => chapter.title)).toEqual(['Edited 1', 'Chapter 2', 'Edited 4']);
    expect(metadata?.chapters).toHaveLength(3);
    for (const chapter of metadata?.chapters ?? []) {
      const path: string = join(paths.library, ids[0], 'chapters', `${chapter.file}.txt`);
      expect(chapter.file).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(path)).toBe(true);
      await expect(contentHash(readFileSync(path, 'utf8'))).resolves.toBe(chapter.file);
    }
    expect(readFileSync(join(paths.library, ids[0], 'cover.png'))).toEqual(
      readFileSync(join(fixtureFolder, 'cover.png')),
    );
  });

  it('AC-10: importing the same package twice creates different novel ids', async () => {
    const first: TestRun = await execute(requestFor({ kind: 'none' }));
    const second: TestRun = await execute(requestFor({ kind: 'none' }));

    expect(libraryFolders()).toHaveLength(2);
    expect(first.setNovelId.mock.calls[0][0]).not.toBe(second.setNovelId.mock.calls[0][0]);
  });

  it.each<[string, (path: string) => void]>([
    ['size', (path: string): void => appendFileSync(path, 'changed')],
    [
      'mtime',
      (path: string): void => {
        const details: ReturnType<typeof statSync> = statSync(path);
        utimesSync(path, details.atime, new Date(details.mtimeMs + 2000));
      },
    ],
  ])(
    'AC-7: rejects a package whose %s changed after preview without writing a novel',
    async (_case: string, change: (path: string) => void) => {
      const request: NovelImportRequest = requestFor();
      change(packagePath);
      const run: TestRun = makeRun(request);

      await expect(pipelineSteps()[0].run(run.ctx)).rejects.toSatisfy((error: unknown): boolean => {
        expectCode(error, ErrorCode.PackageChanged);
        return true;
      });
      expect(libraryFolders()).toEqual([]);
      expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(false);
    },
  );

  it('AC-7: cancellation after the first extracted chapter cleans staging and writes no novel', async () => {
    const controller: AbortController = new AbortController();
    let checkpoints: number = 0;
    const run: TestRun = makeRun(
      requestFor(),
      (): void => {
        checkpoints += 1;
        controller.abort();
        throw abortError();
      },
      controller,
    );
    const [check, extract] = pipelineSteps();

    await check.run(run.ctx);
    await expect(extract.run(run.ctx)).rejects.toMatchObject({ name: 'AbortError' });
    expect(checkpoints).toBe(1);
    expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(true);
    expect(readdirSync(join(importStagingDir(paths, run.ctx.runId), 'chapters'))).toHaveLength(1);
    await cleanup(run);
    expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(false);
    expect(libraryFolders()).toEqual([]);
  });

  it('AC-7: reports a library write failure and cleanup removes staging', async () => {
    const run: TestRun = makeRun(requestFor());
    const [check, extract, save] = pipelineSteps();
    await check.run(run.ctx);
    await extract.run(run.ctx);
    await fs.mkdir(join(paths.library, '..'), { recursive: true });
    writeFileSync(paths.library, 'blocks the library directory');

    try {
      await save.run(run.ctx);
      throw new Error('Expected the save step to fail');
    } catch (error) {
      expectCode(error, ErrorCode.LibraryWriteFailed);
    }
    expect(statSync(paths.library).isFile()).toBe(true);
    expect(run.setNovelId).not.toHaveBeenCalled();
    await cleanup(run);
    expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(false);
    expect(libraryFolders()).toEqual([]);
  });

  it('stores a valid replacement cover file', async () => {
    const coverPath: string = join(tempDir, 'replacement.png');
    writeFileSync(coverPath, readFileSync(join(fixtureFolder, 'cover.png')));
    const run: TestRun = await execute(requestFor({ kind: 'file', path: coverPath }));
    const id: string = run.setNovelId.mock.calls[0][0] as string;
    const metadata: NovelMetadata | null = readMetadata(novelFolder(paths, id));

    expect(metadata?.cover).toBe('cover.png');
    expect(readFileSync(join(paths.library, id, 'cover.png'))).toEqual(readFileSync(coverPath));
  });

  it('stores no cover when the user chooses none', async () => {
    const run: TestRun = await execute(requestFor({ kind: 'none' }));
    const id: string = run.setNovelId.mock.calls[0][0] as string;
    const metadata: NovelMetadata | null = readMetadata(novelFolder(paths, id));

    expect(metadata?.cover).toBeNull();
    expect(existsSync(join(paths.library, id, 'cover.png'))).toBe(false);
    expect(existsSync(join(paths.library, id, 'cover.jpg'))).toBe(false);
  });

  it.each<[string, Buffer]>([
    ['too large', Buffer.alloc(PACKAGE_LIMITS.coverBytes + 1, 1)],
    ['not an image', Buffer.from('not an image')],
  ])('rejects a replacement cover that is %s', async (_case: string, bytes: Buffer) => {
    const coverPath: string = join(tempDir, 'bad-cover.bin');
    writeFileSync(coverPath, bytes);
    const run: TestRun = makeRun(requestFor({ kind: 'file', path: coverPath }));
    const [check, extract] = pipelineSteps();
    await check.run(run.ctx);

    try {
      await extract.run(run.ctx);
      throw new Error('Expected cover extraction to fail');
    } catch (error) {
      expectCode(error, ErrorCode.CoverInvalid);
    }
    await cleanup(run);
    expect(existsSync(importStagingDir(paths, run.ctx.runId))).toBe(false);
    expect(libraryFolders()).toEqual([]);
  });
});
