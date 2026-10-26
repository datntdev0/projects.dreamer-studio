import { CodedError, ErrorCode } from '@dreamer/shared/errors/app-error';
import { AnalysisStatus, ChapterAnalysisSummary, ReviewPage } from '@dreamer/shared/models/analysis';
import { ReviewQuery, World, WorldQuery } from '@dreamer/shared/models/analysis';
import { NovelChapterEntry, NovelMetadata } from '@dreamer/shared/models/novel-store';
import { AppPaths } from '@storage/paths';
import { novelFolder } from '../library/library-files';
import { readMetadata } from '../library/novel/novel-files';

export class AnalysisService {
  constructor(private readonly paths: () => AppPaths) {}

  async status(novelId: string): Promise<AnalysisStatus> {
    const novel: NovelMetadata = this.readNovel(novelId);
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
      ontology: { entityTypes: [], predicates: [] },
      ontologyProblems: [],
    };
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
    const metadata: NovelMetadata | null = readMetadata(novelFolder(this.paths(), novelId));
    if (metadata === null) {
      throw new CodedError(ErrorCode.NovelNotFound, `Novel not found: ${novelId}`);
    }
    return metadata;
  }
}
