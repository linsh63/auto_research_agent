ALTER TABLE job_artifacts_v15 ADD COLUMN access TEXT NOT NULL DEFAULT 'project'
  CHECK(access IN ('public','project','private'));

CREATE TABLE IF NOT EXISTS project_bundle_imports_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  bundle_hash TEXT NOT NULL,
  source_workspace_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  compatibility_status TEXT NOT NULL CHECK(compatibility_status IN ('ready','degraded','blocked')),
  report_json TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_plugin_requirements_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  origin_scope TEXT NOT NULL CHECK(origin_scope IN ('project','workspace')),
  permissions_json TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available','missing','incompatible')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id,plugin_id,version,content_hash)
);

CREATE TABLE IF NOT EXISTS project_artifact_requirements_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  content_hash TEXT NOT NULL,
  bytes INTEGER,
  media_type TEXT,
  access TEXT NOT NULL CHECK(access IN ('public','project','private')),
  disposition TEXT NOT NULL CHECK(disposition IN ('embedded','content_addressed','missing','private_omitted')),
  uri TEXT,
  status TEXT NOT NULL CHECK(status IN ('available','missing','restricted')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id,content_hash)
);

PRAGMA user_version = 16;
