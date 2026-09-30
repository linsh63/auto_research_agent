CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','archived')),
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_actors (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('user','agent','worker','system')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,actor_id)
);

CREATE TABLE IF NOT EXISTS research_projects_v15 (
  id TEXT PRIMARY KEY REFERENCES research_programs(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  root_project_id TEXT NOT NULL,
  parent_project_id TEXT,
  forked_from_event_id TEXT,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','archived')),
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS research_projects_v15_workspace ON research_projects_v15(workspace_id,updated_at);
CREATE INDEX IF NOT EXISTS research_projects_v15_parent ON research_projects_v15(parent_project_id);

CREATE TABLE IF NOT EXISTS research_events_v15 (
  event_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  event_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  causation_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(project_id,sequence)
);
CREATE INDEX IF NOT EXISTS research_events_v15_project ON research_events_v15(project_id,sequence);
CREATE INDEX IF NOT EXISTS research_events_v15_causation ON research_events_v15(project_id,causation_id);

CREATE TABLE IF NOT EXISTS project_projections_v15 (
  project_id TEXT PRIMARY KEY REFERENCES research_projects_v15(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  last_sequence INTEGER NOT NULL CHECK(last_sequence >= 0),
  payload_json TEXT NOT NULL,
  projection_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_receipts_v15 (
  command_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_scope TEXT NOT NULL,
  project_id TEXT,
  idempotency_key TEXT NOT NULL,
  command_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','completed')),
  result_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(workspace_id,project_scope,idempotency_key)
);
CREATE INDEX IF NOT EXISTS command_receipts_v15_pending ON command_receipts_v15(status,created_at);

PRAGMA user_version = 11;
