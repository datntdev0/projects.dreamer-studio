import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAppVersion } from './esbuild.mjs';

describe('readAppVersion', () => {
  it('returns the root package.json version', () => {
    const rootVersion: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    expect(readAppVersion()).toBe(rootVersion);
  });
});
