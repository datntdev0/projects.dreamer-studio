import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { watchBuild } from '../electron/esbuild.mjs';

const devUrl = 'http://localhost:4200';
const electronDir = new URL('../electron/', import.meta.url);
const electronBinary = createRequire(new URL('package.json', electronDir))('electron');

let electron = null;

function killTree(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}

function shutdown() {
  killTree(electron);
  killTree(angular);
  process.exit(0);
}

function isUp(url) {
  return fetch(url).then(
    (response) => response.ok,
    () => false,
  );
}

async function waitForUrl(url) {
  while (!(await isUp(url))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function startElectron() {
  const child = spawn(electronBinary, ['--inspect=9229', '--remote-debugging-port=9222', fileURLToPath(electronDir)], {
    stdio: 'inherit',
    env: { ...process.env, DREAMER_DEV_URL: devUrl },
  });
  child.on('exit', () => {
    if (child === electron) {
      shutdown();
    }
  });
  electron = child;
}

function restartElectron() {
  killTree(electron);
  startElectron();
}

const angular = spawn('pnpm --filter @dreamer/angular start', { stdio: 'inherit', shell: true });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await waitForUrl(devUrl);
await watchBuild(restartElectron);
