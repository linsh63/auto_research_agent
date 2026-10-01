CREATE TABLE IF NOT EXISTS service_audit_v15 (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  workspace_id TEXT,
  project_id TEXT,
  actor_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('accepted','rejected','error')),
  required_permissions_json TEXT NOT NULL,
  external_services_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  error_code TEXT,
  remote_address TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_audit_scope ON service_audit_v15(workspace_id, project_id, started_at);

CREATE TABLE IF NOT EXISTS secret_access_audit_v15 (
  id TEXT PRIMARY KEY,
  secret_name_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  found INTEGER NOT NULL CHECK(found IN (0,1)),
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

PRAGMA user_version = 15;
