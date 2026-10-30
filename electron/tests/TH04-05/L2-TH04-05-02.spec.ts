import { context, execute, llmDeps, seedNovel, workspace } from '../support/fixtures';
import { persona, seedAnalysis } from '../support/analysis';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GlossaryRunRequest } from '@dreamer/shared/models/translation';
import {
  glossaryTranslationPipeline,
  checkGlossaryRun,
} from '../../main/features/translation/glossary-translation-pipeline';
import { editGlossaryEntry, readGlossary, saveLlmEntries } from '../../main/features/translation/translation-glossary';
import { abortError } from '../../main/features/pipelines/pipeline-definition';

describe('[TH04-05] L2-TH04-05-02 glossary translation persistence', () => {
  let work: ReturnType<typeof workspace>;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let deps: ReturnType<typeof llmDeps>;
  let request: GlossaryRunRequest;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    deps = llmDeps(work.root);
    await seedAnalysis(seed, 1, [{ ...persona(), aliases: ['M'] }, persona('hanoi', 'Hanoi')]);
    request = { novelId: seed.novel.id, language: 'vi', scope: 'untranslated', batchSize: 50, instruction: null };
  });
  afterEach(() => work.dispose());
  const key = { entityType: 'Persona' as const, entityName: 'Mai', term: null, kind: 'name' as const };

  it('AC1/2/3 excludes user entries and keeps an entity and its aliases in the same planned batch', async () => {
    const pipelineDeps = { ...deps, runs: deps.translationRuns };
    const initial = await checkGlossaryRun(pipelineDeps, work.paths, request);
    const aliases = initial.batches.filter((batch) => batch.some((row) => row.entityName === 'Mai'));
    expect(aliases).toHaveLength(1);
    expect(
      aliases[0]
        .filter((row) => row.entityName === 'Mai')
        .map((row) => row.term ?? row.entityName)
        .sort(),
    ).toEqual(['M', 'Mai']);
    await editGlossaryEntry(seed.folder, 'vi', key, 'User Mai');
    const check = await checkGlossaryRun(pipelineDeps, work.paths, request);
    expect(check.queue.map((row) => row.term ?? row.entityName).sort()).toEqual(['Hanoi', 'M']);
    const all = await checkGlossaryRun(pipelineDeps, work.paths, { ...request, scope: 'all' });
    expect(all.queue.some((row) => row.entityName === 'Mai' && row.kind === 'name')).toBe(false);
    // A concurrent automatic save must also preserve the user-authored value at the persistence boundary.
    await saveLlmEntries(seed.folder, 'vi', [{ key, translation: 'Automatic Mai' }]);
    expect(readGlossary(seed.folder, 'vi').find((entry) => entry.entityName === 'Mai')).toMatchObject({
      translation: 'User Mai',
      source: 'user',
    });
    const fresh = await checkGlossaryRun(pipelineDeps, work.paths, request);
    const maiRows = fresh.batches.find((batch) => batch.some((row) => row.entityName === 'Mai'))!;
    expect(maiRows.filter((row) => row.entityName === 'Mai').map((row) => row.term)).toEqual(['M']);
  });

  it('AC4/5 keeps completed translations and summary counts when the next batch is cancelled', async () => {
    await seedAnalysis(
      seed,
      1,
      Array.from({ length: 51 }, (_, index) => persona(`e${index}`, `Name ${index}`)),
    );
    deps.runForFeature.mockResolvedValueOnce({
      value: {
        translations: Array.from({ length: 50 }, (_, index) => ({ id: index + 1, translation: `Translated ${index}` })),
      },
      usage: null,
      durationMs: 1,
    });
    deps.runForFeature.mockRejectedValueOnce(abortError());
    await expect(
      execute(glossaryTranslationPipeline({ ...deps, runs: deps.translationRuns }), context(work.paths, request).ctx),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(readGlossary(seed.folder, 'vi')).toHaveLength(50);
    expect(deps.translationRuns.lastRun(seed.novel.id)).toMatchObject({ translated: 50, failed: 0 });
    expect(deps.runForFeature).toHaveBeenCalledTimes(2);
  });
});
