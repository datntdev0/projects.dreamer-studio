import { Injectable, computed, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import { ErrorCode, isAppError } from '@dreamer/shared/errors/app-error';
import type { ImportChapterChoice, ImportCoverChoice, ImportMetadata } from '@dreamer/shared/models/novel-package';
import type { ImportPreview, NovelImportRequest, PackageFile } from '@dreamer/shared/models/novel-package';
import type { PackageReadResult, PickedImage, PreviewChapter } from '@dreamer/shared/models/novel-package';
import type { PipelineRun } from '@dreamer/shared/models/pipeline';
import { DesktopApi } from '@core/desktop-api';

export type ImportStage = 'source' | 'reading' | 'refused' | 'preview';

export interface ImportChapter extends PreviewChapter {
  included: boolean;
  title: string;
}

function packageFile(file: File): PackageFile {
  return { name: file.name, size: file.size, modifiedMs: file.lastModified };
}

function refusedNotZip(file: PackageFile): PackageReadResult {
  return { status: 'refused', refusal: 'notZip', params: {}, problems: [], file };
}

@Injectable()
export class ImportStore {
  private readonly desktopApi: DesktopApi = inject(DesktopApi);
  private requestId: number = 0;

  readonly stage: WritableSignal<ImportStage> = signal<ImportStage>('source');
  readonly result: WritableSignal<PackageReadResult | null> = signal<PackageReadResult | null>(null);
  readonly path: WritableSignal<string | null> = signal<string | null>(null);
  readonly metadata: WritableSignal<ImportMetadata | null> = signal<ImportMetadata | null>(null);
  readonly chapters: WritableSignal<ImportChapter[]> = signal<ImportChapter[]>([]);
  readonly cover: WritableSignal<ImportCoverChoice> = signal<ImportCoverChoice>({ kind: 'none' });
  readonly coverFile: WritableSignal<PickedImage | null> = signal<PickedImage | null>(null);
  readonly coverError: WritableSignal<boolean> = signal<boolean>(false);
  readonly dragOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly dropMany: WritableSignal<boolean> = signal<boolean>(false);
  readonly readingFile: WritableSignal<PackageFile | null> = signal<PackageFile | null>(null);
  readonly starting: WritableSignal<boolean> = signal<boolean>(false);

  readonly preview: Signal<ImportPreview | null> = computed(() => {
    const result: PackageReadResult | null = this.result();
    return result?.status === 'ok' ? result.preview : null;
  });
  readonly file: Signal<PackageFile | null> = computed(() => {
    const result: PackageReadResult | null = this.result();
    if (result?.status === 'ok') return result.preview.file;
    if (result?.status === 'refused') return result.file;
    return this.readingFile();
  });
  readonly previewing: Signal<boolean> = computed(() => this.stage() === 'preview');
  readonly warningCount: Signal<number> = computed(() => this.preview()?.warnings.length ?? 0);
  readonly includedCount: Signal<number> = computed(
    () => this.chapters().filter((chapter: ImportChapter): boolean => chapter.included).length,
  );
  readonly canImport: Signal<boolean> = computed(() => {
    const metadata: ImportMetadata | null = this.metadata();
    return (
      metadata !== null &&
      metadata.originalTitle.trim().length > 0 &&
      metadata.title.trim().length > 0 &&
      metadata.language.trim().length > 0
    );
  });

  async pickPackage(): Promise<void> {
    const path: string | null = await this.desktopApi.pickPackage();
    if (path) await this.read(path, null);
  }

  async drop(files: File[]): Promise<void> {
    this.dragOver.set(false);
    if (files.length !== 1) {
      if (files.length > 1) {
        this.reset();
        this.dropMany.set(true);
      }
      return;
    }
    this.dropMany.set(false);
    const file: File = files[0];
    const details: PackageFile = packageFile(file);
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.zip')) {
      this.requestId += 1;
      this.path.set(null);
      this.readingFile.set(null);
      this.result.set(refusedNotZip(details));
      this.stage.set('refused');
      return;
    }
    const path: string | null = this.desktopApi.pathForFile(file);
    if (path) await this.read(path, details);
  }

  setDragOver(over: boolean, many: boolean = false): void {
    if (this.stage() === 'reading') return;
    this.dragOver.set(over);
    this.dropMany.set(over && many);
  }

  updateMetadata(patch: Partial<ImportMetadata>): void {
    const metadata: ImportMetadata | null = this.metadata();
    if (metadata) this.metadata.set({ ...metadata, ...patch });
  }

  updateChapters(match: (chapter: ImportChapter) => boolean, change: Partial<ImportChapter>): void {
    this.chapters.update((chapters: ImportChapter[]): ImportChapter[] =>
      chapters.map((chapter: ImportChapter): ImportChapter => (match(chapter) ? { ...chapter, ...change } : chapter)),
    );
  }

  async chooseCover(): Promise<void> {
    this.coverError.set(false);
    try {
      const image: PickedImage | null = await this.desktopApi.pickImage();
      if (!image) return;
      this.coverFile.set(image);
      this.cover.set({ kind: 'file', path: image.path });
    } catch (error: unknown) {
      if (isAppError(error) && error.code === ErrorCode.CoverInvalid) {
        this.coverError.set(true);
        return;
      }
      throw error;
    }
  }

  removeCover(): void {
    this.coverFile.set(null);
    this.cover.set({ kind: 'none' });
    this.coverError.set(false);
  }

  async startImport(): Promise<string | null> {
    if (this.starting()) return null;
    const request: NovelImportRequest | null = this.importRequest();
    if (!request) return null;
    const title: string = request.metadata.title.trim();
    this.starting.set(true);
    try {
      const run: PipelineRun | null = await this.desktopApi.importNovel(request);
      if (!run) return null;
      this.reset();
      return title;
    } finally {
      this.starting.set(false);
    }
  }

  reset(): void {
    this.requestId += 1;
    this.stage.set('source');
    this.result.set(null);
    this.path.set(null);
    this.metadata.set(null);
    this.chapters.set([]);
    this.cover.set({ kind: 'none' });
    this.coverFile.set(null);
    this.coverError.set(false);
    this.dragOver.set(false);
    this.dropMany.set(false);
    this.readingFile.set(null);
  }

  private async read(path: string, file: PackageFile | null): Promise<void> {
    const request: number = ++this.requestId;
    this.path.set(path);
    this.result.set(null);
    this.readingFile.set(file ?? { name: this.fileName(path), size: 0, modifiedMs: 0 });
    this.stage.set('reading');
    try {
      const result: PackageReadResult | null = await this.desktopApi.readPackage(path);
      if (request !== this.requestId) return;
      if (!result) {
        this.reset();
        return;
      }
      this.accept(result);
    } catch (error: unknown) {
      if (request === this.requestId) this.reset();
      throw error;
    }
  }

  private accept(result: PackageReadResult): void {
    this.result.set(result);
    this.readingFile.set(null);
    if (result.status === 'refused') {
      this.stage.set('refused');
      return;
    }
    const preview: ImportPreview = result.preview;
    this.metadata.set({
      originalTitle: preview.metadata.originalTitle,
      title: preview.metadata.title,
      author: preview.metadata.author,
      description: preview.metadata.description,
      tags: [...preview.metadata.tags],
      language: preview.metadata.language,
      publication: preview.metadata.publication,
    });
    this.chapters.set(
      preview.chapters.map((chapter: PreviewChapter): ImportChapter => ({
        ...chapter,
        warnings: [...chapter.warnings],
        included: true,
      })),
    );
    this.cover.set(preview.cover ? { kind: 'package' } : { kind: 'none' });
    this.coverFile.set(null);
    this.coverError.set(false);
    this.stage.set('preview');
  }

  private importRequest(): NovelImportRequest | null {
    const path: string | null = this.path();
    const preview: ImportPreview | null = this.preview();
    const metadata: ImportMetadata | null = this.metadata();
    if (!path || !preview || !metadata || !this.canImport()) return null;
    const chapters: ImportChapterChoice[] = this.chapters().map((chapter: ImportChapter): ImportChapterChoice => ({
      index: chapter.index,
      title: chapter.title,
      included: chapter.included,
    }));
    return {
      path,
      size: preview.file.size,
      modifiedMs: preview.file.modifiedMs,
      metadata: { ...metadata, tags: [...metadata.tags] },
      cover: this.cover(),
      chapters,
    };
  }

  private fileName(path: string): string {
    return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  }
}
