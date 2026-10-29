import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const electronDir = fileURLToPath(new URL('.', import.meta.url));

function readRootPackage() {
  return JSON.parse(readFileSync(`${rootDir}package.json`, 'utf8'));
}

export function readAppVersion() {
  return readRootPackage().version;
}

export function createBuildOptions() {
  const { version, author } = readRootPackage();
  return {
    entryPoints: { 'main/index': `${electronDir}main/index.ts`, 'preload/index': `${electronDir}preload/index.ts` },
    outdir: `${electronDir}dist`,
    outExtension: { '.js': '.cjs' },
    platform: 'node',
    format: 'cjs',
    bundle: true,
    minify: true,
    metafile: true,
    sourcemap: false,
    external: ['electron'],
    define: {
      APP_VERSION: JSON.stringify(version),
      APP_AUTHOR: JSON.stringify(author),
      BUILD_DATE: JSON.stringify(process.env.DREAMER_BUILD_DATE || null),
    },
    logLevel: 'info',
    plugins: [],
  };
}

export async function buildOnce() {
  await build(createBuildOptions());
}

export async function watchBuild() {
  const ctx = await context(createBuildOptions());
  await ctx.watch();
  return ctx;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildOnce();
}
