import { DestroyRef, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import type { NovelDetail, NovelPatch } from '@dreamer/shared/models/novel';
import type { NovelImportRequest, PackageReadResult } from '@dreamer/shared/models/novel-package';
import type { PackageWarning, PreviewChapter } from '@dreamer/shared/models/novel-package';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '@core/desktop-api';
import { FakePipelinesApi } from './pipelines-api';

export type LibrarySampleId =
  'ok' | 'minimal' | 'noChapters' | 'notZip' | 'unsafePath' | 'unsupportedType' | 'tooLarge' | 'problems';

const MB: number = 1024 * 1024;

function chapterFile(index: number): string {
  return `chapters/${String(index).padStart(4, '0')}.txt`;
}

function buildChapters(count: number): PreviewChapter[] {
  return Array.from({ length: count }, (_, offset: number): PreviewChapter => {
    const index: number = offset + 1;
    const warnings: PackageWarning[] =
      index === 12
        ? [{ code: 'chapterEmpty' as const, params: { index }, where: chapterFile(index) }]
        : index === 8
          ? [{ code: 'sameText' as const, params: { index, sameAs: 7 }, where: chapterFile(index) }]
          : [];
    return {
      index,
      file: chapterFile(index),
      title: `第${index}章`,
      bytes: index === 12 ? 0 : 5800 + ((index * 137) % 1400),
      chars: index === 12 ? 0 : index === 8 || index === 7 ? 3118 : 2900 + ((index * 137) % 700),
      paragraphs: index === 12 ? 0 : 20 + (index % 12),
      hash: `chapter-${index === 8 ? 7 : index}`,
      warnings,
    };
  });
}

const OK_CHAPTERS: PreviewChapter[] = buildChapters(748);
const OK: PackageReadResult = {
  status: 'ok',
  preview: {
    file: { name: '庆余年.zip', size: 5.4 * MB, modifiedMs: 1_796_000_000_000 },
    formatVersion: 1,
    metadata: {
      formatVersion: 1,
      type: 'novel',
      originalTitle: '庆余年',
      title: 'Khánh Dư Niên',
      author: '猫腻',
      description: '范闲身世成谜，自澹州入京都，卷入庆国朝堂与江湖的风云。',
      tags: ['历史', '权谋'],
      language: 'zh',
      publication: 'completed',
      cover: 'cover.png',
      chapters: OK_CHAPTERS.map((chapter: PreviewChapter) => ({ file: chapter.file, title: chapter.title })),
    },
    cover: {
      file: 'cover.png',
      size: 1.2 * MB,
      mime: 'image/png',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    },
    chapters: OK_CHAPTERS,
    ignoredFiles: ['notes/readme.md'],
    warnings: [
      ...OK_CHAPTERS.flatMap((chapter: PreviewChapter) => chapter.warnings),
      { code: 'ignoredFile', params: { file: 'notes/readme.md' }, where: 'notes/readme.md' },
    ],
  },
};

const MINIMAL_CHAPTERS: PreviewChapter[] = buildChapters(2446).map((chapter: PreviewChapter): PreviewChapter => ({
  ...chapter,
  warnings: [],
}));
const MINIMAL: PackageReadResult = {
  status: 'ok',
  preview: {
    file: { name: '凡人修仙传.zip', size: 18.2 * MB, modifiedMs: 1_796_000_001_000 },
    formatVersion: 1,
    metadata: {
      formatVersion: 1,
      type: 'novel',
      originalTitle: '凡人修仙传',
      title: '',
      author: '忘语',
      description: '',
      tags: [],
      language: 'zh',
      publication: 'ongoing',
      cover: null,
      chapters: MINIMAL_CHAPTERS.map((chapter: PreviewChapter) => ({ file: chapter.file, title: chapter.title })),
    },
    cover: null,
    chapters: MINIMAL_CHAPTERS,
    ignoredFiles: [],
    warnings: [],
  },
};

const NO_CHAPTERS: PackageReadResult = {
  status: 'ok',
  preview: {
    file: { name: '空白之书.zip', size: 0.01 * MB, modifiedMs: 1_796_000_002_000 },
    formatVersion: 1,
    metadata: {
      formatVersion: 1,
      type: 'novel',
      originalTitle: '空白之书',
      title: 'Sách trống',
      author: '',
      description: '',
      tags: [],
      language: 'zh',
      publication: 'ongoing',
      cover: null,
      chapters: [],
    },
    cover: null,
    chapters: [],
    ignoredFiles: [],
    warnings: [],
  },
};

export const LIBRARY_READ_RESULTS: Record<LibrarySampleId, PackageReadResult> = {
  ok: OK,
  minimal: MINIMAL,
  noChapters: NO_CHAPTERS,
  notZip: {
    status: 'refused',
    refusal: 'notZip',
    params: {},
    problems: [],
    file: { name: '庆余年.txt', size: 5.3 * MB, modifiedMs: 1_796_000_003_000 },
  },
  unsafePath: {
    status: 'refused',
    refusal: 'unsafePath',
    params: { entry: '../evil.txt' },
    problems: [],
    file: { name: 'evil-pack.zip', size: 3.2 * MB, modifiedMs: 1_796_000_004_000 },
  },
  unsupportedType: {
    status: 'refused',
    refusal: 'unsupportedType',
    params: { type: 'music' },
    problems: [],
    file: { name: 'qingshi-xiang.zip', size: 9.1 * MB, modifiedMs: 1_796_000_005_000 },
  },
  tooLarge: {
    status: 'refused',
    refusal: 'tooLarge',
    params: { limit: 'zip', size: 260 * MB, max: 200 * MB },
    problems: [],
    file: { name: 'huge-novel.zip', size: 260 * MB, modifiedMs: 1_796_000_006_000 },
  },
  problems: {
    status: 'refused',
    refusal: 'problems',
    params: { count: 5 },
    problems: [
      {
        code: 'chapterFileMissing',
        params: { index: 12, file: chapterFile(12) },
        where: 'metadata.json · chapters[11]',
      },
      {
        code: 'chapterListedTwice',
        params: { file: chapterFile(5) },
        where: 'metadata.json · chapters[4], chapters[5]',
      },
      { code: 'notUtf8', params: { file: chapterFile(10) }, where: chapterFile(10) },
      { code: 'fieldMissing', params: { field: 'title' }, where: 'metadata.json · title' },
      { code: 'languageInvalid', params: { value: 'chinese' }, where: 'metadata.json · language' },
    ],
    file: { name: '庆余年-broken.zip', size: 5.4 * MB, modifiedMs: 1_796_000_007_000 },
  },
};

const SAMPLE_PATHS: Record<LibrarySampleId, string> = {
  ok: 'C:\\Samples\\庆余年.zip',
  minimal: 'C:\\Samples\\凡人修仙传.zip',
  noChapters: 'C:\\Samples\\空白之书.zip',
  notZip: 'C:\\Samples\\庆余年.txt',
  unsafePath: 'C:\\Samples\\evil-pack.zip',
  unsupportedType: 'C:\\Samples\\qingshi-xiang.zip',
  tooLarge: 'C:\\Samples\\huge-novel.zip',
  problems: 'C:\\Samples\\庆余年-broken.zip',
};

class FakeLibraryApi extends FakePipelinesApi {
  constructor(
    private readonly sample: LibrarySampleId,
    destroyRef: DestroyRef,
  ) {
    super({ runs: [] }, destroyRef);
  }

  override pickPackage(): Promise<string | null> {
    return Promise.resolve(SAMPLE_PATHS[this.sample]);
  }

  override readPackage(path: string): Promise<PackageReadResult | null> {
    const sample: LibrarySampleId | undefined = (Object.keys(SAMPLE_PATHS) as LibrarySampleId[]).find(
      (id: LibrarySampleId): boolean => SAMPLE_PATHS[id] === path,
    );
    return Promise.resolve(LIBRARY_READ_RESULTS[sample ?? this.sample]);
  }

  override pickImage(): Promise<{ path: string; name: string; size: number; previewUrl: string } | null> {
    return Promise.resolve({
      path: 'C:\\Samples\\new-cover.png',
      name: 'new-cover.png',
      size: 640 * 1024,
      previewUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
  }

  override importNovel(request: NovelImportRequest): Promise<PipelineRun | null> {
    return Promise.resolve({
      id: '71d7d5f1-ce13-46f4-a118-10ef9abbfc87',
      type: 'novel-import',
      status: 'queued',
      cancelReason: null,
      progress: 0,
      stepIndex: 0,
      stepCount: 3,
      stepName: null,
      errorCode: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      label: request.metadata.title,
      novelId: null,
    });
  }

  override exportNovel(): Promise<PipelineRun | null> {
    return Promise.resolve(null);
  }

  override showExport(): Promise<void> {
    return Promise.resolve();
  }

  override pathForFile(file: File): string | null {
    const sample: LibrarySampleId | undefined = (Object.keys(LIBRARY_READ_RESULTS) as LibrarySampleId[]).find(
      (id: LibrarySampleId): boolean => {
        const result: PackageReadResult = LIBRARY_READ_RESULTS[id];
        const name: string = result.status === 'ok' ? result.preview.file.name : result.file.name;
        return name === file.name;
      },
    );
    return SAMPLE_PATHS[sample ?? this.sample];
  }

  override updateNovel(id: string, patch: NovelPatch): Promise<NovelDetail | null> {
    void id;
    void patch;
    return Promise.resolve(null);
  }
}

export function provideFakeLibraryApi(sample: LibrarySampleId = 'ok'): Provider {
  return { provide: DesktopApi, useFactory: () => new FakeLibraryApi(sample, inject(DestroyRef)) };
}
