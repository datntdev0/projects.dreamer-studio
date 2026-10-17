import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('../backend/', import.meta.url));
const venvPython = `${backendDir}.venv/Scripts/python.exe`;
const PYTEST_NO_TESTS = 5;

function run(command, args) {
  return spawnSync(command, args, { cwd: backendDir, stdio: 'inherit' }).status ?? 1;
}

function runVenv(args, okCodes = [0]) {
  if (!existsSync(venvPython)) {
    console.error('Python venv is missing: run "pnpm py:setup"');
    return 1;
  }
  const code = run(venvPython, args);
  return okCodes.includes(code) ? 0 : code;
}

function setup() {
  if (!existsSync(venvPython) && run('python', ['-m', 'venv', '.venv']) !== 0) {
    return 1;
  }
  return runVenv(['-m', 'pip', 'install', '-r', 'requirements-dev.txt']);
}

const commands = {
  setup,
  lint: () => runVenv(['-m', 'ruff', 'check']),
  format: () => runVenv(['-m', 'ruff', 'format']),
  'format:check': () => runVenv(['-m', 'ruff', 'format', '--check']),
  test: () => runVenv(['-m', 'pytest'], [0, PYTEST_NO_TESTS]),
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Usage: node scripts/py.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
process.exit(command());
