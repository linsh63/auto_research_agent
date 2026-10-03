import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { claimEvidenceRequirement, ClaimEvidenceSchema, ClaimSchema, DocumentVersionSchema, PassageSchema, SourceRecordSchema, type CanonicalDocument, type Claim, type ClaimEvidence, type DocumentVersion, type Passage, type SourceRecord } from "../../domain/evidence.js";

export interface PassageSearchResult extends Passage { score: number; snippet: string; }

export class EvidenceStore {
  private readonly db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void { this.db.close(); }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if(version>17)throw new Error(`Unsupported evidence database version ${version}`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence_sources (
        id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(source_id UNINDEXED, title, abstract, authors);
      CREATE TABLE IF NOT EXISTS source_identifiers (source_id TEXT NOT NULL REFERENCES evidence_sources(id), scheme TEXT NOT NULL,
        value TEXT NOT NULL, source TEXT NOT NULL, is_canonical INTEGER NOT NULL, PRIMARY KEY(scheme,value,source_id));
      CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES evidence_sources(id),
        payload_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS document_versions_hash ON document_versions(content_hash, source_id);
      CREATE TABLE IF NOT EXISTS passages (
        id TEXT PRIMARY KEY, document_version_id TEXT NOT NULL REFERENCES document_versions(id),
        payload_json TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS passages_version ON passages(document_version_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(
        passage_id UNINDEXED, text, section_path, title,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY, run_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS claim_evidence (
        claim_id TEXT NOT NULL REFERENCES claims(id), passage_id TEXT REFERENCES passages(id),
        experiment_run_id TEXT, relation TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (claim_id, passage_id, experiment_run_id, relation)
      );
      CREATE TABLE IF NOT EXISTS retrieval_events (
        id TEXT PRIMARY KEY, query TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS citation_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, origin TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(source_id,target_id,origin));
    `);
    if (version < 2) this.db.pragma("user_version = 2");
  }

  upsertSource(input: SourceRecord): SourceRecord {
    const source = SourceRecordSchema.parse(input);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO evidence_sources(id,payload_json,created_at,updated_at)
        VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
        .run(source.id, JSON.stringify(source), now, now);
      this.db.prepare("DELETE FROM sources_fts WHERE source_id=?").run(source.id);
      this.db.prepare("INSERT INTO sources_fts(source_id,title,abstract,authors) VALUES(?,?,?,?)")
        .run(source.id, source.title, source.abstract, source.authors.join(" "));
      this.db.prepare("DELETE FROM source_identifiers WHERE source_id=?").run(source.id);
      const insertIdentifier = this.db.prepare("INSERT OR REPLACE INTO source_identifiers(source_id,scheme,value,source,is_canonical) VALUES(?,?,?,?,?)");
      for (const identifier of source.identifiers) insertIdentifier.run(source.id, identifier.scheme, identifier.value.toLowerCase(), identifier.source, identifier.isCanonical ? 1 : 0);
    });
    tx();
    return source;
  }

  addDocumentVersion(input: DocumentVersion): DocumentVersion {
    const version = DocumentVersionSchema.parse(input);
    this.db.prepare(`INSERT OR REPLACE INTO document_versions(id,source_id,payload_json,content_hash,created_at)
      VALUES(?,?,?,?,?)`).run(version.id, version.sourceId, JSON.stringify(version), version.contentHash, version.createdAt);
    return version;
  }

  addPassage(input: Passage): Passage {
    const passage = PassageSchema.parse(input);
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT OR REPLACE INTO passages(id,document_version_id,payload_json,text,created_at) VALUES(?,?,?,?,?)`)
        .run(passage.id, passage.documentVersionId, JSON.stringify(passage), passage.text, new Date().toISOString());
      this.db.prepare("DELETE FROM passages_fts WHERE passage_id=?").run(passage.id);
      this.db.prepare("INSERT INTO passages_fts(passage_id,text,section_path,title) VALUES(?,?,?,?)")
        .run(passage.id, passage.text, passage.sectionPath.join(" / "), passage.sectionPath.at(-1) ?? "");
    });
    tx();
    return passage;
  }

  addCanonicalDocument(document: CanonicalDocument): { versionId: string; passageCount: number } {
    this.upsertSource(document.source);
    this.addDocumentVersion(document.version);
    for (const passage of document.passages) this.addPassage(passage);
    return { versionId: document.version.id, passageCount: document.passages.length };
  }

  addClaim(input: Claim): Claim {
    const claim = ClaimSchema.parse(input);
    this.db.prepare("INSERT OR REPLACE INTO claims(id,run_id,payload_json,created_at) VALUES(?,?,?,?)")
      .run(claim.id, claim.runId, JSON.stringify(claim), claim.createdAt);
    return claim;
  }

  linkClaim(input: ClaimEvidence): ClaimEvidence {
    const link = ClaimEvidenceSchema.parse(input);
    this.db.prepare(`INSERT OR REPLACE INTO claim_evidence
      (claim_id,passage_id,experiment_run_id,relation,payload_json,created_at) VALUES(?,?,?,?,?,?)`)
      .run(link.claimId, link.passageId, link.experimentRunId, link.relation, JSON.stringify(link), link.createdAt);
    return link;
  }

  searchPassages(query: string, limit = 20): PassageSearchResult[] {
    if (!query.trim()) return [];
    const ftsQuery = normalizeFtsQuery(query);
    const rows = this.db.prepare(`SELECT p.payload_json, f.rank, snippet(passages_fts,1,'<mark>','</mark>',' … ',24) snippet
      FROM passages_fts f JOIN passages p ON p.id=f.passage_id WHERE passages_fts MATCH ? ORDER BY f.rank LIMIT ?`)
      .all(ftsQuery, limit) as Array<{ payload_json: string; rank: number; snippet: string }>;
    return rows.map((row) => ({ ...PassageSchema.parse(JSON.parse(row.payload_json)), score: -row.rank, snippet: row.snippet }));
  }

  searchSources(query: string, limit = 20): SourceRecord[] {
    if (!query.trim()) return [];
    const ftsQuery = normalizeFtsQuery(query);
    const rows = this.db.prepare(`SELECT s.payload_json FROM sources_fts f JOIN evidence_sources s ON s.id=f.source_id
      WHERE sources_fts MATCH ? ORDER BY f.rank LIMIT ?`).all(ftsQuery, limit) as Array<{ payload_json: string }>;
    return rows.map((row) => SourceRecordSchema.parse(JSON.parse(row.payload_json)));
  }

  listSources(limit = 10000): SourceRecord[] {
    return (this.db.prepare("SELECT payload_json FROM evidence_sources ORDER BY created_at, rowid LIMIT ?").all(limit) as Array<{ payload_json: string }>)
      .map((row) => SourceRecordSchema.parse(JSON.parse(row.payload_json)));
  }

  lookupIdentifier(scheme: string, value: string): SourceRecord | undefined {
    const row = this.db.prepare("SELECT s.payload_json FROM source_identifiers i JOIN evidence_sources s ON s.id=i.source_id WHERE i.scheme=? AND i.value=? ORDER BY i.is_canonical DESC LIMIT 1")
      .get(scheme, value.toLowerCase()) as { payload_json: string } | undefined;
    return row ? SourceRecordSchema.parse(JSON.parse(row.payload_json)) : undefined;
  }

  getPassage(id: string): Passage | undefined {
    const row = this.db.prepare("SELECT payload_json FROM passages WHERE id=?").get(id) as { payload_json: string } | undefined;
    return row ? PassageSchema.parse(JSON.parse(row.payload_json)) : undefined;
  }

  listPassages(limit = 5000): Passage[] {
    return (this.db.prepare("SELECT payload_json FROM passages ORDER BY created_at, rowid LIMIT ?").all(limit) as Array<{ payload_json: string }>)
      .map((row) => PassageSchema.parse(JSON.parse(row.payload_json)));
  }

  firstPassageForSource(sourceId: string): Passage | undefined {
    const row = this.db.prepare(`SELECT p.payload_json FROM document_versions d JOIN passages p ON p.document_version_id=d.id
      WHERE d.source_id=? ORDER BY p.created_at, p.rowid LIMIT 1`).get(sourceId) as { payload_json: string } | undefined;
    return row ? PassageSchema.parse(JSON.parse(row.payload_json)) : undefined;
  }

  recordRetrieval(query: string, payload: unknown): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO retrieval_events(id,query,payload_json,created_at) VALUES(?,?,?,?)")
      .run(id, query, JSON.stringify(payload), new Date().toISOString());
    return id;
  }

  addCitationEdge(sourceId: string, targetId: string, origin: string): void {
    this.db.prepare("INSERT OR REPLACE INTO citation_edges(source_id,target_id,origin,created_at) VALUES(?,?,?,?)").run(sourceId,targetId,origin,new Date().toISOString());
  }

  expandCitations(sourceId: string, limit = 20): Array<{ sourceId:string; targetId:string; origin:string }> {
    return this.db.prepare("SELECT source_id sourceId,target_id targetId,origin FROM citation_edges WHERE source_id=? OR target_id=? LIMIT ?").all(sourceId,sourceId,limit) as Array<{sourceId:string;targetId:string;origin:string}>;
  }

  counts(): Record<string, number> {
    const count = (table: string) => (this.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
    return { sources: count("evidence_sources"), documentVersions: count("document_versions"), passages: count("passages"), claims: count("claims"), citationEdges: count("citation_edges"), retrievalEvents: count("retrieval_events") };
  }

  validateClaimForFinal(id: string): { ok: boolean; reasons: string[] } {
    const claimRow = this.db.prepare("SELECT payload_json FROM claims WHERE id=?").get(id) as { payload_json: string } | undefined;
    if (!claimRow) return { ok: false, reasons: ["claim_not_found"] };
    const claim = ClaimSchema.parse(JSON.parse(claimRow.payload_json));
    const requirement = claimEvidenceRequirement(claim.kind);
    const links = this.db.prepare("SELECT relation,passage_id,experiment_run_id FROM claim_evidence WHERE claim_id=?").all(id) as Array<{ relation:string; passage_id:string|null; experiment_run_id:string|null }>;
    const passageCount = new Set(links.filter((link) => link.passage_id).map((link) => link.passage_id)).size;
    const experimentCount = links.filter((link) => link.experiment_run_id).length;
    const reasons: string[] = [];
    if (passageCount < requirement.minPassages && (!requirement.allowExperiment || experimentCount === 0)) reasons.push(`requires_${requirement.minPassages}_passages_or_experiment`);
    if (claim.status === "retracted" || claim.status === "archived") reasons.push(`claim_status_${claim.status}`);
    return { ok: reasons.length === 0, reasons };
  }
}

function normalizeFtsQuery(query: string): string {
  return query.split(/\s+/).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}
