export const PACKAGE_METADATA_FIELDS: string[] = [
  'formatVersion',
  'type',
  'originalTitle',
  'title',
  'author',
  'description',
  'tags',
  'language',
  'publication',
  'cover',
  'chapters',
];

export type Publication = 'ongoing' | 'completed';

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

export const PACKAGE_REFUSALS = ['notZip', 'unsafePath', 'unsupportedType', 'tooLarge', 'problems'] as const;

export type PackageRefusal = (typeof PACKAGE_REFUSALS)[number];

export type PackageLimit = 'zip' | 'unpacked' | 'entries' | 'metadata' | 'chapter' | 'cover';

export const PACKAGE_PROBLEM_CODES = [
  'metadataMissing',
  'metadataInvalid',
  'versionUnsupported',
  'fieldMissing',
  'fieldInvalid',
  'languageInvalid',
  'chapterListedTwice',
  'chapterFileMissing',
  'notUtf8',
  'coverInvalid',
] as const;

export type PackageProblemCode = (typeof PACKAGE_PROBLEM_CODES)[number];

export const PACKAGE_WARNING_CODES = ['chapterEmpty', 'sameText', 'ignoredFile'] as const;

export type PackageWarningCode = (typeof PACKAGE_WARNING_CODES)[number];

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
