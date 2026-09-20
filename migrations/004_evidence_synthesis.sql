-- v1.2 F: evidence synthesis, screening, novelty and capability invocation.
CREATE TABLE IF NOT EXISTS search_protocols (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES research_programs(id), question_id TEXT NOT NULL REFERENCES research_questions(id),
  version INTEGER NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES search_protocols(id), created_at TEXT NOT NULL, UNIQUE(program_id, version)
);
CREATE TABLE IF NOT EXISTS screening_decisions (
  id TEXT PRIMARY KEY, search_protocol_id TEXT NOT NULL REFERENCES search_protocols(id), source_id TEXT NOT NULL,
  document_version_id TEXT, decision TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS screening_protocol_source ON screening_decisions(search_protocol_id, source_id);
CREATE TABLE IF NOT EXISTS evidence_maps (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES research_programs(id), question_id TEXT NOT NULL REFERENCES research_questions(id),
  search_protocol_id TEXT NOT NULL REFERENCES search_protocols(id), version INTEGER NOT NULL, status TEXT NOT NULL,
  coverage_status TEXT NOT NULL, novelty_status TEXT NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES evidence_maps(id), created_at TEXT NOT NULL, UNIQUE(program_id, version)
);
CREATE TABLE IF NOT EXISTS evidence_map_entries (
  id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES evidence_maps(id), source_id TEXT NOT NULL, passage_id TEXT,
  claim_id TEXT, relation TEXT NOT NULL, topic TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_entries_map ON evidence_map_entries(map_id, relation, topic);
CREATE TABLE IF NOT EXISTS evidence_gaps (
  id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES evidence_maps(id), kind TEXT NOT NULL, severity TEXT NOT NULL,
  source_id TEXT, resolved INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS closest_work_comparisons (
  id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES evidence_maps(id), source_id TEXT NOT NULL,
  status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS capability_manifests (
  name TEXT NOT NULL, version_hash TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(name, version_hash)
);
CREATE TABLE IF NOT EXISTS capability_invocations (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES research_programs(id), capability_name TEXT NOT NULL,
  manifest_hash TEXT NOT NULL, use_case TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX IF NOT EXISTS capability_invocations_program ON capability_invocations(program_id, use_case, started_at);
PRAGMA user_version = 5;
