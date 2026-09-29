import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CapabilityInvocationSchema, CapabilityManifestSchema, ClosestWorkComparisonSchema, EvidenceGapSchema,
  EvidenceMapEntrySchema, EvidenceMapSchema, ScreeningDecisionSchema, SearchProtocolSchema,
  type CapabilityInvocation, type CapabilityManifest, type ClosestWorkComparison, type EvidenceGap,
  type EvidenceMap, type EvidenceMapEntry, type ScreeningDecision, type SearchProtocol,
  assertEvidenceEntryValid, assertNoveltyValid,
} from "../../domain/evidence-synthesis.js";
import { hashPayload } from "../../domain/research.js";
import { applyMigrationTransaction, snapshotArtifactManifest } from "./research-store.js";

type SearchProtocolDraft = Omit<SearchProtocol, "id" | "programId" | "questionId" | "version" | "status" | "contentHash" | "parentId" | "createdAt"> & { parentId?: string | null };
type EvidenceMapDraft = Omit<EvidenceMap, "id" | "programId" | "questionId" | "version" | "status" | "contentHash" | "parentId" | "createdAt"> & { parentId?: string | null };
interface PayloadRow { payload_json: string }

export class EvidenceSynthesisStore {
  private constructor(private readonly db: Database.Database, readonly migrationBackupPath: string | null, readonly artifactManifestSnapshotPath: string | null) {}

  static async open(path: string): Promise<EvidenceSynthesisStore> {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version < 4) { db.close(); throw new Error("E schema version 4 is required before F migration"); }
    if(version>10){db.close();throw new Error(`Evidence synthesis database ${version} is newer than supported version 10`);}
    let backup: string | null = null;
    let artifactManifest: string | null = null;
    if (version < 5) {
      const backupDir = resolve(dirname(path), "backups");
      mkdirSync(backupDir, { recursive: true });
      backup = resolve(backupDir, `research-before-004-${new Date().toISOString().replaceAll(":", "-")}.db`);
      await db.backup(backup);
      artifactManifest = snapshotArtifactManifest(path, backupDir, "004");
      try { applyMigrationTransaction(db, readFileSync(resolve("migrations/004_evidence_synthesis.sql"), "utf8")); }
      catch (error) { db.close(); throw error; }
    }
    const current = db.pragma("user_version", { simple: true }) as number;
    if(current<5||current>10){db.close();throw new Error(`F schema compatibility failed at version ${current}`);}
    return new EvidenceSynthesisStore(db, backup, artifactManifest);
  }

  close(): void { this.db.close(); }

  private assertProgramMutable(programId: string): void {
    const observed = this.db.prepare("SELECT 1 ok FROM research_visibility_events WHERE program_id=? AND data_role IN ('confirmation','test') LIMIT 1").get(programId);
    if (observed) throw new Error("Evidence synthesis is closed after confirmation/test visibility; derive a new run");
  }

  private selectedQuestion(programId: string): { id: string } {
    const row = this.db.prepare("SELECT id FROM research_questions WHERE program_id=? AND status='selected' ORDER BY version DESC LIMIT 1").get(programId) as { id: string } | undefined;
    if (!row) throw new Error("A selected research question is required");
    return row;
  }

  createSearchProtocol(programId: string, input: SearchProtocolDraft): SearchProtocol {
    this.assertProgramMutable(programId);
    const question = this.selectedQuestion(programId);
    const existing = this.listSearchProtocols(programId);
    const latest = existing.at(-1);
    if (latest && input.parentId !== latest.id) throw new Error("A new search protocol must name the latest protocol as parent");
    if (!latest && input.parentId) throw new Error("Initial search protocol cannot have a parent");
    if (latest && latest.status !== "frozen") throw new Error("Search protocol parent must be frozen before superseding");
    const body = { ...input, parentId: input.parentId ?? null };
    const protocol = SearchProtocolSchema.parse({ ...body, id: `search-protocol-${randomUUID()}`, programId, questionId: question.id, version: (latest?.version ?? 0) + 1, status: "draft", contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      if (latest) {
        const superseded = { ...latest, status: "superseded" as const };
        this.db.prepare("UPDATE search_protocols SET status=?,payload_json=? WHERE id=?").run(superseded.status, JSON.stringify(superseded), superseded.id);
      }
      this.db.prepare("INSERT INTO search_protocols(id,program_id,question_id,version,status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(protocol.id, protocol.programId, protocol.questionId, protocol.version, protocol.status, JSON.stringify(protocol), protocol.contentHash, protocol.parentId, protocol.createdAt);
    });
    tx();
    return protocol;
  }

  getSearchProtocol(id: string): SearchProtocol {
    const row = this.db.prepare("SELECT payload_json FROM search_protocols WHERE id=?").get(id) as PayloadRow | undefined;
    if (!row) throw new Error(`Unknown search protocol ${id}`);
    return SearchProtocolSchema.parse(JSON.parse(row.payload_json));
  }

  listSearchProtocols(programId: string): SearchProtocol[] {
    return (this.db.prepare("SELECT payload_json FROM search_protocols WHERE program_id=? ORDER BY version").all(programId) as PayloadRow[]).map((row) => SearchProtocolSchema.parse(JSON.parse(row.payload_json)));
  }

  freezeSearchProtocol(programId: string, id: string): SearchProtocol {
    this.assertProgramMutable(programId);
    const protocol = this.getSearchProtocol(id);
    if (protocol.programId !== programId || protocol.status !== "draft") throw new Error("Only a draft search protocol in this program can be frozen");
    const kinds = new Set(protocol.queryFamilies.map((family) => family.kind));
    if (!["problem", "method", "adjacent"].every((kind) => kinds.has(kind as "problem" | "method" | "adjacent"))) throw new Error("Search protocol requires problem, method and adjacent query families");
    const frozen = { ...protocol, status: "frozen" as const };
    this.db.prepare("UPDATE search_protocols SET status=?,payload_json=? WHERE id=?").run(frozen.status, JSON.stringify(frozen), frozen.id);
    return frozen;
  }

  screen(input: Omit<ScreeningDecision, "id" | "createdAt">): ScreeningDecision {
    const protocol = this.getSearchProtocol(input.searchProtocolId);
    this.assertProgramMutable(protocol.programId);
    if (protocol.status !== "frozen") throw new Error("Screening requires a frozen search protocol");
    const source = this.db.prepare("SELECT payload_json FROM evidence_sources WHERE id=?").get(input.sourceId) as PayloadRow | undefined;
    if (!source) throw new Error(`Unknown evidence source ${input.sourceId}`);
    if (input.documentVersionId) {
      const document = this.db.prepare("SELECT content_hash FROM document_versions WHERE id=? AND source_id=?").get(input.documentVersionId, input.sourceId) as { content_hash: string } | undefined;
      if (!document) throw new Error("Document version does not belong to source");
      if (document.content_hash !== input.sourceVersionHash) throw new Error("Screening sourceVersionHash does not match the document version");
    } else if (hashPayload(JSON.parse(source.payload_json)) !== input.sourceVersionHash) throw new Error("Screening sourceVersionHash does not match source metadata");
    const decision = ScreeningDecisionSchema.parse({ ...input, id: `screening-${randomUUID()}`, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO screening_decisions(id,search_protocol_id,source_id,document_version_id,decision,payload_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(decision.id, decision.searchProtocolId, decision.sourceId, decision.documentVersionId, decision.decision, JSON.stringify(decision), decision.createdAt);
    return decision;
  }

  createEvidenceMap(programId: string, input: EvidenceMapDraft): EvidenceMap {
    this.assertProgramMutable(programId);
    const question = this.selectedQuestion(programId);
    const search = this.getSearchProtocol(input.searchProtocolId);
    if (search.programId !== programId || search.questionId !== question.id || search.status !== "frozen") throw new Error("Evidence map requires the frozen search protocol for the selected question");
    const existing = this.listEvidenceMaps(programId); const latest = existing.at(-1);
    if (latest && input.parentId !== latest.id) throw new Error("A new evidence map must name the latest map as parent");
    if (!latest && input.parentId) throw new Error("Initial evidence map cannot have a parent");
    if (latest && latest.status !== "frozen") throw new Error("Evidence map parent must be frozen before superseding");
    const body = { ...input, parentId: input.parentId ?? null };
    const map = EvidenceMapSchema.parse({ ...body, id: `evidence-map-${randomUUID()}`, programId, questionId: question.id, version: (latest?.version ?? 0) + 1, status: "draft", contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      if (latest) {
        const superseded = { ...latest, status: "superseded" as const };
        this.db.prepare("UPDATE evidence_maps SET status=?,payload_json=? WHERE id=?").run(superseded.status, JSON.stringify(superseded), superseded.id);
      }
      this.db.prepare("INSERT INTO evidence_maps(id,program_id,question_id,search_protocol_id,version,status,coverage_status,novelty_status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(map.id, map.programId, map.questionId, map.searchProtocolId, map.version, map.status, map.coverageStatus, map.noveltyStatus, JSON.stringify(map), map.contentHash, map.parentId, map.createdAt);
    }); tx(); return map;
  }

  getEvidenceMap(id: string): EvidenceMap {
    const row = this.db.prepare("SELECT payload_json FROM evidence_maps WHERE id=?").get(id) as PayloadRow | undefined;
    if (!row) throw new Error(`Unknown evidence map ${id}`);
    return EvidenceMapSchema.parse(JSON.parse(row.payload_json));
  }

  listEvidenceMaps(programId: string): EvidenceMap[] { return (this.db.prepare("SELECT payload_json FROM evidence_maps WHERE program_id=? ORDER BY version").all(programId) as PayloadRow[]).map((row) => EvidenceMapSchema.parse(JSON.parse(row.payload_json))); }

  addEntry(mapId: string, input: Omit<EvidenceMapEntry, "id" | "mapId" | "createdAt">): EvidenceMapEntry {
    const map = this.getEvidenceMap(mapId); this.assertProgramMutable(map.programId); if (map.status !== "draft") throw new Error("Frozen evidence map cannot be changed");
    if (!this.db.prepare("SELECT 1 ok FROM evidence_sources WHERE id=?").get(input.sourceId)) throw new Error(`Unknown evidence source ${input.sourceId}`);
    if (input.passageId && !this.db.prepare("SELECT 1 ok FROM passages p JOIN document_versions d ON d.id=p.document_version_id WHERE p.id=? AND d.source_id=?").get(input.passageId, input.sourceId)) throw new Error("Passage does not belong to source");
    if (input.claimId && !this.db.prepare("SELECT 1 ok FROM claims WHERE id=?").get(input.claimId)) throw new Error(`Unknown claim ${input.claimId}`);
    const entry = EvidenceMapEntrySchema.parse({ ...input, id: `evidence-entry-${randomUUID()}`, mapId, createdAt: new Date().toISOString() });
    assertEvidenceEntryValid(entry);
    this.db.prepare("INSERT INTO evidence_map_entries(id,map_id,source_id,passage_id,claim_id,relation,topic,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(entry.id, entry.mapId, entry.sourceId, entry.passageId, entry.claimId, entry.relation, entry.topic, JSON.stringify(entry), entry.createdAt);
    return entry;
  }

  addGap(mapId: string, input: Omit<EvidenceGap, "id" | "mapId" | "createdAt">): EvidenceGap {
    const map = this.getEvidenceMap(mapId); this.assertProgramMutable(map.programId); if (map.status !== "draft") throw new Error("Frozen evidence map cannot be changed");
    const gap = EvidenceGapSchema.parse({ ...input, id: `evidence-gap-${randomUUID()}`, mapId, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO evidence_gaps(id,map_id,kind,severity,source_id,resolved,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(gap.id, gap.mapId, gap.kind, gap.severity, gap.sourceId, gap.resolved ? 1 : 0, JSON.stringify(gap), gap.createdAt);
    return gap;
  }

  addClosestWork(mapId: string, input: Omit<ClosestWorkComparison, "id" | "mapId" | "createdAt">): ClosestWorkComparison {
    const map = this.getEvidenceMap(mapId); this.assertProgramMutable(map.programId); if (map.status !== "draft") throw new Error("Frozen evidence map cannot be changed");
    if (!this.db.prepare("SELECT 1 ok FROM evidence_sources WHERE id=?").get(input.sourceId)) throw new Error(`Unknown evidence source ${input.sourceId}`);
    for (const passageId of input.evidencePassageIds) if (!this.db.prepare("SELECT 1 ok FROM passages p JOIN document_versions d ON d.id=p.document_version_id WHERE p.id=? AND d.source_id=?").get(passageId, input.sourceId)) throw new Error("Closest-work passage does not belong to source");
    const comparison = ClosestWorkComparisonSchema.parse({ ...input, id: `closest-work-${randomUUID()}`, mapId, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO closest_work_comparisons(id,map_id,source_id,status,payload_json,created_at) VALUES(?,?,?,?,?,?)")
      .run(comparison.id, comparison.mapId, comparison.sourceId, comparison.status, JSON.stringify(comparison), comparison.createdAt);
    return comparison;
  }

  entries(mapId: string): EvidenceMapEntry[] { return (this.db.prepare("SELECT payload_json FROM evidence_map_entries WHERE map_id=? ORDER BY created_at").all(mapId) as PayloadRow[]).map((row) => EvidenceMapEntrySchema.parse(JSON.parse(row.payload_json))); }
  gaps(mapId: string): EvidenceGap[] { return (this.db.prepare("SELECT payload_json FROM evidence_gaps WHERE map_id=? ORDER BY created_at").all(mapId) as PayloadRow[]).map((row) => EvidenceGapSchema.parse(JSON.parse(row.payload_json))); }
  comparisons(mapId: string): ClosestWorkComparison[] { return (this.db.prepare("SELECT payload_json FROM closest_work_comparisons WHERE map_id=? ORDER BY created_at").all(mapId) as PayloadRow[]).map((row) => ClosestWorkComparisonSchema.parse(JSON.parse(row.payload_json))); }
  screenings(searchProtocolId: string): ScreeningDecision[] { return (this.db.prepare("SELECT payload_json FROM screening_decisions WHERE search_protocol_id=? ORDER BY created_at").all(searchProtocolId) as PayloadRow[]).map((row) => ScreeningDecisionSchema.parse(JSON.parse(row.payload_json))); }

  freezeEvidenceMap(programId: string, mapId: string): EvidenceMap {
    this.assertProgramMutable(programId); const map = this.getEvidenceMap(mapId);
    if (map.programId !== programId || map.status !== "draft") throw new Error("Only a draft evidence map in this program can be frozen");
    const entries = this.entries(mapId); const gaps = this.gaps(mapId); const comparisons = this.comparisons(mapId);
    if (!entries.length) throw new Error("Evidence map cannot freeze without entries");
    if (entries.some((entry) => entry.critical && (entry.relation !== "premise_support" || !entry.passageId || entry.evidenceLevel !== "full_text"))) throw new Error("Every critical premise requires direct full-text provenance");
    assertNoveltyValid(map, comparisons, gaps);
    const snapshotHash = hashPayload({ map: { ...map, status: "frozen", contentHash: undefined }, screenings: this.screenings(map.searchProtocolId), entries, gaps, comparisons });
    const frozen = { ...map, status: "frozen" as const, contentHash: snapshotHash };
    this.db.prepare("UPDATE evidence_maps SET status=?,content_hash=?,payload_json=? WHERE id=?").run(frozen.status, frozen.contentHash, JSON.stringify(frozen), frozen.id);
    return frozen;
  }

  registerCapability(input: CapabilityManifest): CapabilityManifest {
    const manifest = CapabilityManifestSchema.parse(input);
    this.db.prepare("INSERT OR REPLACE INTO capability_manifests(name,version_hash,payload_json,created_at) VALUES(?,?,?,?)")
      .run(manifest.name, manifest.versionHash, JSON.stringify(manifest), new Date().toISOString());
    return manifest;
  }

  startInvocation(input: Omit<CapabilityInvocation, "id" | "status" | "outputHash" | "error" | "startedAt" | "finishedAt">): CapabilityInvocation {
    this.assertProgramMutable(input.programId);
    if (!this.db.prepare("SELECT 1 ok FROM capability_manifests WHERE name=? AND version_hash=?").get(input.capabilityName, input.manifestHash)) throw new Error("Capability manifest is not registered");
    const invocation = CapabilityInvocationSchema.parse({ ...input, id: `capability-invocation-${randomUUID()}`, status: "started", outputHash: null, error: null, startedAt: new Date().toISOString(), finishedAt: null });
    this.db.prepare("INSERT INTO capability_invocations(id,program_id,capability_name,manifest_hash,use_case,status,payload_json,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(invocation.id, invocation.programId, invocation.capabilityName, invocation.manifestHash, invocation.useCase, invocation.status, JSON.stringify(invocation), invocation.startedAt, null);
    return invocation;
  }

  finishInvocation(id: string, status: "succeeded" | "failed" | "skipped", outputHash: string | null, error: string | null = null): CapabilityInvocation {
    const row = this.db.prepare("SELECT payload_json FROM capability_invocations WHERE id=?").get(id) as PayloadRow | undefined;
    if (!row) throw new Error(`Unknown capability invocation ${id}`);
    const current = CapabilityInvocationSchema.parse(JSON.parse(row.payload_json));
    if (current.status !== "started") throw new Error("Capability invocation is already finished");
    const finished = CapabilityInvocationSchema.parse({ ...current, status, outputHash, error, finishedAt: new Date().toISOString() });
    this.db.prepare("UPDATE capability_invocations SET status=?,payload_json=?,finished_at=? WHERE id=?").run(finished.status, JSON.stringify(finished), finished.finishedAt, finished.id);
    return finished;
  }

  counts(): Record<string, number> {
    const count = (table: string) => (this.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
    return { searchProtocols: count("search_protocols"), screenings: count("screening_decisions"), maps: count("evidence_maps"), entries: count("evidence_map_entries"), gaps: count("evidence_gaps"), comparisons: count("closest_work_comparisons"), manifests: count("capability_manifests"), invocations: count("capability_invocations") };
  }
}
