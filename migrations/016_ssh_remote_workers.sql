CREATE TABLE IF NOT EXISTS ssh_host_profiles_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  host_alias TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','trusted','quarantined','disabled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id,name),
  UNIQUE(workspace_id,host_alias)
);

CREATE TABLE IF NOT EXISTS ssh_host_approvals_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  profile_id TEXT NOT NULL REFERENCES ssh_host_profiles_v16(id),
  fingerprint TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','quarantined')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ssh_host_preflights_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  profile_id TEXT NOT NULL REFERENCES ssh_host_profiles_v16(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_worker_installations_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  profile_id TEXT NOT NULL REFERENCES ssh_host_profiles_v16(id),
  protocol_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('staged','installed','enabled','disabled','failed','quarantined')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id,protocol_version,content_hash)
);

CREATE TABLE IF NOT EXISTS project_ssh_requirements_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  profile_id TEXT NOT NULL REFERENCES ssh_host_profiles_v16(id),
  installation_id TEXT NOT NULL REFERENCES remote_worker_installations_v16(id),
  profile_hash TEXT NOT NULL,
  worker_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available','missing','incompatible','quarantined')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id,profile_id)
);

CREATE TABLE IF NOT EXISTS ssh_worker_sessions_v16 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  profile_id TEXT NOT NULL REFERENCES ssh_host_profiles_v16(id),
  installation_id TEXT REFERENCES remote_worker_installations_v16(id),
  status TEXT NOT NULL CHECK(status IN ('connecting','ready','closed','failed')),
  payload_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

PRAGMA user_version = 17;
