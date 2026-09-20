-- Corrective E migration: versioned assumption register and hypothesis set aggregates.
CREATE TABLE IF NOT EXISTS research_assumption_registers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES research_questions(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES research_assumption_registers(id),
  created_at TEXT NOT NULL,
  UNIQUE(question_id, version)
);
CREATE INDEX IF NOT EXISTS research_assumption_register_question ON research_assumption_registers(question_id, version);
CREATE TABLE IF NOT EXISTS research_hypothesis_sets (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES research_programs(id),
  question_id TEXT NOT NULL REFERENCES research_questions(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES research_hypothesis_sets(id),
  created_at TEXT NOT NULL,
  UNIQUE(program_id, version)
);
CREATE INDEX IF NOT EXISTS research_hypothesis_set_program ON research_hypothesis_sets(program_id, version);
PRAGMA user_version = 4;
