CREATE TABLE IF NOT EXISTS scientific_decisions (
  id TEXT PRIMARY KEY,program_id TEXT NOT NULL REFERENCES research_programs(id),study_id TEXT NOT NULL REFERENCES studies(id),
  sequence INTEGER NOT NULL,action TEXT NOT NULL,payload_json TEXT NOT NULL,input_hash TEXT NOT NULL,created_at TEXT NOT NULL,
  UNIQUE(study_id,sequence)
);
CREATE TABLE IF NOT EXISTS scientific_decision_results (
  id TEXT PRIMARY KEY,decision_id TEXT NOT NULL UNIQUE REFERENCES scientific_decisions(id),study_id TEXT NOT NULL REFERENCES studies(id),
  payload_json TEXT NOT NULL,created_at TEXT NOT NULL
);
PRAGMA user_version = 10;
