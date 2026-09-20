-- v1.2 E: versioned research intent/question/protocol state.
CREATE TABLE IF NOT EXISTS research_programs (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_questions (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES research_programs(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  supersedes_id TEXT REFERENCES research_questions(id),
  created_at TEXT NOT NULL,
  UNIQUE(program_id, version)
);
CREATE INDEX IF NOT EXISTS research_questions_program ON research_questions(program_id, version);
CREATE TABLE IF NOT EXISTS research_assumptions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES research_questions(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_protocols (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES research_programs(id),
  question_id TEXT NOT NULL REFERENCES research_questions(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES research_protocols(id),
  created_at TEXT NOT NULL,
  UNIQUE(program_id, version)
);
CREATE INDEX IF NOT EXISTS research_protocols_program ON research_protocols(program_id, version);
CREATE TABLE IF NOT EXISTS research_approvals (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES research_programs(id),
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_hash TEXT NOT NULL,
  decision TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS research_approvals_object ON research_approvals(program_id, kind, object_id, created_at);
CREATE TABLE IF NOT EXISTS protocol_freezes (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES research_protocols(id),
  content_hash TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(protocol_id)
);
CREATE TABLE IF NOT EXISTS protocol_deviations (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES research_protocols(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_run_derivations (
  id TEXT PRIMARY KEY,
  parent_program_id TEXT NOT NULL REFERENCES research_programs(id),
  child_program_id TEXT NOT NULL REFERENCES research_programs(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_visibility_events (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES research_programs(id),
  run_id TEXT NOT NULL,
  data_role TEXT NOT NULL,
  artifact_hash TEXT,
  payload_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
PRAGMA user_version = 3;
