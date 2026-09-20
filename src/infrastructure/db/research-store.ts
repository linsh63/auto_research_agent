import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  ApprovalSchema, AssumptionRegisterSchema, AssumptionSchema, HypothesisSetSchema, ProtocolDeviationSchema,
  ProtocolFreezeSchema, ResearchIntentSchema, ResearchProgramSchema, ResearchProtocolSchema,
  ResearchQuestionSchema, RunDerivationSchema, VisibilityEventSchema,
  type Approval, type Assumption, type AssumptionRegister, type HypothesisSet, type ProtocolDeviation, type ProtocolFreeze,
  type ResearchIntent, type ResearchProgram, type ResearchProtocol, type ResearchQuestion,
  type ResearchProfile, type RunDerivation, type VisibilityEvent, type HypothesisItem,
  assertAggregateCanFreeze, assertConfirmationAllowed, assertProtocolCanFreeze, hashPayload,
} from "../../domain/research.js";

export type QuestionDraft = Omit<ResearchQuestion, "id" | "programId" | "version" | "status" | "contentHash" | "supersedesId" | "createdAt"> & { supersedesId?: string | null };
export type ProtocolDraft = Omit<ResearchProtocol, "id" | "programId" | "questionId" | "version" | "profile" | "status" | "contentHash" | "parentId" | "createdAt"> & { profile?: ResearchProfile; parentId?: string | null };
export type HypothesisSetDraft = { hypotheses: Array<Omit<HypothesisItem, "id">>; parentId?: string | null };
export type DeviationRequest = Omit<ProtocolDeviation, "id" | "protocolId" | "approved" | "resolution" | "approvedBy" | "resolvedAt" | "createdAt">;

interface ProgramRow { payload_json: string }
interface QuestionRow { payload_json: string }
interface ProtocolRow { payload_json: string }

export interface ResearchStatus {
  program: ResearchProgram;
  questions: ResearchQuestion[];
  assumptions: Assumption[];
  assumptionRegisters: AssumptionRegister[];
  hypothesisSets: HypothesisSet[];
  protocols: ResearchProtocol[];
  approvals: Approval[];
  freezes: ProtocolFreeze[];
  deviations: ProtocolDeviation[];
  derivations: RunDerivation[];
  visibility: VisibilityEvent[];
}

export function applyMigrationTransaction(db: Database.Database, sql: string): void {
  const transaction = db.transaction(() => db.exec(sql));
  transaction();
}

export class ResearchStore {
  private readonly db: Database.Database;
  private readonly backupPath: string | null;
  private readonly artifactManifestPath: string | null;
  private readonly maxDerivedRuns: number;

  private constructor(private readonly path: string, db: Database.Database, backupPath: string | null, artifactManifestPath: string | null, maxDerivedRuns: number) {
    this.db = db;
    this.backupPath = backupPath;
    this.artifactManifestPath = artifactManifestPath;
    this.maxDerivedRuns = maxDerivedRuns;
  }

  static async open(path: string, options: { maxDerivedRuns?: number } = {}): Promise<ResearchStore> {
    const maxDerivedRuns = options.maxDerivedRuns ?? 3;
    if (!Number.isInteger(maxDerivedRuns) || maxDerivedRuns < 1) throw new Error("maxDerivedRuns must be a positive integer");
    mkdirSync(dirname(path), { recursive: true });
    const existed = existsSync(path);
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version > 4) {
      db.close();
      throw new Error(`Research database ${version} is newer than supported version 4`);
    }
    let backupPath: string | null = null;
    let artifactManifestPath: string | null = null;
    if (version < 3 && existed) {
      const backupDir = resolve(dirname(path), "backups");
      mkdirSync(backupDir, { recursive: true });
      backupPath = resolve(backupDir, `research-before-003-${new Date().toISOString().replaceAll(":", "-")}.db`);
      await db.backup(backupPath);
      artifactManifestPath = ResearchStore.snapshotArtifacts(path, backupDir, "003");
    }
    if (version < 3) {
      try { applyMigrationTransaction(db, readFileSync(resolve("migrations/003_research_protocol.sql"), "utf8")); }
      catch (error) { db.close(); throw error; }
      const migrated = db.pragma("user_version", { simple: true }) as number;
      if (migrated !== 3) { db.close(); throw new Error(`Research migration 003 did not reach schema version 3 (got ${migrated})`); }
    }
    let current = db.pragma("user_version", { simple: true }) as number;
    if (current < 4) {
      const backupDir = resolve(dirname(path), "backups");
      mkdirSync(backupDir, { recursive: true });
      const correctiveBackup = resolve(backupDir, `research-before-003b-${new Date().toISOString().replaceAll(":", "-")}.db`);
      await db.backup(correctiveBackup);
      backupPath ??= correctiveBackup;
      artifactManifestPath ??= ResearchStore.snapshotArtifacts(path, backupDir, "003b");
      try { applyMigrationTransaction(db, readFileSync(resolve("migrations/003b_research_cognitive_objects.sql"), "utf8")); }
      catch (error) { db.close(); throw error; }
      current = db.pragma("user_version", { simple: true }) as number;
      if (current !== 4) { db.close(); throw new Error(`Research migration 003b did not reach schema version 4 (got ${current})`); }
    }
    return new ResearchStore(path, db, backupPath, artifactManifestPath, maxDerivedRuns);
  }

  close(): void { this.db.close(); }

  migrationBackupPath(): string | null { return this.backupPath; }
  artifactManifestSnapshotPath(): string | null { return this.artifactManifestPath; }

  private static snapshotArtifacts(databasePath: string, backupDir: string, migration: string): string {
    const root = resolve(dirname(databasePath), "artifacts");
    const entries: Array<{ path: string; size: number; sha256: string }> = [];
    const visit = (directory: string): void => {
      if (!existsSync(directory)) return;
      for (const name of readdirSync(directory)) {
        const path = resolve(directory, name);
        if (statSync(path).isDirectory()) visit(path);
        else {
          const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
          entries.push({ path: relative(root, path), size: statSync(path).size, sha256: digest });
        }
      }
    };
    visit(root);
    const target = resolve(backupDir, `artifact-manifest-before-${migration}.json`);
    writeFileSync(target, JSON.stringify({ schemaVersion: 1, source: root, createdAt: new Date().toISOString(), artifacts: entries }, null, 2) + "\n");
    return target;
  }

  createProgram(input: unknown, derivedFromId: string | null = null): ResearchProgram {
    const intent = ResearchIntentSchema.parse(input);
    const id = `program-${randomUUID()}`;
    const now = new Date().toISOString();
    const program = ResearchProgramSchema.parse({ ...intent, id, status: "draft", contentHash: hashPayload(intent), derivedFromId, createdAt: now, updatedAt: now });
    this.db.prepare("INSERT INTO research_programs(id,profile,status,payload_json,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(program.id, program.profile, program.status, JSON.stringify(program), program.contentHash, program.createdAt, program.updatedAt);
    return program;
  }

  getProgram(id: string): ResearchProgram {
    const row = this.db.prepare("SELECT payload_json FROM research_programs WHERE id=?").get(id) as ProgramRow | undefined;
    if (!row) throw new Error(`Unknown research program ${id}`);
    return ResearchProgramSchema.parse(JSON.parse(row.payload_json));
  }

  listPrograms(): ResearchProgram[] {
    return (this.db.prepare("SELECT payload_json FROM research_programs ORDER BY created_at").all() as ProgramRow[])
      .map((row) => ResearchProgramSchema.parse(JSON.parse(row.payload_json)));
  }

  private updateProgram(program: ResearchProgram): ResearchProgram {
    const parsed = ResearchProgramSchema.parse({ ...program, updatedAt: new Date().toISOString() });
    this.db.prepare("UPDATE research_programs SET profile=?,status=?,payload_json=?,content_hash=?,updated_at=? WHERE id=?")
      .run(parsed.profile, parsed.status, JSON.stringify(parsed), parsed.contentHash, parsed.updatedAt, parsed.id);
    return parsed;
  }

  private assertProgramMutable(programId: string): void {
    if (this.visibility(programId).some((event) => event.dataRole === "confirmation" || event.dataRole === "test")) {
      throw new Error("Research program is closed after confirmation/test visibility; derive a new run");
    }
  }

  addQuestion(programId: string, input: QuestionDraft): ResearchQuestion {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const latest = this.db.prepare("SELECT max(version) version FROM research_questions WHERE program_id=?").get(programId) as { version: number | null };
    const now = new Date().toISOString();
    const version = (latest.version ?? 0) + 1;
    const body = { ...input, supersedesId: input.supersedesId ?? null };
    const question = ResearchQuestionSchema.parse({ ...body, id: `question-${randomUUID()}`, programId, version, status: "proposed", contentHash: hashPayload(body), createdAt: now });
    this.db.prepare("INSERT INTO research_questions(id,program_id,version,status,payload_json,content_hash,supersedes_id,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(question.id, program.id, question.version, question.status, JSON.stringify(question), question.contentHash, question.supersedesId, question.createdAt);
    return question;
  }

  getQuestion(id: string): ResearchQuestion {
    const row = this.db.prepare("SELECT payload_json FROM research_questions WHERE id=?").get(id) as QuestionRow | undefined;
    if (!row) throw new Error(`Unknown research question ${id}`);
    return ResearchQuestionSchema.parse(JSON.parse(row.payload_json));
  }

  listQuestions(programId: string): ResearchQuestion[] {
    this.getProgram(programId);
    return (this.db.prepare("SELECT payload_json FROM research_questions WHERE program_id=? ORDER BY version").all(programId) as QuestionRow[])
      .map((row) => ResearchQuestionSchema.parse(JSON.parse(row.payload_json)));
  }

  selectQuestion(programId: string, questionId: string): ResearchQuestion {
    this.assertProgramMutable(programId);
    const question = this.getQuestion(questionId);
    if (question.programId !== programId) throw new Error("Question does not belong to program");
    if (question.status !== "proposed") throw new Error(`Question is not selectable from ${question.status}`);
    const tx = this.db.transaction(() => {
      const prior = this.listQuestions(programId).filter((item) => item.status === "selected");
      for (const item of prior) {
        const updated = { ...item, status: "superseded" as const };
        this.db.prepare("UPDATE research_questions SET status=?,payload_json=? WHERE id=?").run(updated.status, JSON.stringify(updated), updated.id);
      }
      const selected = { ...question, status: "selected" as const };
      this.db.prepare("UPDATE research_questions SET status=?,payload_json=? WHERE id=?").run(selected.status, JSON.stringify(selected), selected.id);
    });
    tx();
    return this.getQuestion(questionId);
  }

  addAssumption(questionId: string, input: Omit<Assumption, "id" | "questionId" | "createdAt">): Assumption {
    const question = this.getQuestion(questionId);
    this.assertProgramMutable(question.programId);
    const assumption = AssumptionSchema.parse({ ...input, id: `assumption-${randomUUID()}`, questionId, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO research_assumptions(id,question_id,payload_json,created_at) VALUES(?,?,?,?)")
      .run(assumption.id, assumption.questionId, JSON.stringify(assumption), assumption.createdAt);
    return assumption;
  }

  approveScope(programId: string, actor = "researcher", note = ""): Approval {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const question = this.listQuestions(programId).find((item) => item.status === "selected");
    if (!question) throw new Error("A selected research question is required before scope approval");
    const approval = ApprovalSchema.parse({ id: `approval-${randomUUID()}`, programId, kind: "scope", objectId: question.id, objectHash: question.contentHash, decision: "approved", actor, note, createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO research_approvals(id,program_id,kind,object_id,object_hash,decision,actor,note,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(approval.id, approval.programId, approval.kind, approval.objectId, approval.objectHash, approval.decision, approval.actor, approval.note, JSON.stringify(approval), approval.createdAt);
      this.updateProgram({ ...program, status: "scoped" });
    });
    tx();
    return approval;
  }

  private hasApproval(programId: string, kind: "scope" | "protocol", objectId: string, objectHash: string): boolean {
    const row = this.db.prepare("SELECT 1 ok FROM research_approvals WHERE program_id=? AND kind=? AND object_id=? AND object_hash=? AND decision='approved' ORDER BY created_at DESC LIMIT 1")
      .get(programId, kind, objectId, objectHash) as { ok: number } | undefined;
    return Boolean(row);
  }

  addProtocol(programId: string, input: ProtocolDraft): ResearchProtocol {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const question = this.listQuestions(programId).find((item) => item.status === "selected");
    if (!question) throw new Error("A selected question is required before protocol drafting");
    if (!this.hasApproval(programId, "scope", question.id, question.contentHash)) throw new Error("Scope approval is required before protocol drafting");
    if (!this.assumptionRegisters(programId).some((register) => register.questionId === question.id && register.status === "frozen")) {
      throw new Error("A frozen assumption register is required before protocol drafting");
    }
    if (!this.hypothesisSets(programId).some((set) => set.questionId === question.id && set.status === "frozen")) {
      throw new Error("A frozen hypothesis set is required before protocol drafting");
    }
    const latest = this.db.prepare("SELECT max(version) version FROM research_protocols WHERE program_id=?").get(programId) as { version: number | null };
    const body = { ...input, profile: input.profile ?? program.profile, parentId: input.parentId ?? null };
    const protocol = ResearchProtocolSchema.parse({ ...body, id: `protocol-${randomUUID()}`, programId, questionId: question.id, version: (latest.version ?? 0) + 1, status: "draft", contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO research_protocols(id,program_id,question_id,version,status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(protocol.id, program.id, protocol.questionId, protocol.version, protocol.status, JSON.stringify(protocol), protocol.contentHash, protocol.parentId, protocol.createdAt);
    this.updateProgram({ ...program, status: "protocol_ready" });
    return protocol;
  }

  getProtocol(id: string): ResearchProtocol {
    const row = this.db.prepare("SELECT payload_json FROM research_protocols WHERE id=?").get(id) as ProtocolRow | undefined;
    if (!row) throw new Error(`Unknown research protocol ${id}`);
    return ResearchProtocolSchema.parse(JSON.parse(row.payload_json));
  }

  listProtocols(programId: string): ResearchProtocol[] {
    this.getProgram(programId);
    return (this.db.prepare("SELECT payload_json FROM research_protocols WHERE program_id=? ORDER BY version").all(programId) as ProtocolRow[])
      .map((row) => ResearchProtocolSchema.parse(JSON.parse(row.payload_json)));
  }

  approveProtocol(programId: string, protocolId: string, actor = "researcher", note = ""): Approval {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const protocol = this.getProtocol(protocolId);
    if (protocol.programId !== programId) throw new Error("Protocol does not belong to program");
    if (protocol.status !== "draft") throw new Error(`Protocol is not draft: ${protocol.status}`);
    const approval = ApprovalSchema.parse({ id: `approval-${randomUUID()}`, programId, kind: "protocol", objectId: protocol.id, objectHash: protocol.contentHash, decision: "approved", actor, note, createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO research_approvals(id,program_id,kind,object_id,object_hash,decision,actor,note,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(approval.id, approval.programId, approval.kind, approval.objectId, approval.objectHash, approval.decision, approval.actor, approval.note, JSON.stringify(approval), approval.createdAt);
      const updated = { ...protocol, status: "approved" as const };
      this.db.prepare("UPDATE research_protocols SET status=?,payload_json=? WHERE id=?").run(updated.status, JSON.stringify(updated), updated.id);
      this.updateProgram({ ...program, status: "protocol_ready" });
    });
    tx();
    return approval;
  }

  freezeProtocol(programId: string, protocolId: string, actor = "researcher"): ProtocolFreeze {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const protocol = this.getProtocol(protocolId);
    if (protocol.programId !== programId) throw new Error("Protocol does not belong to program");
    const existing = this.db.prepare("SELECT payload_json FROM protocol_freezes WHERE protocol_id=?").get(protocol.id) as { payload_json: string } | undefined;
    if (existing) throw new Error("Protocol is already frozen; create a new protocol version for changes");
    assertProtocolCanFreeze(protocol, this.hasApproval(programId, "protocol", protocol.id, protocol.contentHash));
    const freeze = ProtocolFreezeSchema.parse({ id: `freeze-${randomUUID()}`, protocolId: protocol.id, contentHash: protocol.contentHash, approvedBy: actor, createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO protocol_freezes(id,protocol_id,content_hash,approved_by,payload_json,created_at) VALUES(?,?,?,?,?,?)")
        .run(freeze.id, freeze.protocolId, freeze.contentHash, freeze.approvedBy, JSON.stringify(freeze), freeze.createdAt);
      const updated = { ...protocol, status: "frozen" as const };
      this.db.prepare("UPDATE research_protocols SET status=?,payload_json=? WHERE id=?").run(updated.status, JSON.stringify(updated), updated.id);
      this.updateProgram({ ...program, status: "frozen" });
    });
    tx();
    return freeze;
  }

  recordDeviation(programId: string, input: DeviationRequest): ProtocolDeviation {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const protocol = this.listProtocols(programId).at(-1);
    if (!protocol || protocol.status !== "frozen") throw new Error("A frozen protocol is required before recording a deviation");
    const deviation = ProtocolDeviationSchema.parse({ ...input, id: `deviation-${randomUUID()}`, protocolId: protocol.id, approved: false, resolution: "pending", approvedBy: null, resolvedBy: null, resolvedAt: null, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO protocol_deviations(id,protocol_id,payload_json,created_at) VALUES(?,?,?,?)").run(deviation.id, deviation.protocolId, JSON.stringify(deviation), deviation.createdAt);
    return deviation;
  }

  approveDeviation(programId: string, deviationId: string, revisedInput: ProtocolDraft, actor = "researcher"): { deviation: ProtocolDeviation; protocol: ResearchProtocol } {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const row = this.db.prepare("SELECT payload_json FROM protocol_deviations WHERE id=?").get(deviationId) as ProgramRow | undefined;
    if (!row) throw new Error(`Unknown protocol deviation ${deviationId}`);
    const deviation = ProtocolDeviationSchema.parse(JSON.parse(row.payload_json));
    const original = this.getProtocol(deviation.protocolId);
    if (original.programId !== programId) throw new Error("Deviation does not belong to program");
    if (original.status !== "frozen") throw new Error("Deviation approval requires the original protocol to remain frozen");
    if (deviation.resolution !== "pending") throw new Error(`Deviation is already ${deviation.resolution}`);
    const latest = this.db.prepare("SELECT max(version) version FROM research_protocols WHERE program_id=?").get(programId) as { version: number | null };
    const body = { ...revisedInput, profile: revisedInput.profile ?? program.profile, parentId: original.id };
    const revised = ResearchProtocolSchema.parse({ ...body, id: `protocol-${randomUUID()}`, programId, questionId: original.questionId, version: (latest.version ?? original.version) + 1, status: "draft", contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    const resolved = ProtocolDeviationSchema.parse({ ...deviation, approved: true, resolution: "approved", approvedBy: actor, resolvedBy: actor, resolvedAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO research_protocols(id,program_id,question_id,version,status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(revised.id, revised.programId, revised.questionId, revised.version, revised.status, JSON.stringify(revised), revised.contentHash, revised.parentId, revised.createdAt);
      this.db.prepare("UPDATE protocol_deviations SET payload_json=? WHERE id=?").run(JSON.stringify(resolved), resolved.id);
      this.updateProgram({ ...program, status: "protocol_ready" });
    });
    tx();
    return { deviation: resolved, protocol: revised };
  }

  rejectDeviation(programId: string, deviationId: string, actor = "researcher"): ProtocolDeviation {
    this.assertProgramMutable(programId);
    const row = this.db.prepare("SELECT payload_json FROM protocol_deviations WHERE id=?").get(deviationId) as ProgramRow | undefined;
    if (!row) throw new Error(`Unknown protocol deviation ${deviationId}`);
    const deviation = ProtocolDeviationSchema.parse(JSON.parse(row.payload_json));
    const protocol = this.getProtocol(deviation.protocolId);
    if (protocol.programId !== programId) throw new Error("Deviation does not belong to program");
    if (deviation.resolution !== "pending") throw new Error(`Deviation is already ${deviation.resolution}`);
    const resolved = ProtocolDeviationSchema.parse({ ...deviation, resolution: "rejected", resolvedBy: actor, resolvedAt: new Date().toISOString() });
    this.db.prepare("UPDATE protocol_deviations SET payload_json=? WHERE id=?").run(JSON.stringify(resolved), resolved.id);
    return resolved;
  }

  recordVisibility(input: Omit<VisibilityEvent, "id" | "observedAt">): VisibilityEvent {
    const program = this.getProgram(input.programId);
    const alreadyObserved = this.visibility(input.programId).some((event) => event.dataRole === "confirmation" || event.dataRole === "test");
    if (input.dataRole === "confirmation" || input.dataRole === "test") {
      const protocol = this.listProtocols(input.programId).at(-1);
      if (!protocol) throw new Error("A protocol is required before confirmation visibility");
      if (this.deviations(input.programId).some((deviation) => deviation.protocolId === protocol.id && deviation.resolution === "pending")) {
        throw new Error("A pending protocol deviation must be resolved before confirmation");
      }
      assertConfirmationAllowed(protocol, alreadyObserved);
    }
    const event = VisibilityEventSchema.parse({ ...input, id: `visibility-${randomUUID()}`, observedAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO research_visibility_events(id,program_id,run_id,data_role,artifact_hash,payload_json,observed_at) VALUES(?,?,?,?,?,?,?)")
        .run(event.id, event.programId, event.runId, event.dataRole, event.artifactHash, JSON.stringify(event), event.observedAt);
      if (event.dataRole === "confirmation" || event.dataRole === "test") this.updateProgram({ ...program, status: "confirmation_observed" });
    });
    tx();
    return event;
  }

  assertExplorationAllowed(programId: string): void {
    if (this.visibility(programId).some((event) => event.dataRole === "confirmation" || event.dataRole === "test")) {
      throw new Error("Exploration is closed after confirmation/test visibility; derive a new run");
    }
  }

  createAssumptionRegister(questionId: string, assumptionIds: string[], parentId: string | null = null): AssumptionRegister {
    const question = this.getQuestion(questionId);
    this.assertProgramMutable(question.programId);
    const assumptions = assumptionIds.map((id) => {
      const row = this.db.prepare("SELECT payload_json FROM research_assumptions WHERE id=? AND question_id=?").get(id, questionId) as ProgramRow | undefined;
      if (!row) throw new Error(`Assumption ${id} does not belong to question ${questionId}`);
      return AssumptionSchema.parse(JSON.parse(row.payload_json));
    });
    if (!assumptions.length) throw new Error("Assumption register requires at least one assumption");
    if (parentId) {
      const parentRow = this.db.prepare("SELECT payload_json FROM research_assumption_registers WHERE id=? AND question_id=?").get(parentId, questionId) as ProgramRow | undefined;
      if (!parentRow) throw new Error("Assumption register parent must belong to the same question");
      if (AssumptionRegisterSchema.parse(JSON.parse(parentRow.payload_json)).status !== "frozen") throw new Error("Assumption register parent must be frozen before superseding");
    }
    const latest = this.db.prepare("SELECT max(version) version FROM research_assumption_registers WHERE question_id=?").get(questionId) as { version: number | null };
    const body = { assumptionIds, parentId };
    const register = AssumptionRegisterSchema.parse({ id: `assumption-register-${randomUUID()}`, questionId, version: (latest.version ?? 0) + 1, status: "draft", ...body, contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      if (parentId) this.db.prepare("UPDATE research_assumption_registers SET status='superseded', payload_json=json_set(payload_json,'$.status','superseded') WHERE id=?").run(parentId);
      this.db.prepare("INSERT INTO research_assumption_registers(id,question_id,version,status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(register.id, register.questionId, register.version, register.status, JSON.stringify(register), register.contentHash, register.parentId, register.createdAt);
    });
    tx();
    return register;
  }

  freezeAssumptionRegister(questionId: string, registerId: string): AssumptionRegister {
    const question = this.getQuestion(questionId);
    this.assertProgramMutable(question.programId);
    const row = this.db.prepare("SELECT payload_json FROM research_assumption_registers WHERE id=? AND question_id=?").get(registerId, questionId) as ProgramRow | undefined;
    if (!row) throw new Error("Assumption register does not belong to question");
    const register = AssumptionRegisterSchema.parse(JSON.parse(row.payload_json));
    assertAggregateCanFreeze(register.status);
    const frozen = { ...register, status: "frozen" as const };
    this.db.prepare("UPDATE research_assumption_registers SET status=?,payload_json=? WHERE id=?").run(frozen.status, JSON.stringify(frozen), frozen.id);
    return frozen;
  }

  createHypothesisSet(programId: string, input: HypothesisSetDraft): HypothesisSet {
    const program = this.getProgram(programId);
    this.assertProgramMutable(programId);
    const question = this.listQuestions(programId).find((item) => item.status === "selected");
    if (!question) throw new Error("A selected question is required before creating a hypothesis set");
    if (!this.hasApproval(programId, "scope", question.id, question.contentHash)) throw new Error("Scope approval is required before creating a hypothesis set");
    const hypotheses = input.hypotheses.map((item) => ({ ...item, id: `hypothesis-${randomUUID()}` }));
    if (!hypotheses.some((item) => item.kind === "target")) throw new Error("Hypothesis set requires a target hypothesis");
    if (!hypotheses.some((item) => item.kind !== "target")) throw new Error("Hypothesis set requires a null or rival hypothesis");
    if (input.parentId) {
      const parentRow = this.db.prepare("SELECT payload_json FROM research_hypothesis_sets WHERE id=? AND program_id=? AND question_id=?").get(input.parentId, programId, question.id) as ProgramRow | undefined;
      if (!parentRow) throw new Error("Hypothesis set parent must belong to the same program and question");
      if (HypothesisSetSchema.parse(JSON.parse(parentRow.payload_json)).status !== "frozen") throw new Error("Hypothesis set parent must be frozen before superseding");
    }
    const latest = this.db.prepare("SELECT max(version) version FROM research_hypothesis_sets WHERE program_id=?").get(programId) as { version: number | null };
    const body = { hypotheses, parentId: input.parentId ?? null };
    const set = HypothesisSetSchema.parse({ id: `hypothesis-set-${randomUUID()}`, programId, questionId: question.id, version: (latest.version ?? 0) + 1, status: "draft", ...body, contentHash: hashPayload(body), createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      if (input.parentId) this.db.prepare("UPDATE research_hypothesis_sets SET status='superseded', payload_json=json_set(payload_json,'$.status','superseded') WHERE id=?").run(input.parentId);
      this.db.prepare("INSERT INTO research_hypothesis_sets(id,program_id,question_id,version,status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(set.id, set.programId, set.questionId, set.version, set.status, JSON.stringify(set), set.contentHash, set.parentId, set.createdAt);
    });
    tx();
    return set;
  }

  freezeHypothesisSet(programId: string, setId: string): HypothesisSet {
    this.assertProgramMutable(programId);
    const row = this.db.prepare("SELECT payload_json FROM research_hypothesis_sets WHERE id=? AND program_id=?").get(setId, programId) as ProgramRow | undefined;
    if (!row) throw new Error("Hypothesis set does not belong to program");
    const set = HypothesisSetSchema.parse(JSON.parse(row.payload_json));
    assertAggregateCanFreeze(set.status);
    const frozen = { ...set, status: "frozen" as const };
    this.db.prepare("UPDATE research_hypothesis_sets SET status=?,payload_json=? WHERE id=?").run(frozen.status, JSON.stringify(frozen), frozen.id);
    return frozen;
  }

  deriveProgram(parentProgramId: string, reason: string, actor = "researcher", observedData: string[] = []): { program: ResearchProgram; derivation: RunDerivation } {
    const parent = this.getProgram(parentProgramId);
    const derivedCount = (this.db.prepare("SELECT count(*) n FROM research_run_derivations WHERE parent_program_id=?").get(parent.id) as { n: number }).n;
    if (derivedCount >= this.maxDerivedRuns) throw new Error(`Derived run limit reached: ${this.maxDerivedRuns}`);
    const child = this.createProgram({ ...parent, title: `${parent.title} (derived)`, id: undefined, status: undefined, contentHash: undefined, derivedFromId: undefined, createdAt: undefined, updatedAt: undefined }, parent.id);
    const derivation = RunDerivationSchema.parse({ id: `derivation-${randomUUID()}`, parentProgramId: parent.id, childProgramId: child.id, reason, observedData, actor, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO research_run_derivations(id,parent_program_id,child_program_id,payload_json,created_at) VALUES(?,?,?,?,?)")
      .run(derivation.id, derivation.parentProgramId, derivation.childProgramId, JSON.stringify(derivation), derivation.createdAt);
    return { program: child, derivation };
  }

  approvals(programId: string): Approval[] {
    return (this.db.prepare("SELECT payload_json FROM research_approvals WHERE program_id=? ORDER BY created_at").all(programId) as ProgramRow[])
      .map((row) => ApprovalSchema.parse(JSON.parse(row.payload_json)));
  }

  assumptions(programId: string): Assumption[] {
    const questionIds = this.listQuestions(programId).map((question) => question.id);
    if (!questionIds.length) return [];
    const placeholders = questionIds.map(() => "?").join(",");
    return (this.db.prepare(`SELECT payload_json FROM research_assumptions WHERE question_id IN (${placeholders}) ORDER BY created_at`).all(...questionIds) as ProgramRow[])
      .map((row) => AssumptionSchema.parse(JSON.parse(row.payload_json)));
  }

  assumptionRegisters(programId: string): AssumptionRegister[] {
    const questionIds = this.listQuestions(programId).map((question) => question.id);
    if (!questionIds.length) return [];
    const placeholders = questionIds.map(() => "?").join(",");
    return (this.db.prepare(`SELECT payload_json FROM research_assumption_registers WHERE question_id IN (${placeholders}) ORDER BY version`).all(...questionIds) as ProgramRow[])
      .map((row) => AssumptionRegisterSchema.parse(JSON.parse(row.payload_json)));
  }

  hypothesisSets(programId: string): HypothesisSet[] {
    this.getProgram(programId);
    return (this.db.prepare("SELECT payload_json FROM research_hypothesis_sets WHERE program_id=? ORDER BY version").all(programId) as ProgramRow[])
      .map((row) => HypothesisSetSchema.parse(JSON.parse(row.payload_json)));
  }

  freezes(programId: string): ProtocolFreeze[] {
    const protocols = this.listProtocols(programId);
    if (!protocols.length) return [];
    const placeholders = protocols.map(() => "?").join(",");
    return (this.db.prepare(`SELECT payload_json FROM protocol_freezes WHERE protocol_id IN (${placeholders}) ORDER BY created_at`).all(...protocols.map((protocol) => protocol.id)) as ProgramRow[])
      .map((row) => ProtocolFreezeSchema.parse(JSON.parse(row.payload_json)));
  }

  deviations(programId: string): ProtocolDeviation[] {
    const protocols = this.listProtocols(programId);
    if (!protocols.length) return [];
    const placeholders = protocols.map(() => "?").join(",");
    return (this.db.prepare(`SELECT payload_json FROM protocol_deviations WHERE protocol_id IN (${placeholders}) ORDER BY created_at`).all(...protocols.map((protocol) => protocol.id)) as ProgramRow[])
      .map((row) => ProtocolDeviationSchema.parse(JSON.parse(row.payload_json)));
  }

  derivations(programId: string): RunDerivation[] {
    return (this.db.prepare("SELECT payload_json FROM research_run_derivations WHERE parent_program_id=? OR child_program_id=? ORDER BY created_at").all(programId, programId) as ProgramRow[])
      .map((row) => RunDerivationSchema.parse(JSON.parse(row.payload_json)));
  }

  visibility(programId: string): VisibilityEvent[] {
    return (this.db.prepare("SELECT payload_json FROM research_visibility_events WHERE program_id=? ORDER BY observed_at").all(programId) as ProgramRow[])
      .map((row) => VisibilityEventSchema.parse(JSON.parse(row.payload_json)));
  }

  status(programId: string): ResearchStatus {
    return {
      program: this.getProgram(programId),
      questions: this.listQuestions(programId),
      assumptions: this.assumptions(programId),
      assumptionRegisters: this.assumptionRegisters(programId),
      hypothesisSets: this.hypothesisSets(programId),
      protocols: this.listProtocols(programId),
      approvals: this.approvals(programId),
      freezes: this.freezes(programId),
      deviations: this.deviations(programId),
      derivations: this.derivations(programId),
      visibility: this.visibility(programId),
    };
  }

  counts(): Record<string, number> {
    const count = (table: string) => (this.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
    return {
      programs: count("research_programs"), questions: count("research_questions"), assumptions: count("research_assumptions"),
      assumptionRegisters: count("research_assumption_registers"), hypothesisSets: count("research_hypothesis_sets"),
      protocols: count("research_protocols"), approvals: count("research_approvals"), freezes: count("protocol_freezes"),
      deviations: count("protocol_deviations"), derivations: count("research_run_derivations"), visibility: count("research_visibility_events"),
    };
  }
}
