import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BriefSchema, type ResearchBrief, type ResearchRun, type Stage } from "./schema.js";

interface RunRow {
  id: string;
  brief_json: string;
  stage: Stage;
  model_calls: number;
  created_at: string;
  updated_at: string;
  started_at: string;
  last_error: string | null;
}

export class Ledger {
  private readonly db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    const schemaVersion = this.db.pragma("user_version", { simple: true }) as number;
    if(schemaVersion>9)throw new Error(`Ledger schema ${schemaVersion} is newer than supported version 9`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, brief_json TEXT NOT NULL, stage TEXT NOT NULL,
        model_calls INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, started_at TEXT NOT NULL, last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
        kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_run_kind ON records(run_id, kind, created_at);
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id), kind TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    if (schemaVersion === 0) this.db.pragma("user_version = 1");
  }

  close(): void { this.db.close(); }

  create(briefInput: unknown): ResearchRun {
    const brief = BriefSchema.parse(briefInput);
    if (brief.startYear && brief.endYear && brief.startYear > brief.endYear) {
      throw new Error("startYear must be <= endYear");
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO runs
      (id, brief_json, stage, model_calls, created_at, updated_at, started_at)
      VALUES (?, ?, 'evidence', 0, ?, ?, ?)`)
      .run(id, JSON.stringify(brief), now, now, now);
    this.event(id, "run_created", { title: brief.title });
    return this.get(id);
  }

  get(id: string): ResearchRun {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    if (!row) throw new Error(`Unknown run: ${id}`);
    return {
      id: row.id, brief: BriefSchema.parse(JSON.parse(row.brief_json)), stage: row.stage,
      modelCalls: row.model_calls, createdAt: row.created_at, updatedAt: row.updated_at,
      startedAt: row.started_at, lastError: row.last_error,
    };
  }

  list(): ResearchRun[] {
    const rows = this.db.prepare("SELECT id FROM runs ORDER BY created_at DESC").all() as { id: string }[];
    return rows.map(({ id }) => this.get(id));
  }

  transition(id: string, from: Stage, to: Stage): void {
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE runs SET stage = ?, updated_at = ?, last_error = NULL WHERE id = ? AND stage = ?")
      .run(to, now, id, from);
    if (result.changes !== 1) throw new Error(`Stage changed while processing ${id}: expected ${from}`);
    this.event(id, "stage_changed", { from, to });
  }

  incrementModelCalls(id: string): void {
    this.db.prepare("UPDATE runs SET model_calls = model_calls + 1, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  setError(id: string, error: string): void {
    this.db.prepare("UPDATE runs SET last_error = ?, updated_at = ? WHERE id = ?")
      .run(error, new Date().toISOString(), id);
    this.event(id, "stage_error", { error });
  }

  record<T>(id: string, kind: string, payload: T): string {
    const recordId = randomUUID();
    this.db.prepare("INSERT INTO records (id, run_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(recordId, id, kind, JSON.stringify(payload), new Date().toISOString());
    return recordId;
  }

  latest<T>(id: string, kind: string): T | undefined {
    const row = this.db.prepare("SELECT payload_json FROM records WHERE run_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(id, kind) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) as T : undefined;
  }

  records<T>(id: string, kind: string): T[] {
    const rows = this.db.prepare("SELECT payload_json FROM records WHERE run_id = ? AND kind = ? ORDER BY created_at, rowid")
      .all(id, kind) as { payload_json: string }[];
    return rows.map((row) => JSON.parse(row.payload_json) as T);
  }

  event(id: string, kind: string, payload: unknown): void {
    this.db.prepare("INSERT INTO events (run_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)")
      .run(id, kind, JSON.stringify(payload), new Date().toISOString());
  }

  events(id: string): Array<{ sequence: number; kind: string; payload: unknown; createdAt: string }> {
    const rows = this.db.prepare("SELECT sequence, kind, payload_json, created_at FROM events WHERE run_id = ? ORDER BY sequence")
      .all(id) as Array<{ sequence: number; kind: string; payload_json: string; created_at: string }>;
    return rows.map((r) => ({ sequence: r.sequence, kind: r.kind, payload: JSON.parse(r.payload_json), createdAt: r.created_at }));
  }
}
