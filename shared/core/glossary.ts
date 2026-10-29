import { ENTITY_TYPES, EntityType, WorldEditEntity } from '../models/analysis';
import { GlossaryEntry, GlossaryKey, GlossaryRow } from '../models/translation';

export interface GlossaryWorldKey {
  key: GlossaryKey;
  chapters: number[];
}

export function glossaryKeyId(key: GlossaryKey): string {
  return `${key.entityType}\u0000${key.entityName}\u0000${key.kind}\u0000${key.term ?? ''}`;
}

export function glossaryKeys(entities: WorldEditEntity[]): GlossaryWorldKey[] {
  const result: GlossaryWorldKey[] = [];
  for (const entity of entities) {
    if (!(ENTITY_TYPES as readonly string[]).includes(entity.type)) {
      continue;
    }
    const entityType: EntityType = entity.type as EntityType;
    const entityName: string = entity.name;
    const chapters: number[] = entity.chapters;
    result.push({ key: { entityType, entityName, term: null, kind: 'name' }, chapters });
    const seen: Set<string> = new Set([entityName.trim()]);
    const terms: { term: string; kind: 'alias' | 'title' }[] = [
      ...entity.aliases.map((term: string) => ({ term, kind: 'alias' as const })),
      ...entity.titles.map((term: string) => ({ term, kind: 'title' as const })),
    ];
    for (const { term, kind } of terms) {
      const trimmed: string = term.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push({ key: { entityType, entityName, term, kind }, chapters });
      }
    }
  }
  return result;
}

export function glossaryRows(entities: WorldEditEntity[], entries: GlossaryEntry[]): GlossaryRow[] {
  const byId: Map<string, GlossaryEntry> = new Map(
    entries.map((entry: GlossaryEntry) => [glossaryKeyId(entry), entry]),
  );
  return glossaryKeys(entities).map(({ key, chapters }: GlossaryWorldKey) => {
    const entry: GlossaryEntry | undefined = byId.get(glossaryKeyId(key));
    return {
      ...key,
      translation: entry?.translation ?? null,
      status: entry?.source ?? 'untranslated',
      chapters: chapters.length,
      chapterIndexes: chapters,
    };
  });
}

export function hasGlossaryKey(entities: WorldEditEntity[], key: GlossaryKey): boolean {
  return keyIds(entities).has(glossaryKeyId(key));
}

export function pruneEntries(entries: GlossaryEntry[], entities: WorldEditEntity[]): GlossaryEntry[] {
  const ids: Set<string> = keyIds(entities);
  return entries.filter((entry: GlossaryEntry) => ids.has(glossaryKeyId(entry)));
}

function keyIds(entities: WorldEditEntity[]): Set<string> {
  return new Set(glossaryKeys(entities).map(({ key }: GlossaryWorldKey) => glossaryKeyId(key)));
}
