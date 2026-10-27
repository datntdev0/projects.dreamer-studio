import type { AnalysisChapterDetail, EntityType, OverlayEdit, ReviewEdit } from '../models/analysis';
import type { World, WorldEdit, WorldEntity, WorldLink } from '../models/analysis';
import { mergeWords } from './analysis-checks';
import { isMergeable } from './analysis-review';

function cloneChapter(chapter: AnalysisChapterDetail): AnalysisChapterDetail {
  return {
    ...chapter,
    entities: chapter.entities.map((entity) => ({
      ...entity,
      aliases: [...entity.aliases],
      wordsFound: [...entity.wordsFound],
    })),
    facts: chapter.facts.map((fact) => ({ ...fact })),
  };
}

export function isReviewEdit(edit: WorldEdit): edit is ReviewEdit {
  return edit.kind === 'review-reject' || edit.kind === 'review-fix' || edit.kind === 'review-accept';
}

function applyFactEdits(chapters: AnalysisChapterDetail[], edits: OverlayEdit[]): void {
  for (const edit of edits) {
    if (edit.kind !== 'fact-edit' && edit.kind !== 'fact-delete') continue;
    const chapter = chapters.find((item) => item.index === edit.chapterIndex);
    if (!chapter) continue;
    if (edit.kind === 'fact-edit')
      Object.assign(chapter.facts.find((fact) => fact.id === edit.factId) ?? {}, edit.patch);
    else chapter.facts = chapter.facts.filter((fact) => fact.id !== edit.factId);
  }
}

function applyEntityEdit(world: World, edit: OverlayEdit): void {
  const entity = 'entityId' in edit ? world.entities.find((item) => item.id === edit.entityId) : undefined;
  if (edit.kind === 'entity-add') {
    if (!world.entities.some((item) => item.id === edit.entity.id)) {
      world.entities.push({
        ...edit.entity,
        aliases: [...(edit.entity.aliases ?? [])],
        titles: [],
        chapters: [],
        scalars: [],
        degree: 0,
        staleChapters: [],
        overlay: true,
      });
    }
  } else if (edit.kind === 'entity-rename' && entity) {
    entity.name = edit.name;
    entity.overlay = true;
  } else if (edit.kind === 'entity-change-type' && entity) {
    entity.type = edit.entityType;
    entity.overlay = true;
  } else if (edit.kind === 'entity-add-alias' && entity) {
    entity.aliases = mergeWords(entity.aliases, [edit.alias]);
    entity.overlay = true;
  } else if (edit.kind === 'entity-remove-alias' && entity) {
    entity.aliases = entity.aliases.filter((alias) => alias.toLocaleLowerCase() !== edit.alias.toLocaleLowerCase());
    entity.overlay = true;
  } else if (edit.kind === 'entity-delete' && entity) {
    world.entities = world.entities.filter((item) => item.id !== entity.id);
    world.links = world.links.filter((link) => link.source !== entity.id && link.target !== entity.id);
  } else if (edit.kind === 'entity-merge') {
    const target = world.entities.find((item) => item.id === edit.targetId);
    if (!target) return;
    for (const sourceId of edit.sourceIds) {
      if (sourceId === target.id) continue;
      const source = world.entities.find((item) => item.id === sourceId);
      if (!source) continue;
      target.aliases.push(...source.aliases.filter((alias) => !target.aliases.includes(alias)));
      target.aliases.push(source.name);
      target.titles = mergeWords(target.titles, source.titles);
      target.chapters.push(...source.chapters.filter((index) => !target.chapters.includes(index)));
      target.scalars.push(...source.scalars);
      target.staleChapters.push(...source.staleChapters.filter((index) => !target.staleChapters.includes(index)));
      target.stale ||= source.stale;
      world.links.forEach((link) => {
        if (link.source === sourceId) link.source = target.id;
        if (link.target === sourceId) link.target = target.id;
      });
      world.entities = world.entities.filter((item) => item.id !== sourceId);
    }
    target.overlay = true;
  } else if (edit.kind === 'entity-split' && entity) {
    if (world.entities.some((item) => item.id === edit.newEntity.id)) return;
    const moved = entity.aliases.filter((alias) => edit.aliases.includes(alias));
    entity.aliases = entity.aliases.filter((alias) => !edit.aliases.includes(alias));
    world.entities.push({
      ...edit.newEntity,
      aliases: moved,
      titles: [],
      chapters: [...entity.chapters],
      scalars: [],
      degree: 0,
      staleChapters: [...entity.staleChapters],
      overlay: true,
    });
    for (const link of world.links) {
      if (!link.factIds?.some((id) => edit.factIds.includes(id))) continue;
      if (link.source === entity.id) link.source = edit.newEntity.id;
      else if (link.target === entity.id) link.target = edit.newEntity.id;
      link.overlay = true;
    }
    entity.overlay = true;
  }
}

function addUserFact(world: World, edit: Extract<OverlayEdit, { kind: 'fact-add' }>): void {
  const fact = edit.fact;
  const subject = world.entities.find((entity) => entity.id === fact.subjectId);
  if (!subject) return;
  if (fact.kind === 'scalar') {
    subject.scalars.push({
      factId: fact.id,
      predicate: fact.predicate,
      chapterIndex: edit.chapterIndex,
      quote: fact.quote,
      overlay: true,
    });
  } else if (fact.kind === 'relationship' && world.entities.some((entity) => entity.id === fact.objectId)) {
    world.links.push({
      factIds: [fact.id],
      source: subject.id,
      target: fact.objectId!,
      predicate: fact.predicate,
      ...(fact.label ? { label: fact.label } : {}),
      chapters: [edit.chapterIndex],
      quotes: fact.quote ? [fact.quote] : [],
      staleChapters: [],
      overlay: true,
    });
  }
}

function sameFact(edit: OverlayEdit, factId: string, chapterIndex: number): boolean {
  if (!('chapterIndex' in edit) || edit.chapterIndex !== chapterIndex) return false;
  return edit.kind === 'fact-add' ? edit.fact.id === factId : 'factId' in edit && edit.factId === factId;
}

function editUserFact(
  active: OverlayEdit[],
  edit: Extract<OverlayEdit, { kind: 'fact-edit' | 'fact-delete' }>,
): OverlayEdit[] {
  const added = active.find((prior) => prior.kind === 'fact-add' && sameFact(prior, edit.factId, edit.chapterIndex));
  if (added?.kind !== 'fact-add') return [...active, edit];
  if (edit.kind === 'fact-delete') return active.filter((prior) => prior !== added);
  return active.map((prior) => (prior === added ? { ...added, fact: { ...added.fact, ...edit.patch } } : prior));
}

function activeOverlay(edits: OverlayEdit[]): OverlayEdit[] {
  let active: OverlayEdit[] = [];
  for (const edit of edits) {
    if (edit.kind === 'entity-reset')
      active = active.filter((prior) => !('entityId' in prior) || prior.entityId !== edit.entityId);
    else if (edit.kind === 'fact-reset')
      active = active.filter((prior) => !sameFact(prior, edit.factId, edit.chapterIndex));
    else if (edit.kind === 'fact-edit' || edit.kind === 'fact-delete') active = editUserFact(active, edit);
    else active.push(edit);
  }
  return active;
}

export interface WorldScope {
  chapter: number | null;
  only: boolean;
}

function inScope(index: number, scope: WorldScope): boolean {
  if (scope.chapter === null) return true;
  return scope.only ? index === scope.chapter : index <= scope.chapter;
}

export function buildWorld(chapters: AnalysisChapterDetail[], scope: WorldScope, edits: OverlayEdit[] = []): World {
  const selected = chapters.filter((chapter) => inScope(chapter.index, scope)).map(cloneChapter);
  const overlay = activeOverlay(edits);
  const editedFacts = new Set(overlay.flatMap((edit) => (edit.kind === 'fact-edit' ? [edit.factId] : [])));
  applyFactEdits(selected, overlay);
  const entities = new Map<string, WorldEntity>();
  const links = new Map<string, WorldLink>();
  for (const chapter of selected) {
    if (!chapter.resultFile || chapter.status === 'failed') continue;
    const idToKey = new Map<string, string>();
    for (const item of chapter.entities) {
      if (!isMergeable(item) || item.type === 'unknown') continue;
      const key = `${item.type}:${item.name.trim().toLocaleLowerCase()}`;
      idToKey.set(item.id, key);
      let entity = entities.get(key);
      if (!entity) {
        entity = {
          id: item.id,
          type: item.type as EntityType,
          name: item.name,
          aliases: [],
          titles: [],
          degree: 0,
          chapters: [],
          scalars: [],
          staleChapters: [],
        };
        entities.set(key, entity);
      }
      if (!entity.chapters.includes(chapter.index)) entity.chapters.push(chapter.index);
      entity.aliases = mergeWords(entity.aliases, item.aliases);
      entity.titles = mergeWords(entity.titles, item.titles ?? []);
      if (chapter.status === 'stale') {
        entity.stale = true;
        if (!entity.staleChapters.includes(chapter.index)) entity.staleChapters.push(chapter.index);
      }
    }
    for (const fact of chapter.facts) {
      if (!isMergeable(fact)) continue;
      const subjectKey = idToKey.get(fact.subjectId);
      if (!subjectKey) continue;
      if (fact.kind === 'scalar') {
        entities.get(subjectKey)!.scalars.push({
          factId: fact.id,
          predicate: fact.predicate,
          chapterIndex: chapter.index,
          quote: fact.quote,
          ...(editedFacts.has(fact.id) ? { overlay: true } : {}),
          ...(chapter.status === 'stale' ? { stale: true } : {}),
        });
        continue;
      }
      const objectKey = fact.objectId ? idToKey.get(fact.objectId) : undefined;
      if (!objectKey) continue;
      const key = `${subjectKey}|${fact.predicate.toLocaleLowerCase()}|${fact.label?.toLocaleLowerCase() ?? ''}|${objectKey}`;
      let link = links.get(key);
      if (!link) {
        link = {
          factIds: [],
          source: entities.get(subjectKey)!.id,
          target: entities.get(objectKey)!.id,
          predicate: fact.predicate,
          ...(fact.label ? { label: fact.label } : {}),
          chapters: [],
          quotes: [],
          staleChapters: [],
        };
        links.set(key, link);
      }
      if (!link.chapters.includes(chapter.index)) link.chapters.push(chapter.index);
      link.factIds?.push(fact.id);
      if (fact.quote && !link.quotes.includes(fact.quote)) link.quotes.push(fact.quote);
      if (editedFacts.has(fact.id)) link.overlay = true;
      if (chapter.status === 'stale') {
        link.stale = true;
        if (!link.staleChapters.includes(chapter.index)) link.staleChapters.push(chapter.index);
      }
    }
  }
  const world: World = { entities: [...entities.values()], links: [...links.values()] };
  for (const edit of overlay) {
    applyEntityEdit(world, edit);
    if (edit.kind === 'fact-add' && inScope(edit.chapterIndex, scope)) addUserFact(world, edit);
  }
  world.links = world.links.filter(
    (link) =>
      link.source !== link.target &&
      world.entities.some((entity) => entity.id === link.source) &&
      world.entities.some((entity) => entity.id === link.target),
  );
  for (const entity of world.entities) {
    entity.degree = world.links.filter((link) => link.source === entity.id || link.target === entity.id).length;
    entity.scalars.sort((a, b) => b.chapterIndex - a.chapterIndex);
  }
  return world;
}
