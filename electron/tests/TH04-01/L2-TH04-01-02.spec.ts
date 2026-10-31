import { llmDeps, seedNovel, sessionDeps, workspace } from '../support/fixtures';
import { persona, seedAnalysis } from '../support/analysis';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDataSession } from '../../main/app/app-data-session';
import { AnalysisService } from '../../main/features/analysis/analysis-service';

describe('[TH04-01] L2-TH04-01-02 review source validation', () => {
  let work: ReturnType<typeof workspace>;
  let session: AppDataSession;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let service: AnalysisService;
  let deps: ReturnType<typeof llmDeps>;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    await seedAnalysis(
      seed,
      1,
      [persona(), { id: 'hanoi', type: 'Location', name: 'Hanoi', aliases: [] }],
      [
        {
          id: 'fact',
          kind: 'relationship',
          predicate: 'located_in',
          subjectId: 'mai',
          objectId: 'hanoi',
          quote: 'Invented quote.',
        },
      ],
    );
    session = AppDataSession.open(work.root, sessionDeps());
    deps = llmDeps(work.root);
    service = new AnalysisService(() => session, deps.llm, deps.settings, deps.runs, deps.snapshots);
  });
  afterEach(() => {
    session.close();
    work.dispose();
  });

  it('AC1/2 lists an invalid quote with chapter context and rechecks a proposed correction before saving', async () => {
    const page = await service.review({ novelId: seed.novel.id, chapterIndex: null, itemKind: 'all' });
    const issue = page.items.find((item) => item.issue.reason === 'quote-not-found')!;
    expect(issue).toMatchObject({ chapterIndex: 1, chapterTitle: 'Chapter 1', fact: { id: 'fact' } });
    const edits = [
      { kind: 'fact-edit' as const, factId: 'fact', chapterIndex: 1, patch: { quote: 'Mai visited Hanoi.' } },
    ];
    expect(await service.preview({ novelId: seed.novel.id, issueKey: issue.issue.key, edits })).toMatchObject({
      resolved: true,
      added: [],
    });
    expect(
      (await service.review({ novelId: seed.novel.id, chapterIndex: null, itemKind: 'all' })).counts.errors,
    ).toBeGreaterThan(0);
    await service.edit({ novelId: seed.novel.id, edits });
    expect((await service.review({ novelId: seed.novel.id, chapterIndex: null, itemKind: 'all' })).counts.errors).toBe(
      0,
    );
  });

  it('AC5 replaces old review issues when chapter results are reanalyzed', async () => {
    expect(
      (await service.review({ novelId: seed.novel.id, chapterIndex: null, itemKind: 'all' })).counts.errors,
    ).toBeGreaterThan(0);
    await seedAnalysis(seed, 1, [persona()]);
    service = new AnalysisService(() => session, deps.llm, deps.settings, deps.runs, deps.snapshots);
    expect((await service.review({ novelId: seed.novel.id, chapterIndex: null, itemKind: 'all' })).items).toEqual([]);
  });
});
