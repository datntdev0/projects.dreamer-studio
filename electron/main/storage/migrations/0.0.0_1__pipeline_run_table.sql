CREATE TABLE pipeline_run (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  cancel_reason TEXT CHECK (cancel_reason IN ('user', 'appClosed')),
  params TEXT NOT NULL DEFAULT '{}',
  progress INTEGER NOT NULL DEFAULT 0,
  step_index INTEGER NOT NULL DEFAULT 0,
  step_count INTEGER NOT NULL,
  step_name TEXT,
  error_code TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX pipeline_run_created_idx ON pipeline_run (created_at DESC, id DESC);
CREATE INDEX pipeline_run_status_idx ON pipeline_run (status);
