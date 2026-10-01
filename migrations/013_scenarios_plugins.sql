CREATE TABLE IF NOT EXISTS plugin_sources_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK(kind IN ('local','git','npm','pi_config')),
  location TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','unavailable','disabled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, kind, location)
);

CREATE TABLE IF NOT EXISTS plugin_catalog_v15 (
  descriptor_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_id TEXT NOT NULL REFERENCES plugin_sources_v15(id),
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  compatibility_status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  UNIQUE(workspace_id, source_id, plugin_id, version, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_plugin_catalog_search ON plugin_catalog_v15(workspace_id, plugin_id, version);

CREATE TABLE IF NOT EXISTS plugin_installations_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT REFERENCES research_projects_v15(id),
  scope TEXT NOT NULL CHECK(scope IN ('project','workspace')),
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES plugin_sources_v15(id),
  descriptor_id TEXT NOT NULL REFERENCES plugin_catalog_v15(descriptor_id),
  status TEXT NOT NULL CHECK(status IN ('installed','enabled','disabled','incompatible','failed','quarantined','removed')),
  approved_permissions_json TEXT NOT NULL,
  cache_path TEXT,
  payload_json TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugin_installations_scope ON plugin_installations_v15(workspace_id, project_id, status);

CREATE TABLE IF NOT EXISTS plugin_lifecycle_v15 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES plugin_installations_v15(id),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

PRAGMA user_version = 14;
