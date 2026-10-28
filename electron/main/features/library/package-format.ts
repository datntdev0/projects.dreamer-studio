import { readFileSync } from 'node:fs';
import { PackageFormat, parsePackageFormat } from '@dreamer/shared/core/package-format';
import { packageFormatFile } from '@storage/paths';

let cached: PackageFormat | null = null;

export function packageFormat(): PackageFormat {
  cached ??= parsePackageFormat(readFileSync(packageFormatFile(), 'utf8'));
  return cached;
}
