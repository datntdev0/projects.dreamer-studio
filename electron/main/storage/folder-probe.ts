import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const probeFileName: string = '.dreamer-write-test';

export function probeWritable(dir: string): boolean {
  const file: string = join(dir, probeFileName);
  try {
    writeFileSync(file, '');
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
