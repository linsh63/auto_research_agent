-- v1.3 alpha.2: persist dataset substitutions used by protocol state transitions.
CREATE TABLE IF NOT EXISTS dataset_substitutions (
  id TEXT PRIMARY KEY,program_id TEXT NOT NULL REFERENCES research_programs(id),protocol_id TEXT REFERENCES research_protocols(id),
  decision TEXT NOT NULL,payload_json TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT NOT NULL
);
PRAGMA user_version = 9;
