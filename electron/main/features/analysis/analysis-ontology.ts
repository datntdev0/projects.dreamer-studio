import { shell } from 'electron';
import { promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ONTOLOGY_FILE, parseOntology } from '@dreamer/shared/core/ontology';
import { errorMessage } from '@dreamer/shared/errors/error-stack';
import { OntologyParseResult, OntologyProblem } from '@dreamer/shared/models/analysis';
import { ontologyDefaultFile } from '@storage/paths';
import { asWriteError } from '../library/library-io';
import { NovelFolder } from '../library/library-files';
import { writeFileAtomic } from '../library/novel/novel-files';

export function novelOntologyFile(folder: NovelFolder): string {
  return join(folder.analysis, ONTOLOGY_FILE);
}

export function loadOntology(folder: NovelFolder): OntologyParseResult {
  let text: string;
  try {
    text = readFileSync(novelOntologyFile(folder), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        ontology: { entityTypes: [], entityTypeDescriptions: {}, predicates: [] },
        problems: [{ line: 0, code: 'file-unreadable', params: { detail: errorMessage(error) } }],
      };
    }
    text = readFileSync(ontologyDefaultFile(), 'utf8');
  }
  return parseOntology(text);
}

async function writeDefault(folder: NovelFolder): Promise<void> {
  try {
    await writeFileAtomic(novelOntologyFile(folder), readFileSync(ontologyDefaultFile(), 'utf8'));
  } catch (error: unknown) {
    asWriteError(error);
  }
}

export async function ensureOntology(folder: NovelFolder): Promise<void> {
  const file: string = novelOntologyFile(folder);
  try {
    await fs.access(file);
    return;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') asWriteError(error);
  }
  await writeDefault(folder);
}

export async function openOntology(folder: NovelFolder): Promise<void> {
  await ensureOntology(folder);
  const failure: string = await shell.openPath(novelOntologyFile(folder));
  if (failure) throw new Error(failure);
}

export async function resetOntology(folder: NovelFolder): Promise<OntologyProblem[]> {
  await writeDefault(folder);
  return checkOntology(folder);
}

export function checkOntology(folder: NovelFolder): OntologyProblem[] {
  return loadOntology(folder).problems;
}
