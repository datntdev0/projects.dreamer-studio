import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildOnce } from '../electron/esbuild.mjs';
import config from '../electron/electron-builder.config.mjs';

const electronUrl = new URL('../electron/', import.meta.url);
const electronDir = fileURLToPath(electronUrl);
const { build: electronBuilder } = createRequire(new URL('package.json', electronUrl))('electron-builder');

const pyScript = fileURLToPath(new URL('py.mjs', import.meta.url));

function run(command) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function build() {
  process.env.DREAMER_BUILD_DATE = new Date().toISOString().slice(0, 10);
  run('pnpm --filter @dreamer/angular build');
  await buildOnce();
}

async function pack() {
  await build();
  run(`node "${pyScript}" freeze`);
  await electronBuilder({ config, projectDir: electronDir });
}

const commands = { build, package: pack };

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Usage: node scripts/build.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
try {
  await command();
} catch (error) {
  console.error(error);
  process.exit(1);
}
