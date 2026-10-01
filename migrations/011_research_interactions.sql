CREATE TABLE IF NOT EXISTS conversation_sessions_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','closed')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_project
  ON conversation_sessions_v15(workspace_id, project_id, updated_at);

CREATE TABLE IF NOT EXISTS conversation_messages_v15 (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES conversation_sessions_v15(id),
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);

CREATE TABLE IF NOT EXISTS candidate_sets_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  session_id TEXT NOT NULL REFERENCES conversation_sessions_v15(id),
  status TEXT NOT NULL CHECK(status IN ('open','consumed','superseded')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidate_sets_session
  ON candidate_sets_v15(session_id, created_at);

CREATE TABLE IF NOT EXISTS execution_policies_v15 (
  project_id TEXT PRIMARY KEY REFERENCES research_projects_v15(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_actions_v15 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES research_projects_v15(id),
  session_id TEXT REFERENCES conversation_sessions_v15(id),
  candidate_set_id TEXT REFERENCES candidate_sets_v15(id),
  source TEXT NOT NULL CHECK(source IN ('api','chat','candidate')),
  status TEXT NOT NULL CHECK(status IN ('proposed','accepted','rejected')),
  payload_json TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_actions_project
  ON research_actions_v15(project_id, created_at);

PRAGMA user_version = 12;
