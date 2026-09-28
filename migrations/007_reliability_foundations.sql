-- v1.3 A: generic experimental units and auditable factual assertions.
CREATE TABLE IF NOT EXISTS experimental_units (
  study_id TEXT NOT NULL REFERENCES studies(id), unit_id TEXT NOT NULL, kind TEXT NOT NULL,
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(study_id,unit_id)
);
INSERT OR IGNORE INTO experimental_units(study_id,unit_id,kind,payload_json,created_at)
SELECT s.id,'seed:'||json_each.value,'training_seed',
  json_object('id','seed:'||json_each.value,'kind','training_seed','clusterId',NULL,'attributes',json('{}'),'legacySeed',json_each.value),
  s.created_at
FROM studies s,json_each(s.payload_json,'$.seeds');

CREATE TABLE IF NOT EXISTS unit_observations (
  id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), phase TEXT NOT NULL, variant TEXT NOT NULL,
  unit_id TEXT NOT NULL, group_name TEXT, outcome_id TEXT NOT NULL REFERENCES outcome_definitions(id),
  value REAL, missing_reason TEXT, run_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(study_id,unit_id) REFERENCES experimental_units(study_id,unit_id)
);
CREATE INDEX IF NOT EXISTS unit_observations_study_phase ON unit_observations(study_id,phase,outcome_id,unit_id);

CREATE TABLE IF NOT EXISTS fact_ledgers (
  id TEXT PRIMARY KEY,program_id TEXT NOT NULL REFERENCES research_programs(id),study_id TEXT REFERENCES studies(id),
  payload_json TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fact_audits (
  id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL REFERENCES fact_ledgers(id),stage TEXT NOT NULL,status TEXT NOT NULL,
  payload_json TEXT NOT NULL,created_at TEXT NOT NULL
);
PRAGMA user_version = 8;
