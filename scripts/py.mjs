import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeCoverageReport } from './py-coverage.mjs';

const backendDir = fileURLToPath(new URL('../backend/', import.meta.url));
const coverageDir = fileURLToPath(new URL('../coverage/python/', import.meta.url));
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

function freeze() {
  for (const dir of ['build', 'dist']) {
    rmSync(`${backendDir}${dir}`, { recursive: true, force: true });
  }
  return runVenv(['-m', 'PyInstaller', 'backend.spec', '--noconfirm', '--distpath', 'dist', '--workpath', 'build']);
}

function testCoverage() {
  rmSync(coverageDir, { recursive: true, force: true });
  const jsonPath = `${coverageDir}coverage.json`;
  const code = runVenv(
    ['-m', 'pytest', '--cov=app', '--cov-branch', `--cov-report=json:${jsonPath}`],
    [0, PYTEST_NO_TESTS],
  );
  if (code !== 0 || !existsSync(jsonPath)) {
    return code;
  }
  writeCoverageReport(jsonPath, backendDir, coverageDir);
  return 0;
}

const commands = {
  setup,
  freeze,
  lint: () => runVenv(['-m', 'ruff', 'check']),
  format: () => runVenv(['-m', 'ruff', 'format']),
  'format:check': () => runVenv(['-m', 'ruff', 'format', '--check']),
  test: () => runVenv(['-m', 'pytest'], [0, PYTEST_NO_TESTS]),
  'test:coverage': testCoverage,
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Usage: node scripts/py.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
process.exit(command());
