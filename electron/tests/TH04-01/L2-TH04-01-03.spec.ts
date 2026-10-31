import { llmDeps, seedNovel, sessionDeps, workspace } from '../support/fixtures';
import { persona, seedAnalysis } from '../support/analysis';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDataSession } from '../../main/app/app-data-session';
import { readChapterResult } from '../../main/features/analysis/analysis-files';
import { AnalysisService } from '../../main/features/analysis/analysis-service';

describe('[TH04-01] L2-TH04-01-03 explore and edit the world', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let service: AnalysisService;
  let deps: ReturnType<typeof llmDeps>;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    await seedAnalysis(seed, 1, [persona()]);
    await seedAnalysis(seed, 2, [persona('lan', 'Lan')]);
    session = AppDataSession.open(work.root, sessionDeps());
    deps = llmDeps(work.root);
    service = new AnalysisService(() => session, deps.llm, deps.settings, deps.runs, deps.snapshots);
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

  it('AC3/4 saves edits into the chapter results, and a re-analysis of the chapter replaces them', async () => {
    const query = { novelId: seed.novel.id, chapter: null, only: false };
    const names = async (): Promise<string[]> =>
      (
        await new AnalysisService(() => session, deps.llm, deps.settings, deps.runs, deps.snapshots).world(query)
      ).entities.map((entity) => entity.name);
    const entityId = (await service.world(query)).entities.find((entity) => entity.name === 'Lan')!.id;
    await service.edit({ novelId: seed.novel.id, edits: [{ kind: 'entity-delete', entityId }] });
    expect(await names()).toEqual(['Mai']);
    expect(readChapterResult(seed.folder, seed.novel.chapters[1].file)).toMatchObject({ entities: [] });
    await seedAnalysis(seed, 2, [persona('lan', 'Lan')]);
    expect(await names()).toEqual(['Mai', 'Lan']);
  });
});
