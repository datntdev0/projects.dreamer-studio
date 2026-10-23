export const PACKAGE_FORMAT_VERSION: number = 1;

export const PACKAGE_TYPE_NOVEL: string = 'novel';

export const PACKAGE_METADATA_FILE: string = 'metadata.json';

export const PACKAGE_CHAPTERS_DIR: string = 'chapters/';

export const MB: number = 1024 * 1024;

export interface PackageLimits {
  zipBytes: number;
  unpackedBytes: number;
  entries: number;
  chapterBytes: number;
  coverBytes: number;
}

export const PACKAGE_LIMITS: PackageLimits = {
  zipBytes: 200 * MB,
  unpackedBytes: 500 * MB,
  entries: 20000,
  chapterBytes: 5 * MB,
  coverBytes: 10 * MB,
};

export type Publication = 'ongoing' | 'completed';

export const DEFAULT_PUBLICATION: Publication = 'ongoing';

export interface PackageChapter {
  file: string;
  title: string;
}

export interface PackageMetadata {
  formatVersion: number;
  type: string;
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  language: string;
  publication: Publication;
  cover: string | null;
  chapters: PackageChapter[];
}

export type PackageRefusal = 'notZip' | 'unsafePath' | 'unsupportedType' | 'tooLarge' | 'problems';

export type PackageLimit = 'zip' | 'unpacked' | 'entries' | 'chapter' | 'cover';

export type PackageProblemCode =
  | 'metadataMissing'
  | 'metadataInvalid'
  | 'versionUnsupported'
  | 'fieldMissing'
  | 'fieldInvalid'
  | 'languageInvalid'
  | 'chapterListedTwice'
  | 'chapterFileMissing'
  | 'notUtf8'
  | 'coverInvalid';

export type PackageWarningCode = 'chapterEmpty' | 'sameText' | 'ignoredFile';

export type PackageParams = Record<string, string | number>;

export interface PackageIssue<C extends string> {
  code: C;
  params: PackageParams;
  where: string;
}

export type PackageProblem = PackageIssue<PackageProblemCode>;

export type PackageWarning = PackageIssue<PackageWarningCode>;

export interface PackageFile {
  name: string;
  size: number;
  modifiedMs: number;
}

export type CoverMime = 'image/jpeg' | 'image/png';

export interface PackageCover {
  file: string;
  size: number;
  mime: CoverMime;
  url: string;
}

export interface PreviewChapter {
  index: number;
  file: string;
  title: string;
  bytes: number;
  chars: number;
  paragraphs: number;
  hash: string;
  warnings: PackageWarning[];
}

export interface ImportPreview {
  file: PackageFile;
  formatVersion: number;
  metadata: PackageMetadata;
  cover: PackageCover | null;
  chapters: PreviewChapter[];
  ignoredFiles: string[];
  warnings: PackageWarning[];
}

export interface PackageRefused {
  status: 'refused';
  refusal: PackageRefusal;
  params: PackageParams;
  problems: PackageProblem[];
  file: PackageFile;
}

export interface PackageRead {
  status: 'ok';
  preview: ImportPreview;
}

export type PackageReadResult = PackageRefused | PackageRead;

export interface ImportMetadata {
  originalTitle: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  language: string;
  publication: Publication;
}

export type ImportCoverChoice = { kind: 'package' } | { kind: 'file'; path: string } | { kind: 'none' };

export interface ImportChapterChoice {
  index: number;
  title: string;
  included: boolean;
}

export interface NovelImportRequest {
  path: string;
  size: number;
  modifiedMs: number;
  metadata: ImportMetadata;
  cover: ImportCoverChoice;
  chapters: ImportChapterChoice[];
}

export interface PickedImage {
  path: string;
  name: string;
  size: number;
  previewUrl: string;
}
