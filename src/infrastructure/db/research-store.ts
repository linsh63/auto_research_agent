import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ApprovalSchema, AssumptionSchema, ProtocolDeviationSchema, ProtocolFreezeSchema,
  ProtocolStatusSchema, ResearchIntentSchema, ResearchProgramSchema, ResearchProtocolSchema,
  ResearchQuestionSchema, ResearchProfileSchema, RunDerivationSchema, VisibilityEventSchema,
  type Approval, type Assumption, type ProtocolDeviation, type ProtocolFreeze,
  type ResearchIntent, type ResearchProgram, type ResearchProtocol, type ResearchQuestion,
  type ResearchProfile, type RunDerivation, type VisibilityEvent,
  assertConfirmationAllowed, assertProtocolCanFreeze, hashPayload,
} from "../../domain/research.js";

export type QuestionDraft = Omit<ResearchQuestion, "id" | "programId" | "version" | "status" | "contentHash" | "supersedesId" | "createdAt"> & { supersedesId?: string | null };
export type ProtocolDraft = Omit<ResearchProtocol, "id" | "programId" | "questionId" | "version" | "profile" | "status" | "contentHash" | "parentId" | "createdAt"> & { profile?: ResearchProfile; parentId?: string | null };

interface ProgramRow { payload_json: string }
interface QuestionRow { payload_json: string }
interface ProtocolRow { payload_json: string }

export interface ResearchStatus {
  program: ResearchProgram;
  questions: ResearchQuestion[];
  assumptions: Assumption[];
  protocols: ResearchProtocol[];
  approvals: Approval[];
  freezes: ProtocolFreeze[];
  deviations: ProtocolDeviation[];
  derivations: RunDerivation[];
  visibility: VisibilityEvent[];
}

export class ResearchStore {
  private readonly db: Database.Database;
  private readonly backupPath: string | null;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.backupPath = this.migrate();
  }

  close(): void { this.db.close(); }

  migrationBackupPath(): string | null { return this.backupPath; }

  private migrate(): string | null {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version > 3) throw new Error(`Research database ${version} is newer than supported version 3`);
    if (version >= 3) return null;
    let backup: string | null = null;
    if (existsSync(this.path)) {
      try { this.db.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* A busy WAL is still copied and reported by verification. */ }
      const backupDir = resolve(dirname(this.path), "backups");
      mkdirSync(backupDir, { recursive: true });
      backup = resolve(backupDir, `research-before-003-${new Date().toISOString().replaceAll(":", "-")}.db`);
      copyFileSync(this.path, backup);
    }
    const migration = readFileSync(resolve("migrations/003_research_protocol.sql"), "utf8");
    this.db.exec(migration);
    const migrated = this.db.pragma("user_version", { simple: true }) as number;
    if (migrated !== 3) throw new Error(`Research migration 003 did not reach schema version 3 (got ${migrated})`);
    return backup;
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

  addQuestion(programId: string, input: QuestionDraft): ResearchQuestion {
    const program = this.getProgram(programId);
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
    this.getQuestion(questionId);
    const assumption = AssumptionSchema.parse({ ...input, id: `assumption-${randomUUID()}`, questionId, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO research_assumptions(id,question_id,payload_json,created_at) VALUES(?,?,?,?)")
      .run(assumption.id, assumption.questionId, JSON.stringify(assumption), assumption.createdAt);
    return assumption;
  }

  approveScope(programId: string, actor = "researcher", note = ""): Approval {
    const program = this.getProgram(programId);
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
    const question = this.listQuestions(programId).find((item) => item.status === "selected");
    if (!question) throw new Error("A selected question is required before protocol drafting");
    if (!this.hasApproval(programId, "scope", question.id, question.contentHash)) throw new Error("Scope approval is required before protocol drafting");
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

  recordDeviation(programId: string, input: Omit<ProtocolDeviation, "id" | "protocolId" | "createdAt">): ProtocolDeviation {
    const program = this.getProgram(programId);
    const protocol = this.listProtocols(programId).at(-1);
    if (!protocol || (protocol.status !== "frozen" && protocol.status !== "deviated")) throw new Error("A frozen protocol is required before recording a deviation");
    const deviation = ProtocolDeviationSchema.parse({ ...input, id: `deviation-${randomUUID()}`, protocolId: protocol.id, createdAt: new Date().toISOString() });
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO protocol_deviations(id,protocol_id,payload_json,created_at) VALUES(?,?,?,?)").run(deviation.id, deviation.protocolId, JSON.stringify(deviation), deviation.createdAt);
      const updated = { ...protocol, status: "deviated" as const };
      this.db.prepare("UPDATE research_protocols SET status=?,payload_json=? WHERE id=?").run(updated.status, JSON.stringify(updated), updated.id);
      this.updateProgram({ ...program, status: "frozen" });
    });
    tx();
    return deviation;
  }

  recordVisibility(input: Omit<VisibilityEvent, "id" | "observedAt">): VisibilityEvent {
    const program = this.getProgram(input.programId);
    const alreadyObserved = this.visibility(input.programId).some((event) => event.dataRole === input.dataRole);
    if (input.dataRole === "confirmation" || input.dataRole === "test") {
      const protocol = this.listProtocols(input.programId).at(-1);
      if (!protocol) throw new Error("A protocol is required before confirmation visibility");
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

  deriveProgram(parentProgramId: string, reason: string, actor = "researcher", observedData: string[] = []): { program: ResearchProgram; derivation: RunDerivation } {
    const parent = this.getProgram(parentProgramId);
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
      protocols: count("research_protocols"), approvals: count("research_approvals"), freezes: count("protocol_freezes"),
      deviations: count("protocol_deviations"), derivations: count("research_run_derivations"), visibility: count("research_visibility_events"),
    };
  }
}
