import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCoverageMap } from '@vitest/istanbul-lib-coverage';
import { create, createContext } from '@vitest/istanbul-lib-report';

function indexed(items, map) {
  return Object.fromEntries(items.map((item, index) => [index, map(item)]));
}

function lineRange(lines, line) {
  return { start: { line, column: 0 }, end: { line, column: lines[line - 1]?.length ?? 0 } };
}

function toFileCoverage(path, file) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const executed = new Set(file.executed_lines);
  const statements = [...file.executed_lines, ...file.missing_lines].sort((a, b) => a - b);
  const functions = Object.entries(file.functions).filter(([name]) => name);
  const arms = [
    ...file.executed_branches.map(([from]) => ({ from, hits: 1 })),
    ...file.missing_branches.map(([from]) => ({ from, hits: 0 })),
  ];
  const branches = [...Map.groupBy(arms, (arm) => arm.from)];

  return {
    path,
    statementMap: indexed(statements, (line) => lineRange(lines, line)),
    s: indexed(statements, (line) => (executed.has(line) ? 1 : 0)),
    fnMap: indexed(functions, ([name, fn]) => ({
      name,
      line: fn.start_line,
      decl: lineRange(lines, fn.start_line),
      loc: lineRange(lines, fn.start_line),
    })),
    f: indexed(functions, ([, fn]) => (fn.executed_lines.length > 0 ? 1 : 0)),
    branchMap: indexed(branches, ([line, lineArms]) => ({
      type: 'branch',
      line,
      loc: lineRange(lines, line),
      locations: lineArms.map(() => lineRange(lines, line)),
    })),
    b: indexed(branches, ([, lineArms]) => lineArms.map((arm) => arm.hits)),
  };
}

export function writeCoverageReport(jsonPath, sourceDir, outDir) {
  const { files } = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const coverage = Object.entries(files).map(([name, file]) => {
    const path = join(sourceDir, name);
    return [path, toFileCoverage(path, file)];
  });
  const context = createContext({ dir: outDir, coverageMap: createCoverageMap(Object.fromEntries(coverage)) });
  create('text-summary').execute(context);
  create('html').execute(context);
}
