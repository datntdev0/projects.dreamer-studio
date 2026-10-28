import { readFile, stat } from 'node:fs/promises';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { CoverMime } from '@dreamer/shared/models/novel-package';
import { packageFormat } from './package-format';
import { coverMime } from './package-reader';

export interface CoverImage {
  bytes: Uint8Array;
  mime: CoverMime;
}

export async function readCoverImage(path: string): Promise<CoverImage> {
  const maxBytes: number = packageFormat().coverMaxBytes;
  const details: Awaited<ReturnType<typeof stat>> = await stat(path);
  if (details.size > maxBytes) {
    throw new CodedError(ErrorCode.CoverInvalid, `Cover image is too large: ${path}`);
  }
  const bytes: Uint8Array = await readFile(path);
  if (bytes.byteLength > maxBytes) {
    throw new CodedError(ErrorCode.CoverInvalid, `Cover image is too large: ${path}`);
  }
  const mime: CoverMime | null = coverMime(bytes);
  if (mime === null) {
    throw new CodedError(ErrorCode.CoverInvalid, `Cover image type is invalid: ${path}`);
  }
  return { bytes, mime };
}
