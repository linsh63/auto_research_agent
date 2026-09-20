-- v1.2 G: study design, candidate freeze, confirmation and statistical analysis.
CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES research_programs(id), protocol_id TEXT NOT NULL REFERENCES research_protocols(id),
  hypothesis_set_id TEXT NOT NULL REFERENCES research_hypothesis_sets(id), evidence_map_id TEXT NOT NULL REFERENCES evidence_maps(id),
  status TEXT NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outcome_definitions (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), role TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS study_data_roles (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), role TEXT NOT NULL, manifest_hash TEXT NOT NULL, sealed INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(study_id,role));
CREATE TABLE IF NOT EXISTS analysis_plans (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), status TEXT NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deviation_policies (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), payload_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS baseline_reproductions (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_freezes (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), search_run_id TEXT NOT NULL, node_id TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(study_id));
CREATE TABLE IF NOT EXISTS confirmation_tokens (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), candidate_freeze_id TEXT NOT NULL REFERENCES candidate_freezes(id), token_hash TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, issued_at TEXT NOT NULL, consumed_at TEXT, UNIQUE(study_id));
CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), phase TEXT NOT NULL, variant TEXT NOT NULL, seed INTEGER NOT NULL, group_name TEXT, outcome_id TEXT NOT NULL REFERENCES outcome_definitions(id), value REAL, missing_reason TEXT, run_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS observations_study_phase ON observations(study_id,phase,outcome_id,seed);
CREATE TABLE IF NOT EXISTS analysis_runs (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), analysis_plan_id TEXT NOT NULL REFERENCES analysis_plans(id), status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS statistical_estimates (id TEXT PRIMARY KEY, analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id), payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS diagnostic_results (id TEXT PRIMARY KEY, analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id), status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS multiplicity_records (id TEXT PRIMARY KEY, analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id), payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sensitivity_analyses (id TEXT PRIMARY KEY, analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id), payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sandbox_runs (id TEXT PRIMARY KEY, study_id TEXT, backend TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS resource_usage (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id), run_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
PRAGMA user_version = 6;
