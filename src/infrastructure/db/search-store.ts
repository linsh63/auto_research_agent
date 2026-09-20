import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SearchNodeSchema, type SearchNode } from "../../domain/search.js";

export class SearchStore {
  private readonly db: Database.Database;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new Database(path); this.db.pragma("journal_mode = WAL"); this.db.exec(`
    CREATE TABLE IF NOT EXISTS search_runs (id TEXT PRIMARY KEY, strategy TEXT NOT NULL, budget_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT);
    CREATE TABLE IF NOT EXISTS experiment_nodes (id TEXT PRIMARY KEY, search_run_id TEXT NOT NULL, parent_id TEXT, signature TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS experiment_nodes_run ON experiment_nodes(search_run_id, status);
  `); const columns = this.db.pragma("table_info(experiment_nodes)") as Array<{name:string}>; if (!columns.some((column) => column.name === "signature")) this.db.exec("ALTER TABLE experiment_nodes ADD COLUMN signature TEXT"); }
  close(): void { this.db.close(); }
  add(node: SearchNode): SearchNode { const n = SearchNodeSchema.parse(node); this.db.prepare("INSERT OR REPLACE INTO experiment_nodes(id,search_run_id,parent_id,signature,status,payload_json,created_at) VALUES(?,?,?,?,?,?,?)").run(n.id,n.searchRunId,n.parentId,n.signature,n.status,JSON.stringify(n),n.createdAt); return n; }
  createRun(id: string, strategy: string, budget: unknown): void { this.db.prepare("INSERT OR REPLACE INTO search_runs(id,strategy,budget_json,status,created_at) VALUES(?,?,?,?,?)").run(id,strategy,JSON.stringify(budget),"running",new Date().toISOString()); }
  finishRun(id: string, status: "completed" | "stopped" | "failed"): void { this.db.prepare("UPDATE search_runs SET status=?,finished_at=? WHERE id=?").run(status,new Date().toISOString(),id); }
  approveFinalTest(id: string): void { const result=this.db.prepare("UPDATE search_runs SET status='test_approved' WHERE id=? AND status IN ('completed','stopped')").run(id); if(result.changes!==1) throw new Error("Search run is not ready for final-test approval"); }
  assertFinalTestApproved(id: string): void { const row=this.db.prepare("SELECT status FROM search_runs WHERE id=?").get(id) as {status:string}|undefined; if(row?.status!=="test_approved") throw new Error("Final test is sealed until researcher approval"); }
  completeFinalTest(id: string): void { this.assertFinalTestApproved(id); this.db.prepare("UPDATE search_runs SET status='final_test_completed',finished_at=? WHERE id=?").run(new Date().toISOString(),id); }
  update(id: string, status: SearchNode["status"], patch: Partial<SearchNode> = {}): SearchNode { const row=this.db.prepare("SELECT payload_json FROM experiment_nodes WHERE id=?").get(id) as {payload_json:string}|undefined; if(!row) throw new Error(`Unknown node ${id}`); const n=SearchNodeSchema.parse({...JSON.parse(row.payload_json),...patch,status}); this.db.prepare("UPDATE experiment_nodes SET status=?,payload_json=? WHERE id=?").run(n.status,JSON.stringify(n),id); return n; }
  list(runId: string): SearchNode[] { return (this.db.prepare("SELECT payload_json FROM experiment_nodes WHERE search_run_id=? ORDER BY created_at").all(runId) as Array<{payload_json:string}>).map(r=>SearchNodeSchema.parse(JSON.parse(r.payload_json))); }
  findBySignature(signature: string): SearchNode | undefined { const row=this.db.prepare("SELECT payload_json FROM experiment_nodes WHERE signature=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1").get(signature) as {payload_json:string}|undefined; return row ? SearchNodeSchema.parse(JSON.parse(row.payload_json)) : undefined; }
  getNode(id: string): SearchNode | undefined { const row=this.db.prepare("SELECT payload_json FROM experiment_nodes WHERE id=?").get(id) as {payload_json:string}|undefined; return row ? SearchNodeSchema.parse(JSON.parse(row.payload_json)) : undefined; }
  getRun(id: string): {id:string;strategy:string;status:string;budget:unknown;createdAt:string;finishedAt:string|null}|undefined { const row=this.db.prepare("SELECT id,strategy,status,budget_json,created_at,finished_at FROM search_runs WHERE id=?").get(id) as {id:string;strategy:string;status:string;budget_json:string;created_at:string;finished_at:string|null}|undefined; return row ? {id:row.id,strategy:row.strategy,status:row.status,budget:JSON.parse(row.budget_json),createdAt:row.created_at,finishedAt:row.finished_at}:undefined; }
}
