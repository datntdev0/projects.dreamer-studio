import { AnalysisChannel } from '@dreamer/shared/ipc/channels';
import { AnalysisStatus, OntologyProblem, ReviewPage } from '@dreamer/shared/models/analysis';
import { ReviewQuery, World, WorldQuery } from '@dreamer/shared/models/analysis';
import { isPlainObject } from '@dreamer/shared/models/validation';
import { AnalysisService } from '../features/analysis/analysis-service';
import { handleValidated } from './handle';
import { isNovelIdValue } from './library-ipc';

function isChapterIndex(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

function isWorldQuery(value: unknown): value is WorldQuery {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    isChapterIndex(value.chapter) &&
    typeof value.only === 'boolean'
  );
}

function isReviewQuery(value: unknown): value is ReviewQuery {
  return (
    isPlainObject(value) &&
    isNovelIdValue(value.novelId) &&
    (value.status === 'verified' ||
      value.status === 'failed' ||
      value.status === 'accepted' ||
      value.status === 'rejected' ||
      value.status === 'open' ||
      value.status === 'all') &&
    isChapterIndex(value.chapterIndex) &&
    (value.itemKind === 'entity' || value.itemKind === 'fact' || value.itemKind === 'all')
  );
}

export function registerAnalysisIpc(service: AnalysisService): void {
  handleValidated(AnalysisChannel.Status, isNovelIdValue, (novelId: string): Promise<AnalysisStatus> =>
    service.status(novelId),
  );
  handleValidated(AnalysisChannel.World, isWorldQuery, (query: WorldQuery): Promise<World> => service.world(query));
  handleValidated(AnalysisChannel.Review, isReviewQuery, (query: ReviewQuery): Promise<ReviewPage> =>
    service.review(query),
  );
  handleValidated(AnalysisChannel.OntologyOpen, isNovelIdValue, (novelId: string): Promise<void> =>
    service.ontologyOpen(novelId),
  );
  handleValidated(AnalysisChannel.OntologyReset, isNovelIdValue, (novelId: string): Promise<OntologyProblem[]> =>
    service.ontologyReset(novelId),
  );
  handleValidated(AnalysisChannel.OntologyCheck, isNovelIdValue, (novelId: string): Promise<OntologyProblem[]> =>
    service.ontologyCheck(novelId),
  );
}
