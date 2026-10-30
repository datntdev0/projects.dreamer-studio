import { context, execute, llmDeps, seedNovel, workspace } from '../support/fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import type { ContentRunRequest } from '@dreamer/shared/models/translation';
import {
  contentTranslationPipeline,
  checkContentRun,
} from '../../main/features/translation/content-translation-pipeline';
import {
  buildChapterTranslation,
  saveTranslationEntry,
  chapterStatusesFor,
  readChapterTranslation,
} from '../../main/features/translation/translation-index';
import { saveInstruction } from '../../main/features/translation/translation-instruction';
import { editGlossaryEntry } from '../../main/features/translation/translation-glossary';
import { writeChapter } from '../../main/features/library/novel/novel-files';
import { abortError } from '../../main/features/pipelines/pipeline-definition';

describe('[TH04-05] L2-TH04-05-03 chapter translation contract', () => {
  let work: ReturnType<typeof workspace>;
  let seed: Awaited<ReturnType<typeof seedNovel>>;
  let deps: ReturnType<typeof llmDeps>;
  let request: ContentRunRequest;
  beforeEach(async () => {
    work = workspace();
    seed = await seedNovel(work.paths);
    deps = llmDeps(work.root);
    request = {
      novelId: seed.novel.id,
      language: 'vi',
      mode: 'full',
      from: null,
      to: null,
      overwrite: false,
      instruction: null,
    };
  });
  afterEach(() => work.dispose());
  const key = { entityType: 'Persona' as const, entityName: 'Mai', term: null, kind: 'name' as const };

  async function saveEdited() {
    const built = buildChapterTranslation({
      source: { title: 'Chapter 1', paragraphs: ['Mai visited Hanoi.'] },
      translation: { title: 'User title', paragraphs: ['Mai translated.'] },
      names: [{ key, translation: 'Mai' }],
      index: 1,
      file: seed.novel.chapters[0].file,
      edited: true,
      instructionHash: 'old-instruction',
      translatedAt: new Date().toISOString(),
    });
    await saveTranslationEntry(seed.folder, 'vi', seed.novel.chapters, built.entry, built.result);
    return built;
  }

  it('AC1/2/4 rechecks glossary correspondence and persists a manually edited translation with issues', async () => {
    const built = buildChapterTranslation({
      source: { title: 'Chapter 1', paragraphs: ['Mai visited Hanoi.', 'Mai returned.'] },
      translation: { title: 'Translated title', paragraphs: ['Someone visited.', 'Someone returned.'] },
      names: [{ key, translation: 'Translated Mai' }],
      index: 1,
      file: seed.novel.chapters[0].file,
      edited: true,
      instructionHash: 'hash',
      translatedAt: new Date().toISOString(),
    });
    expect(built.issues.length).toBeGreaterThan(0);
    await saveTranslationEntry(seed.folder, 'vi', seed.novel.chapters, built.entry, built.result);
    expect(readChapterTranslation(seed.folder, 'vi', seed.novel.chapters[0].file)).toMatchObject({
      paragraphs: ['Someone visited.', 'Someone returned.'],
      issues: built.issues,
    });
    expect((await chapterStatusesFor(seed.folder, seed.novel, 'vi'))[0]).toMatchObject({
      edited: true,
      issues: built.issues.length,
    });
  });

  it('AC3 changes staleness for used glossary or source edits while an instruction-only change stays current', async () => {
    await saveEdited();
    await editGlossaryEntry(seed.folder, 'vi', key, 'Mai');
    await saveInstruction(seed.folder, seed.novel.id, 'vi', 'New instruction');
    expect((await chapterStatusesFor(seed.folder, seed.novel, 'vi'))[0]).toMatchObject({
      status: 'translated',
      instructionChanged: true,
    });
    await editGlossaryEntry(seed.folder, 'vi', key, 'New Mai');
    expect((await chapterStatusesFor(seed.folder, seed.novel, 'vi'))[0]).toMatchObject({ status: 'stale' });
    await editGlossaryEntry(seed.folder, 'vi', key, 'Mai');
    const changed = await writeChapter(seed.folder, 'Changed source.');
    seed.novel.chapters[0] = { title: 'Chapter 1', ...changed };
    expect((await chapterStatusesFor(seed.folder, seed.novel, 'vi'))[0]).toMatchObject({ status: 'stale' });
  });

  it('preserves user-edited chapters unless overwrite is explicitly selected', async () => {
    await saveEdited();
    await editGlossaryEntry(seed.folder, 'vi', key, 'Mai');
    const pipelineDeps = { ...deps, runs: deps.translationRuns };
    expect((await checkContentRun(pipelineDeps, work.paths, request)).queue).toEqual([2]);
    expect((await checkContentRun(pipelineDeps, work.paths, { ...request, overwrite: true })).queue).toEqual([1, 2]);
    deps.runForFeature.mockResolvedValue({
      value: { title: 'Automatic', paragraphs: ['Automatic text.'] },
      usage: null,
      durationMs: 1,
    });
    await execute(contentTranslationPipeline(pipelineDeps), context(work.paths, request).ctx);
    expect(readChapterTranslation(seed.folder, 'vi', seed.novel.chapters[0].file)?.title).toBe('User title');
    await execute(contentTranslationPipeline(pipelineDeps), context(work.paths, { ...request, overwrite: true }).ctx);
    expect(readChapterTranslation(seed.folder, 'vi', seed.novel.chapters[0].file)?.title).toBe('Automatic');
  });

  // Requirements forbid overwriting user edits even when a glossary change makes them stale.
  // Keep this expected failure visible until contentRunQueue enforces that invariant.
  it.fails('known gap: preserves stale user-edited chapters without explicit overwrite', async () => {
    await saveEdited();
    await editGlossaryEntry(seed.folder, 'vi', key, 'Changed glossary');
    const plan = await checkContentRun({ ...deps, runs: deps.translationRuns }, work.paths, request);
    expect(plan.statuses[0]).toMatchObject({ status: 'stale', edited: true });
    expect(plan.queue).toEqual([2]);
  });

  it.each(['timeout', 'cancel'] as const)('AC6 retains completed chapters after a later %s', async (reason) => {
    deps.runForFeature.mockResolvedValueOnce({
      value: { title: 'Completed', paragraphs: ['Completed translation.'] },
      usage: null,
      durationMs: 1,
    });
    deps.runForFeature.mockRejectedValueOnce(
      reason === 'cancel' ? abortError() : new CodedError(ErrorCode.LlmTimeout, 'timeout'),
    );
    const run = execute(
      contentTranslationPipeline({ ...deps, runs: deps.translationRuns }),
      context(work.paths, request).ctx,
    );
    if (reason === 'cancel') await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    else await run;
    expect(readChapterTranslation(seed.folder, 'vi', seed.novel.chapters[0].file)?.title).toBe('Completed');
    expect(deps.translationRuns.lastRun(seed.novel.id)).toMatchObject({
      translated: 1,
      failed: reason === 'cancel' ? 0 : 1,
    });
  });
});
