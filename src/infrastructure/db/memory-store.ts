import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { MemoryItemSchema, MemoryRelationSchema, type MemoryItem, type MemoryRelation } from "../../domain/memory.js";

export class MemoryStore {
  private readonly db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_namespaces (name TEXT PRIMARY KEY, parent TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_items (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, status TEXT NOT NULL,
        type TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
        source_run_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS memory_scope ON memory_items(namespace, status, type);
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(memory_id UNINDEXED, content, namespace, type);
      CREATE TABLE IF NOT EXISTS memory_relations (source_id TEXT NOT NULL, target_id TEXT NOT NULL, relation TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_id,target_id,relation));
      CREATE TABLE IF NOT EXISTS memory_access_log (id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, run_id TEXT,
        reason TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_promotions (id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, from_status TEXT NOT NULL,
        to_status TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_purge_proofs (id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, content_hash TEXT NOT NULL,
        proof_hash TEXT NOT NULL, actor TEXT NOT NULL, affected_relations INTEGER NOT NULL, created_at TEXT NOT NULL);
    `);
    const insertNamespace = this.db.prepare("INSERT OR IGNORE INTO memory_namespaces(name,parent,created_at) VALUES(?,?,?)");
    const now = new Date().toISOString();
    insertNamespace.run("run", null, now); insertNamespace.run("project", "run", now); insertNamespace.run("workspace", "project", now); insertNamespace.run("global", "workspace", now);
  }
  close(): void { this.db.close(); }
  createCandidate(input: Omit<MemoryItem, "status" | "contentHash" | "createdAt" | "updatedAt" | "invalidationCondition" | "revalidateAfter"> & Partial<Pick<MemoryItem, "invalidationCondition" | "revalidateAfter">> & { status?: MemoryItem["status"] }): MemoryItem {
    const now = new Date().toISOString();
    const item = MemoryItemSchema.parse({ ...input, status: input.status ?? "candidate", contentHash: createHash("sha256").update(input.content).digest("hex"), createdAt: now, updatedAt: now });
    const namespace = this.db.prepare("SELECT 1 ok FROM memory_namespaces WHERE name=?").get(item.namespace);
    if (!namespace) throw new Error(`Unknown memory namespace ${item.namespace}`);
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT OR REPLACE INTO memory_items(id,namespace,status,type,content,content_hash,payload_json,source_run_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(item.id,item.namespace,item.status,item.type,item.content,item.contentHash,JSON.stringify(item),item.sourceRunId,item.createdAt,item.updatedAt);
      this.db.prepare("DELETE FROM memory_fts WHERE memory_id=?").run(item.id);
      this.db.prepare("INSERT INTO memory_fts(memory_id,content,namespace,type) VALUES(?,?,?,?)").run(item.id,item.content,item.namespace,item.type);
    }); tx(); return item;
  }
  promote(id: string, toStatus: MemoryItem["status"], actor: string, note = ""): MemoryItem {
    const row = this.db.prepare("SELECT payload_json FROM memory_items WHERE id=?").get(id) as { payload_json: string } | undefined;
    if (!row) throw new Error(`Unknown memory ${id}`);
    const item = MemoryItemSchema.parse(JSON.parse(row.payload_json));
    const allowed: Record<string, string[]> = { candidate: ["reviewed", "retracted", "archived"], reviewed: ["verified", "retracted", "archived"], verified: ["superseded", "retracted", "archived"], superseded: [], retracted: [], archived: [] };
    if (!allowed[item.status]?.includes(toStatus)) throw new Error(`Invalid memory transition ${item.status} -> ${toStatus}`);
    const updated = { ...item, status: toStatus, updatedAt: new Date().toISOString() };
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE memory_items SET status=?,payload_json=?,updated_at=? WHERE id=?").run(toStatus,JSON.stringify(updated),updated.updatedAt,id);
      this.db.prepare("INSERT INTO memory_promotions(id,memory_id,from_status,to_status,actor,note,created_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),id,item.status,toStatus,actor,note,updated.updatedAt);
    }); tx(); return updated;
  }
  relate(input: MemoryRelation): MemoryRelation {
    const relation = MemoryRelationSchema.parse(input);
    this.db.prepare("INSERT OR REPLACE INTO memory_relations(source_id,target_id,relation,payload_json,created_at) VALUES(?,?,?,?,?)")
      .run(relation.sourceId, relation.targetId, relation.relation, JSON.stringify(relation), relation.createdAt);
    return relation;
  }
  search(query: string, namespaces = ["run", "project"], limit = 10): MemoryItem[] {
    if (!query.trim()) return [];
    const ftsQuery = query.split(/\s+/).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
    const placeholders = namespaces.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT i.payload_json FROM memory_fts f JOIN memory_items i ON i.id=f.memory_id WHERE memory_fts MATCH ? AND i.namespace IN (${placeholders}) AND i.status IN ('reviewed','verified') ORDER BY f.rank LIMIT ?`)
      .all(ftsQuery, ...namespaces, limit) as Array<{ payload_json: string }>;
    return rows.map((row) => MemoryItemSchema.parse(JSON.parse(row.payload_json)));
  }
  access(id: string, runId: string | null, reason: string): void {
    this.db.prepare("INSERT INTO memory_access_log(id,memory_id,run_id,reason,created_at) VALUES(?,?,?,?,?)").run(randomUUID(),id,runId,reason,new Date().toISOString());
  }
  retract(id: string, actor: string, note: string): MemoryItem { return this.promote(id, "retracted", actor, note); }
  archive(id: string, actor: string, note = ""): MemoryItem { return this.promote(id, "archived", actor, note); }
  purge(id: string, actor: string): { id: string; purged: true; proofHash: string } {
    const row = this.db.prepare("SELECT payload_json FROM memory_items WHERE id=?").get(id) as { payload_json: string } | undefined;
    if (!row) throw new Error(`Unknown memory ${id}`);
    const item = MemoryItemSchema.parse(JSON.parse(row.payload_json));
    const createdAt = new Date().toISOString();
    const proofHash = createHash("sha256").update(`${id}:${item.contentHash}:${createdAt}`).digest("hex");
    const affected = (this.db.prepare("SELECT count(*) n FROM memory_relations WHERE source_id=? OR target_id=?").get(id, id) as { n: number }).n;
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM memory_fts WHERE memory_id=?").run(id);
      this.db.prepare("DELETE FROM memory_relations WHERE source_id=? OR target_id=?").run(id, id);
      this.db.prepare("DELETE FROM memory_access_log WHERE memory_id=?").run(id);
      this.db.prepare("DELETE FROM memory_items WHERE id=?").run(id);
      this.db.prepare("INSERT INTO memory_purge_proofs(id,memory_id,content_hash,proof_hash,actor,affected_relations,created_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),id,item.contentHash,proofHash,actor,affected,createdAt);
    }); tx(); return { id, purged: true, proofHash };
  }
  trace(id: string): Record<string, unknown> {
    const item = this.db.prepare("SELECT payload_json FROM memory_items WHERE id=?").get(id) as {payload_json:string}|undefined;
    return { item: item ? JSON.parse(item.payload_json) : null,
      relations: this.db.prepare("SELECT payload_json FROM memory_relations WHERE source_id=? OR target_id=? ORDER BY created_at").all(id,id).map((row:any)=>JSON.parse(row.payload_json)),
      promotions: this.db.prepare("SELECT from_status,to_status,actor,note,created_at FROM memory_promotions WHERE memory_id=? ORDER BY created_at").all(id),
      accesses: this.db.prepare("SELECT run_id,reason,created_at FROM memory_access_log WHERE memory_id=? ORDER BY created_at").all(id) };
  }
  correct(id: string, newId: string, content: string, actor: string): MemoryItem {
    const old = this.trace(id).item as MemoryItem | null; if (!old) throw new Error(`Unknown memory ${id}`);
    const replacement = this.createCandidate({ ...old, id: newId, content, sourceRunId: old.sourceRunId, evidenceIds: old.evidenceIds, applicability: old.applicability, invalidationCondition: old.invalidationCondition, revalidateAfter: old.revalidateAfter });
    this.relate({ sourceId: newId, targetId: id, relation: "supersedes", note: `Correction by ${actor}`, createdAt: new Date().toISOString() });
    return replacement;
  }
  exportNamespace(namespace: string): Record<string, unknown> {
    const items = (this.db.prepare("SELECT payload_json FROM memory_items WHERE namespace=? ORDER BY created_at").all(namespace) as Array<{payload_json:string}>).map((row)=>JSON.parse(row.payload_json));
    const ids = new Set(items.map((item:any)=>item.id));
    const relations = (this.db.prepare("SELECT payload_json FROM memory_relations ORDER BY created_at").all() as Array<{payload_json:string}>).map((row)=>JSON.parse(row.payload_json)).filter((relation:any)=>ids.has(relation.sourceId)||ids.has(relation.targetId));
    return { schemaVersion: 1, namespace, items, relations };
  }
  importBundle(bundle: unknown): { items: number; relations: number } {
    const parsed = bundle as { schemaVersion?:number; items?:unknown[]; relations?:unknown[] };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items) || !Array.isArray(parsed.relations)) throw new Error("Invalid memory export bundle");
    let items=0, relations=0;
    for (const raw of parsed.items) { const item=MemoryItemSchema.parse(raw); if(this.trace(item.id).item) continue; this.createCandidate({ ...item, status:"candidate" }); items++; }
    for (const raw of parsed.relations) { this.relate(MemoryRelationSchema.parse(raw)); relations++; }
    return {items,relations};
  }
  counts(): Record<string, number> {
    const count = (table: string) => (this.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
    return { items: count("memory_items"), relations: count("memory_relations"), promotions: count("memory_promotions"), accesses: count("memory_access_log"), purgeProofs: count("memory_purge_proofs") };
  }
}
