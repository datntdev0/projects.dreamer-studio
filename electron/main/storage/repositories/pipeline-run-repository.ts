import { ErrorCode } from '@dreamer/shared/errors/app-error';
import { finishedStatuses, PipelineCancelReason, PipelineListQuery } from '@dreamer/shared/models/pipeline';
import { PipelinePage, PipelineRun, PipelineRunStatus } from '@dreamer/shared/models/pipeline';
import { PipelineStepDetail, PipelineType } from '@dreamer/shared/models/pipeline';
import { Database, SqlParam } from '../database';

interface PipelineRunRow {
  id: string;
  type: string;
  status: string;
  cancel_reason: string | null;
  progress: number;
  step_index: number;
  step_count: number;
  step_name: string | null;
  step_detail: string | null;
  error_code: string | null;
  error: string | null;
  label: string | null;
  novel_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface RecoveredRunRow {
  id: string;
  type: string;
  params: string;
}

export interface RecoveredRun {
  id: string;
  type: PipelineType;
  params: Record<string, unknown>;
}

const activeStatuses: PipelineRunStatus[] = ['queued', 'running'];

function where(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

function parseStepDetail(value: string | null): PipelineStepDetail | null {
  if (value === null) return null;
  try {
    const detail: unknown = JSON.parse(value);
    if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return null;
    const candidate: Record<string, unknown> = detail as Record<string, unknown>;
    const params: unknown = candidate.params;
    if (typeof candidate.key !== 'string' || typeof params !== 'object' || params === null || Array.isArray(params))
      return null;
    if (!Object.values(params).every((item: unknown): boolean => typeof item === 'string' || typeof item === 'number'))
      return null;
    return candidate as unknown as PipelineStepDetail;
  } catch {
    return null;
  }
}

function toRun(row: PipelineRunRow): PipelineRun {
  return {
    id: row.id,
    type: row.type as PipelineType,
    status: row.status as PipelineRunStatus,
    cancelReason: row.cancel_reason as PipelineCancelReason | null,
    progress: row.progress,
    stepIndex: row.step_index,
    stepCount: row.step_count,
    stepName: row.step_name,
    stepDetail: parseStepDetail(row.step_detail),
    errorCode: row.error_code as ErrorCode | null,
    error: row.error,
    label: row.label,
    novelId: row.novel_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export class PipelineRunRepository {
  constructor(private readonly db: Database) {}

  insert(run: PipelineRun, params: Record<string, unknown>): void {
    this.db.run(
      `INSERT INTO pipeline_run (id, type, status, cancel_reason, params, progress, step_index, step_count, step_name,
        step_detail, error_code, error, label, novel_id, created_at, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.type,
        run.status,
        run.cancelReason,
        JSON.stringify(params),
        run.progress,
        run.stepIndex,
        run.stepCount,
        run.stepName,
        run.stepDetail === null ? null : JSON.stringify(run.stepDetail),
        run.errorCode,
        run.error,
        run.label,
        run.novelId,
        run.createdAt,
        run.startedAt,
        run.finishedAt,
      ],
    );
  }

  update(run: PipelineRun): void {
    this.db.run(
      `UPDATE pipeline_run SET status = ?, cancel_reason = ?, progress = ?, step_index = ?, step_name = ?, step_detail = ?,
        error_code = ?, error = ?, novel_id = ?, started_at = ?, finished_at = ?
      WHERE id = ?`,
      [
        run.status,
        run.cancelReason,
        run.progress,
        run.stepIndex,
        run.stepName,
        run.stepDetail === null ? null : JSON.stringify(run.stepDetail),
        run.errorCode,
        run.error,
        run.novelId,
        run.startedAt,
        run.finishedAt,
        run.id,
      ],
    );
  }

  get(id: string): PipelineRun | null {
    const row: PipelineRunRow | undefined = this.db.get<PipelineRunRow>('SELECT * FROM pipeline_run WHERE id = ?', [
      id,
    ]);
    return row ? toRun(row) : null;
  }

  getParams(id: string): Record<string, unknown> | null {
    const row: { params: string } | undefined = this.db.get<{ params: string }>(
      'SELECT params FROM pipeline_run WHERE id = ?',
      [id],
    );
    return row ? (JSON.parse(row.params) as Record<string, unknown>) : null;
  }

  activeNovelRuns(): PipelineRun[] {
    const rows: PipelineRunRow[] = this.db.all<PipelineRunRow>(
      `SELECT * FROM pipeline_run
      WHERE novel_id IS NOT NULL AND status IN (SELECT value FROM json_each(?))
      ORDER BY created_at, id`,
      [JSON.stringify(activeStatuses)],
    );
    return rows.map(toRun);
  }

  list(query: PipelineListQuery): PipelinePage {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    if (query.finished !== null) {
      conditions.push('status IN (SELECT value FROM json_each(?))');
      params.push(JSON.stringify(query.finished ? finishedStatuses : activeStatuses));
    }
    if (query.statuses.length > 0) {
      conditions.push('status IN (SELECT value FROM json_each(?))');
      params.push(JSON.stringify(query.statuses));
    }
    if (query.types.length > 0) {
      conditions.push('type IN (SELECT value FROM json_each(?))');
      params.push(JSON.stringify(query.types));
    }
    const totalRow: { total: number } = this.db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM pipeline_run ${where(conditions)}`,
      params,
    ) as { total: number };
    const pageConditions: string[] = [...conditions];
    const pageParams: SqlParam[] = [...params];
    if (query.after) {
      pageConditions.push('(created_at, id) < (?, ?)');
      pageParams.push(query.after.createdAt, query.after.id);
    }
    const rows: PipelineRunRow[] = this.db.all<PipelineRunRow>(
      `SELECT * FROM pipeline_run ${where(pageConditions)} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...pageParams, query.limit],
    );
    const runs: PipelineRun[] = rows.map(toRun);
    const last: PipelineRun | undefined = runs[runs.length - 1];
    const next: PipelinePage['next'] =
      last && runs.length === query.limit ? { createdAt: last.createdAt, id: last.id } : null;
    return { runs, total: totalRow.total, next };
  }

  markActiveCancelled(reason: PipelineCancelReason, finishedAt: string): RecoveredRun[] {
    const rows: RecoveredRunRow[] = this.db.all<RecoveredRunRow>(
      `UPDATE pipeline_run SET status = 'cancelled', cancel_reason = ?, finished_at = ?
      WHERE status IN ('queued', 'running') RETURNING id, type, params`,
      [reason, finishedAt],
    );
    return rows.map((row: RecoveredRunRow): RecoveredRun => ({
      id: row.id,
      type: row.type as PipelineType,
      params: JSON.parse(row.params) as Record<string, unknown>,
    }));
  }

  deleteFinished(ids: string[]): string[] {
    return this.db.transaction((): string[] =>
      ids.filter((id: string): boolean => {
        const result: { changes: number | bigint } = this.db.run(
          "DELETE FROM pipeline_run WHERE id = ? AND status IN ('succeeded', 'failed', 'cancelled')",
          [id],
        );
        return Number(result.changes) > 0;
      }),
    );
  }
}
