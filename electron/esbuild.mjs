import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const electronDir = fileURLToPath(new URL('.', import.meta.url));

export function readAppVersion() {
  return JSON.parse(readFileSync(`${rootDir}package.json`, 'utf8')).version;
}

export function createBuildOptions(onRebuild) {
  return {
    entryPoints: { 'main/index': `${electronDir}main/index.ts`, 'preload/index': `${electronDir}preload/index.ts` },
    outdir: `${electronDir}dist`,
    outExtension: { '.js': '.cjs' },
    platform: 'node',
    format: 'cjs',
    bundle: true,
    sourcemap: true,
    external: ['electron'],
    define: { APP_VERSION: JSON.stringify(readAppVersion()) },
    logLevel: 'info',
    plugins: onRebuild
      ? [{ name: 'rebuild', setup: (b) => b.onEnd((result) => result.errors.length || onRebuild()) }]
      : [],
  };
}

export async function buildOnce() {
  await build(createBuildOptions());
}

export async function watchBuild(onRebuild) {
  const ctx = await context(createBuildOptions(onRebuild));
  await ctx.watch();
  return ctx;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildOnce();
}
