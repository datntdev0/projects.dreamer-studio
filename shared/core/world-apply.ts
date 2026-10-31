import type { AnalysisEntity, AnalysisFact, ChapterResult, EditProblem, EditProblemReason } from '../models/analysis';
import type { EntityTypeName, FactPatch, WorldDraftEdit, WorldEditEntity, WorldFact } from '../models/analysis';
import { mergeWords, nameKey } from './analysis-checks';
import { foldedText } from './folded-text';
import { HAS_PERSONA, isEntityType } from './ontology-rules';

export interface ApplyChapter {
  index: number;
  result: ChapterResult;
  paragraphs: string[];
}

export type ApplyOutcome = { results: ChapterResult[]; problem: null } | { results: null; problem: EditProblem };

interface WorkChapter {
  index: number;
  paragraphs: string[];
  result: ChapterResult;
  changed: boolean;
}

interface Current {
  key: string;
  type: EntityTypeName;
  name: string;
  aliases: string[];
  titles: string[];
}

class EditRefused extends Error {
  constructor(readonly problem: EditProblem) {
    super(problem.reason);
  }
}

function refuse(reason: EditProblemReason, word: string = ''): never {
  throw new EditRefused({ reason, word });
}

function typeOf(type: string): EntityTypeName {
  return isEntityType(type) ? type : 'unknown';
}

export function entityKey(type: string, name: string): string {
  return `${typeOf(type)}:${nameKey(name.trim())}`;
}

function keyOf(entity: AnalysisEntity): string {
  return entityKey(entity.type, entity.name);
}

function sameWord(a: string, b: string): boolean {
  return nameKey(a.trim()) === nameKey(b.trim());
}

function without(words: string[], removed: string[]): string[] {
  return words.filter((word) => !removed.some((item) => sameWord(item, word)));
}

function touches(fact: AnalysisFact, id: string): boolean {
  return fact.subjectId === id || fact.objectId === id;
}

class Workspace {
  private readonly chapters: WorkChapter[];
  private readonly keys: Map<string, string>;

  constructor(chapters: ApplyChapter[], entities: WorldEditEntity[]) {
    this.chapters = chapters
      .map((chapter) => ({
        index: chapter.index,
        paragraphs: chapter.paragraphs,
        changed: false,
        result: {
          ...chapter.result,
          entities: chapter.result.entities.map((entity) => ({
            ...entity,
            aliases: [...entity.aliases],
            ...(entity.titles ? { titles: [...entity.titles] } : {}),
          })),
          facts: chapter.result.facts.map((fact) => ({ ...fact })),
        },
      }))
      .sort((a, b) => a.index - b.index);
    this.keys = new Map(entities.map((entity) => [entity.id, entityKey(entity.type, entity.name)]));
  }

  changedResults(editedAt: string): ChapterResult[] {
    return this.chapters.filter((chapter) => chapter.changed).map((chapter) => ({ ...chapter.result, editedAt }));
  }

  apply(edit: WorldDraftEdit): void {
    if (edit.kind === 'entity-add') return this.addEntity(edit.entity);
    if (edit.kind === 'entity-edit') return this.editEntity(edit.entityId, edit.patch);
    if (edit.kind === 'entity-delete') return this.deleteEntity(edit.entityId);
    if (edit.kind === 'entity-merge') return this.mergeEntities(edit.sourceIds, edit.targetId);
    if (edit.kind === 'entity-split') return this.splitEntity(edit);
    if (edit.kind === 'fact-add') return this.addFact(edit.fact);
    if (edit.kind === 'fact-edit') return this.editFact(edit.factId, edit.chapterIndex, edit.patch);
    if (edit.kind === 'fact-delete') return this.deleteFact(edit.factId, edit.chapterIndex);
    return this.setPersonaCharacter(edit.personaId, edit.characterId);
  }

  private resolve(id: string): string {
    const key = this.keys.get(id);
    if (!key || !this.chapters.some((chapter) => this.members(chapter, key).length > 0)) refuse('missing', id);
    return key;
  }

  private members(chapter: WorkChapter, key: string): AnalysisEntity[] {
    return chapter.result.entities.filter((entity) => keyOf(entity) === key);
  }

  private exists(key: string): boolean {
    return this.chapters.some((chapter) => this.members(chapter, key).length > 0);
  }

  private current(key: string): Current {
    const found = this.chapters.flatMap((chapter) => this.members(chapter, key));
    const first = found[0];
    return {
      key,
      type: typeOf(first.type),
      name: first.name,
      aliases: found.reduce<string[]>((words, entity) => mergeWords(words, entity.aliases, first.name), []),
      titles: found.reduce<string[]>((words, entity) => mergeWords(words, entity.titles ?? []), []),
    };
  }

  private found(chapter: WorkChapter, word: string): boolean {
    return foldedText(chapter.paragraphs).has(word);
  }

  private requireInText(words: string[]): void {
    for (const word of words)
      if (!this.chapters.some((chapter) => this.found(chapter, word))) refuse('word-not-in-text', word);
  }

  private checkEntity(name: string, type: string): void {
    if (!name.trim()) refuse('name-empty');
    if (!isEntityType(type)) refuse('type-invalid', type);
  }

  private chapter(index: number): WorkChapter {
    const chapter = this.chapters.find((item) => item.index === index);
    if (!chapter) refuse('chapter-not-analysed', String(index));
    return chapter;
  }

  private relink(chapter: WorkChapter, from: string, to: AnalysisEntity): void {
    for (const fact of chapter.result.facts) {
      if (fact.subjectId === from) Object.assign(fact, { subjectId: to.id, subjectName: to.name });
      if (fact.objectId === from) Object.assign(fact, { objectId: to.id, objectName: to.name });
    }
  }

  private freeId(chapter: WorkChapter, key: string, except?: AnalysisEntity): string {
    const taken = (id: string): boolean =>
      chapter.result.entities.some((entity) => entity !== except && entity.id === id);
    let id = key;
    for (let suffix = 2; taken(id); suffix++) id = `${key}#${suffix}`;
    return id;
  }

  private reId(chapter: WorkChapter, entity: AnalysisEntity): void {
    const id = this.freeId(chapter, keyOf(entity), entity);
    const from = entity.id;
    entity.id = id;
    this.relink(chapter, from, entity);
  }

  private memberIn(chapter: WorkChapter, key: string): AnalysisEntity {
    const member = this.members(chapter, key)[0];
    if (member) return member;
    const source = this.current(key);
    const copy: AnalysisEntity = {
      id: this.freeId(chapter, key),
      type: source.type,
      name: source.name,
      aliases: [],
    };
    chapter.result.entities.push(copy);
    chapter.changed = true;
    return copy;
  }

  private addEntity(entity: WorldEditEntity): void {
    const name = entity.name.trim();
    this.checkEntity(name, entity.type);
    const key = entityKey(entity.type, name);
    if (this.exists(key)) refuse('name-taken', name);
    const aliases = mergeWords([], entity.aliases, name);
    const titles = mergeWords([], entity.titles);
    this.requireInText([name, ...aliases, ...titles]);
    const targets = this.chapters.filter((chapter) => [name, ...aliases].some((word) => this.found(chapter, word)));
    for (const chapter of targets) {
      const here = titles.filter((title) => this.found(chapter, title));
      const placed = chapter === targets[0] ? mergeWords(here, titles) : here;
      chapter.result.entities.push({
        id: this.freeId(chapter, key),
        type: entity.type,
        name,
        aliases: aliases.filter((alias) => this.found(chapter, alias)),
        ...(placed.length ? { titles: placed } : {}),
      });
      chapter.changed = true;
    }
    this.keys.set(entity.id, key);
  }

  private editEntity(id: string, patch: Partial<Pick<WorldEditEntity, 'name' | 'type' | 'aliases' | 'titles'>>): void {
    const before = this.current(this.resolve(id));
    const name = (patch.name ?? before.name).trim();
    const type = patch.type ?? before.type;
    this.checkEntity(name, type);
    const key = entityKey(type, name);
    if (key !== before.key && this.exists(key)) refuse('name-taken', name);
    const aliases = patch.aliases ? mergeWords([], patch.aliases, name) : before.aliases;
    const titles = patch.titles ? mergeWords([], patch.titles) : before.titles;
    const addedAliases = without(aliases, before.aliases);
    const addedTitles = without(titles, before.titles);
    this.requireInText([...(sameWord(name, before.name) ? [] : [name]), ...addedAliases, ...addedTitles]);
    const removedAliases = without(before.aliases, aliases);
    const removedTitles = without(before.titles, titles);
    const holders = this.chapters.filter((chapter) => this.members(chapter, before.key).length > 0);
    for (const chapter of holders) {
      const extraAliases = addedAliases.filter(
        (word) => this.found(chapter, word) || (chapter === holders[0] && !holders.some((c) => this.found(c, word))),
      );
      const extraTitles = addedTitles.filter(
        (word) => this.found(chapter, word) || (chapter === holders[0] && !holders.some((c) => this.found(c, word))),
      );
      for (const member of this.members(chapter, before.key)) {
        member.name = name;
        member.type = type;
        member.aliases = mergeWords(without(member.aliases, removedAliases), extraAliases, name);
        const memberTitles = mergeWords(without(member.titles ?? [], removedTitles), extraTitles);
        if (memberTitles.length) member.titles = memberTitles;
        else delete member.titles;
        this.reId(chapter, member);
      }
      chapter.changed = true;
    }
    this.keys.set(id, key);
  }

  private deleteEntity(id: string): void {
    const key = this.resolve(id);
    for (const chapter of this.chapters) {
      const ids = new Set(this.members(chapter, key).map((entity) => entity.id));
      if (!ids.size) continue;
      chapter.result.entities = chapter.result.entities.filter((entity) => !ids.has(entity.id));
      chapter.result.facts = chapter.result.facts.filter((fact) => ![...ids].some((item) => touches(fact, item)));
      chapter.changed = true;
    }
    this.keys.delete(id);
  }

  private mergeEntities(sourceIds: string[], targetId: string): void {
    const targetKey = this.resolve(targetId);
    const target = this.current(targetKey);
    for (const sourceId of sourceIds) {
      const sourceKey = this.resolve(sourceId);
      if (sourceKey === targetKey) continue;
      for (const chapter of this.chapters) {
        for (const source of this.members(chapter, sourceKey)) {
          const into = this.members(chapter, targetKey)[0];
          if (into) {
            into.aliases = mergeWords(into.aliases, [source.name, ...source.aliases], into.name);
            const titles = mergeWords(into.titles ?? [], source.titles ?? []);
            if (titles.length) into.titles = titles;
            chapter.result.entities = chapter.result.entities.filter((entity) => entity !== source);
            this.relink(chapter, source.id, into);
          } else {
            source.aliases = mergeWords(source.aliases, [source.name], target.name);
            source.name = target.name;
            source.type = target.type;
            this.reId(chapter, source);
          }
          chapter.changed = true;
        }
      }
      this.keys.set(sourceId, targetKey);
    }
  }

  private splitEntity(edit: Extract<WorldDraftEdit, { kind: 'entity-split' }>): void {
    const fromKey = this.resolve(edit.entityId);
    const name = edit.newEntity.name.trim();
    this.checkEntity(name, edit.newEntity.type);
    const key = entityKey(edit.newEntity.type, name);
    if (this.exists(key)) refuse('name-taken', name);
    this.requireInText([name]);
    const factChapters = new Set(edit.facts.map((ref) => ref.chapterIndex));
    let targets = this.chapters.filter((chapter) => factChapters.has(chapter.index));
    if (!targets.length)
      targets = this.chapters.filter(
        (chapter) => this.members(chapter, fromKey).length > 0 && this.found(chapter, name),
      );
    if (!targets.length) refuse('word-not-in-text', name);
    for (const chapter of targets) {
      const created: AnalysisEntity = {
        id: this.freeId(chapter, key),
        type: edit.newEntity.type,
        name,
        aliases: mergeWords([], edit.aliases, name),
      };
      chapter.result.entities.push(created);
      const fromIds = new Set(this.members(chapter, fromKey).map((entity) => entity.id));
      for (const fact of chapter.result.facts) {
        if (!edit.facts.some((ref) => ref.chapterIndex === chapter.index && ref.factId === fact.id)) continue;
        if (fromIds.has(fact.subjectId)) Object.assign(fact, { subjectId: created.id, subjectName: name });
        if (fact.objectId !== undefined && fromIds.has(fact.objectId))
          Object.assign(fact, { objectId: created.id, objectName: name });
      }
      chapter.changed = true;
    }
    if (edit.aliases.length)
      for (const chapter of this.chapters)
        for (const member of this.members(chapter, fromKey)) {
          member.aliases = without(member.aliases, edit.aliases);
          chapter.changed = true;
        }
    this.keys.set(edit.newEntity.id, key);
  }

  private nextFactId(chapter: WorkChapter): string {
    const used = new Set(chapter.result.facts.map((fact) => fact.id));
    let next = chapter.result.facts.length + 1;
    while (used.has(`f-${next}`)) next++;
    return `f-${next}`;
  }

  private writeFact(chapter: WorkChapter, fact: Omit<WorldFact, 'chapterIndex'>, id?: string): string {
    const subject = this.memberIn(chapter, this.resolve(fact.subjectId));
    const object =
      fact.kind === 'relationship' && fact.objectId ? this.memberIn(chapter, this.resolve(fact.objectId)) : undefined;
    if (fact.kind === 'relationship' && !object) refuse('missing', fact.objectId ?? '');
    const label = fact.label?.trim();
    const written: AnalysisFact = {
      id: id ?? this.nextFactId(chapter),
      kind: fact.kind,
      predicate: fact.predicate,
      subjectId: subject.id,
      subjectName: subject.name,
      ...(object ? { objectId: object.id, objectName: object.name } : {}),
      ...(label ? { label } : {}),
      quote: fact.quote?.trim() ?? '',
    };
    const at = chapter.result.facts.findIndex((item) => item.id === written.id);
    if (at >= 0) chapter.result.facts[at] = written;
    else chapter.result.facts.push(written);
    chapter.changed = true;
    return written.id;
  }

  private worldFact(chapter: WorkChapter, fact: AnalysisFact): WorldFact {
    const worldId = (localId: string | undefined): string => {
      const entity = chapter.result.entities.find((item) => item.id === localId);
      if (!entity) return '';
      const key = keyOf(entity);
      this.keys.set(key, key);
      return key;
    };
    return {
      ...fact,
      chapterIndex: chapter.index,
      subjectId: worldId(fact.subjectId),
      ...(fact.objectId === undefined ? {} : { objectId: worldId(fact.objectId) }),
    };
  }

  private addFact(fact: WorldFact): void {
    this.writeFact(this.chapter(fact.chapterIndex), fact);
  }

  private editFact(factId: string, chapterIndex: number, patch: FactPatch & Partial<WorldFact>): void {
    const chapter = this.chapter(chapterIndex);
    const original = chapter.result.facts.find((fact) => fact.id === factId);
    if (!original) refuse('missing', factId);
    const merged: WorldFact = { ...this.worldFact(chapter, original), ...patch };
    if (merged.kind === 'scalar') delete merged.objectId;
    if (merged.chapterIndex === chapterIndex) {
      this.writeFact(chapter, merged, factId);
      return;
    }
    const destination = this.chapter(merged.chapterIndex);
    chapter.result.facts = chapter.result.facts.filter((fact) => fact !== original);
    chapter.changed = true;
    this.writeFact(destination, merged);
  }

  private deleteFact(factId: string, chapterIndex: number): void {
    const chapter = this.chapter(chapterIndex);
    if (!chapter.result.facts.some((fact) => fact.id === factId)) refuse('missing', factId);
    chapter.result.facts = chapter.result.facts.filter((fact) => fact.id !== factId);
    chapter.changed = true;
  }

  private setPersonaCharacter(personaId: string, characterId: string | null): void {
    const personaKey = this.resolve(personaId);
    for (const chapter of this.chapters) {
      const ids = new Set(this.members(chapter, personaKey).map((entity) => entity.id));
      const kept = chapter.result.facts.filter(
        (fact) => !(sameWord(fact.predicate, HAS_PERSONA) && fact.objectId !== undefined && ids.has(fact.objectId)),
      );
      if (kept.length === chapter.result.facts.length) continue;
      chapter.result.facts = kept;
      chapter.changed = true;
    }
    if (characterId === null) return;
    this.resolve(characterId);
    const first = this.chapters.find((chapter) => this.members(chapter, personaKey).length > 0)!;
    const persona = this.current(personaKey);
    const text = foldedText(first.paragraphs);
    const quote =
      [persona.name, ...persona.aliases].map((word) => text.context(word)?.match).find((match) => !!match) ??
      persona.name;
    this.writeFact(first, {
      id: '',
      kind: 'relationship',
      predicate: HAS_PERSONA,
      subjectId: characterId,
      objectId: personaId,
      quote,
    });
  }
}

export function applyEdits(input: {
  chapters: ApplyChapter[];
  entities: WorldEditEntity[];
  edits: WorldDraftEdit[];
  editedAt: string;
}): ApplyOutcome {
  const workspace = new Workspace(input.chapters, input.entities);
  try {
    for (const edit of input.edits) workspace.apply(edit);
  } catch (error) {
    if (error instanceof EditRefused) return { results: null, problem: error.problem };
    throw error;
  }
  return { results: workspace.changedResults(input.editedAt), problem: null };
}
