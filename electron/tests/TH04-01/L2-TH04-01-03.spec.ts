import { llmDeps, seedNovel, sessionDeps, workspace } from '../support/fixtures';
import { persona, seedAnalysis } from '../support/analysis';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDataSession } from '../../main/app/app-data-session';
import { AnalysisService } from '../../main/features/analysis/analysis-service';

describe('[TH04-01] L2-TH04-01-03 persistent world overlay', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let service: AnalysisService;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    await seedAnalysis(seed, 1, [persona()]);
    await seedAnalysis(seed, 2, [persona('lan', 'Lan')]);
    session = AppDataSession.open(work.root, sessionDeps());
    service = new AnalysisService(() => session, llmDeps(work.root));
  });
  afterEach(() => {
    session.close();
    work.dispose();
  });

  it('AC1/2 narrows the world to a chapter boundary and returns source occurrences', async () => {
    const world = await service.world({ novelId: seed.novel.id, chapter: 1, only: false });
    expect(world.entities.map((entity) => entity.name)).toEqual(['Mai']);
    expect(await service.occurrences({ novelId: seed.novel.id, entityId: world.entities[0].id })).toMatchObject([
      { chapterIndex: 1, context: { match: 'Mai' } },
    ]);
    expect(
      (await service.world({ novelId: seed.novel.id, chapter: 2, only: true })).entities.map((entity) => entity.name),
    ).toEqual(['Lan']);
  });

  it('AC3/4/5 reapplies saved edits after fresh chapter results, and reports obsolete edits as orphans', async () => {
    const query = { novelId: seed.novel.id, chapter: null, only: false };
    const entityId = (await service.world(query)).entities.find((entity) => entity.name === 'Mai')!.id;
    await service.edit({
      novelId: seed.novel.id,
      edits: [{ kind: 'entity-edit', entityId, patch: { name: 'User name' } }],
    });
    await seedAnalysis(seed, 1, [persona()]);
    service = new AnalysisService(() => session, llmDeps(work.root));
    expect((await service.world(query)).entities.map((entity) => entity.name)).toContain('User name');
    await seedAnalysis(seed, 1, []);
    service = new AnalysisService(() => session, llmDeps(work.root));
    const world = await service.world(query);
    expect(world.orphans).toEqual([{ kind: 'entity-edit', entityId, patch: { name: 'User name' } }]);
    expect(world.entities.map((entity) => entity.name)).not.toContain('User name');
  });
});
