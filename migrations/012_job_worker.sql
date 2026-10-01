CREATE TABLE IF NOT EXISTS research_jobs_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
  data_role TEXT NOT NULL CHECK(data_role IN ('exploration','confirmation')),
  priority INTEGER NOT NULL,
  available_at TEXT NOT NULL,
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
  current_attempt INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_queue
  ON research_jobs_v15(status, available_at, priority DESC, created_at);

CREATE TABLE IF NOT EXISTS job_attempts_v15 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs_v15(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled','worker_lost')),
  failure_class TEXT,
  failure_message TEXT,
  worker_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(job_id, attempt)
);

CREATE TABLE IF NOT EXISTS job_leases_v15 (
  job_id TEXT PRIMARY KEY REFERENCES research_jobs_v15(id),
  attempt INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  resources_json TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_leases_worker ON job_leases_v15(worker_id, expires_at);

CREATE TABLE IF NOT EXISTS job_logs_v15 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs_v15(id),
  attempt INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  stream TEXT NOT NULL CHECK(stream IN ('stdout','stderr','progress','system')),
  message TEXT NOT NULL,
  data_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(job_id, sequence)
);

CREATE TABLE IF NOT EXISTS job_artifacts_v15 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs_v15(id),
  attempt INTEGER NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(job_id, name)
);

CREATE TABLE IF NOT EXISTS job_confirmation_grants_v15 (
  job_id TEXT PRIMARY KEY REFERENCES research_jobs_v15(id),
  study_id TEXT NOT NULL REFERENCES studies(id),
  token_id TEXT NOT NULL UNIQUE REFERENCES confirmation_tokens(id),
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','consumed')),
  consumed_at TEXT
);

PRAGMA user_version = 13;
