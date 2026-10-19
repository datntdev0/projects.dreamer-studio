import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KEY_PATTERN =
  /^(app|nav|rail|topbar|status|state|home|run|soon|module|pipelines|toast|errors|dialog|common)\.[A-Za-z0-9_.-]+$/;
const LITERAL_PATTERN = /'([^'\n]+)'/g;
const FILE_NAME_PATTERN = /\.(py|ts|js|json|html|scss)$/;
const SCAN_DIRS = [join('angular', 'src'), join('electron', 'main')];
const SCAN_EXTENSIONS = ['.ts', '.html'];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path);
    const scanned = SCAN_EXTENSIONS.some((extension) => name.endsWith(extension)) && !name.endsWith('.test.ts');
    return scanned ? [path] : [];
  });
}

function findUsedKeys() {
  const used = [];
  for (const file of SCAN_DIRS.flatMap(listFiles)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const match of line.matchAll(LITERAL_PATTERN)) {
          if (KEY_PATTERN.test(match[1]) && !FILE_NAME_PATTERN.test(match[1]))
            used.push({ file, line: index + 1, key: match[1] });
        }
      });
  }
  return used;
}

const en = readJson(join('shared', 'i18n', 'en.json'));
const vi = readJson(join('shared', 'i18n', 'vi.json'));
const errorSource = readFileSync(join('shared', 'errors', 'app-error.ts'), 'utf8');
const errorCodes = [...errorSource.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]);

const problems = [
  ...findUsedKeys()
    .filter(({ key }) => !(key in en))
    .map(({ file, line, key }) => `${file}:${line} unknown key ${key}`),
  ...Object.keys(vi)
    .filter((key) => !(key in en))
    .map((key) => `vi.json has key not in en.json: ${key}`),
  ...errorCodes.flatMap((code) =>
    ['title', 'message']
      .map((part) => `errors.${code}.${part}`)
      .filter((key) => !(key in en))
      .map((key) => `en.json missing ${key}`),
  ),
];

if (problems.length > 0) {
  console.error(`check-i18n failed:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-i18n: ${Object.keys(en).length} keys OK`);
