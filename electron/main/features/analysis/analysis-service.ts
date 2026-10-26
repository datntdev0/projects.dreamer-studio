import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisStatus, ChapterAnalysisSummary, OntologyParseResult } from '@dreamer/shared/models/analysis';
import { OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import { ReviewQuery, World, WorldQuery } from '@dreamer/shared/models/analysis';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { PipelineRunRepository } from '@storage/repositories/pipeline-run-repository';
import { AppDataSession } from '../../app/app-data-session';
import { novelFolder, NovelFolder } from '../library/library-files';
import { assertUnlocked } from '../library/novel/novel-lock';
import { readMetadata, withNovelLock } from '../library/novel/novel-files';
import { checkOntology, loadOntology, openOntology, resetOntology } from './analysis-ontology';

export class AnalysisService {
  constructor(private readonly session: () => AppDataSession) {}

  async status(novelId: string): Promise<AnalysisStatus> {
    const novel: NovelMetadata = this.readNovel(novelId);
    const parsed: OntologyParseResult = loadOntology(this.folder(novelId));
    const chapters: ChapterAnalysisSummary[] = novel.chapters.map(
      (chapter: NovelChapterEntry, index: number): ChapterAnalysisSummary => ({
        index: index + 1,
        title: chapter.title,
        file: chapter.file,
        status: 'not-analysed',
        counts: { entities: 0, facts: 0, verified: 0, failed: 0, accepted: 0, rejected: 0 },
        pending: false,
      }),
    );
    return {
      novelId,
      chapters,
      run: null,
      merge: { pending: 0, openIssues: 0, mergedAt: null },
      ontology: parsed.ontology,
      ontologyProblems: parsed.problems,
    };
  }

  ontologyOpen(novelId: string): Promise<void> {
    return withNovelLock(novelId, async (): Promise<void> => {
      this.readNovel(novelId);
      await openOntology(this.folder(novelId));
    });
  }

  async ontologyCheck(novelId: string): Promise<OntologyProblem[]> {
    this.readNovel(novelId);
    return checkOntology(this.folder(novelId));
  }

  ontologyReset(novelId: string): Promise<OntologyProblem[]> {
    return withNovelLock(novelId, async (): Promise<OntologyProblem[]> => {
      this.readNovel(novelId);
      assertUnlocked(new PipelineRunRepository(this.session().db), novelId);
      return resetOntology(this.folder(novelId));
    });
  }

  async world(query: WorldQuery): Promise<World> {
    this.readNovel(query.novelId);
    return { entities: [], links: [], mergedAt: null };
  }

  async review(query: ReviewQuery): Promise<ReviewPage> {
    this.readNovel(query.novelId);
    return { items: [], openCount: 0, failedChapters: [] };
  }

  private readNovel(novelId: string): NovelMetadata {
    const metadata: NovelMetadata | null = readMetadata(this.folder(novelId));
    if (metadata === null) {
      throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
    }
    return metadata;
  }

  private folder(novelId: string): NovelFolder {
    return novelFolder(this.session().paths, novelId);
  }
}
