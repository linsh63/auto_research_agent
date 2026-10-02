import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CandidateSetSchema, ConversationMessageSchema, ConversationReadModelSchema, ConversationSessionSchema,
  DEFAULT_EXECUTION_POLICY, ExecutionPolicySchema, ResearchActionSchema,
  type CandidateSet, type ConversationMessage, type ConversationReadModel, type ConversationSession,
  type ExecutionPolicy, type ResearchAction,
} from "../../domain/interaction.js";
import { applyMigrationTransaction, snapshotArtifactManifest } from "./research-store.js";
import { readMigration } from "./migration-path.js";

interface JsonRow { payload_json: string }

export class InteractionStore {
  private constructor(private readonly db: Database.Database, readonly migrationBackupPath: string | null, readonly artifactManifestSnapshotPath: string | null) {}

  static async open(path: string): Promise<InteractionStore> {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON");
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version < 11) { db.close(); throw new Error("Research interactions require schema version 11 before migration"); }
    if (version > 16) { db.close(); throw new Error(`Interaction database ${version} is newer than supported version 16`); }
    let backup: string | null = null, manifest: string | null = null;
    if (version === 11) {
      const backupDir = resolve(dirname(path), "backups"); mkdirSync(backupDir, { recursive: true });
      backup = resolve(backupDir, `research-before-011-${new Date().toISOString().replaceAll(":", "-")}.db`);
      await db.backup(backup); manifest = snapshotArtifactManifest(path, backupDir, "011");
      try { applyMigrationTransaction(db, readMigration("011_research_interactions.sql")); }
      catch (error) { db.close(); throw error; }
    }
    return new InteractionStore(db, backup, manifest);
  }

  close(): void { this.db.close(); }

  policy(workspaceId: string, projectId: string): ExecutionPolicy {
    this.assertProject(workspaceId, projectId);
    const row = this.db.prepare("SELECT payload_json FROM execution_policies_v15 WHERE project_id=?").get(projectId) as JsonRow | undefined;
    return row ? ExecutionPolicySchema.parse(JSON.parse(row.payload_json)) : { ...DEFAULT_EXECUTION_POLICY };
  }

  setPolicy(workspaceId: string, projectId: string, input: Omit<ExecutionPolicy, "updatedAt">): ExecutionPolicy {
    this.assertProject(workspaceId, projectId);
    const policy = ExecutionPolicySchema.parse({ ...input, updatedAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO execution_policies_v15(project_id,workspace_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET workspace_id=excluded.workspace_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at")
      .run(projectId, workspaceId, JSON.stringify(policy), policy.updatedAt);
    return policy;
  }

  openSession(input: { workspaceId: string; projectId: string; sessionId?: string | null; title?: string }): ConversationSession {
    this.assertProject(input.workspaceId, input.projectId);
    if (input.sessionId) {
      const existing = this.session(input.workspaceId, input.projectId, input.sessionId);
      if (existing.status !== "active") throw new Error(`Conversation session ${input.sessionId} is closed`);
      return existing;
    }
    const now = new Date().toISOString();
    const session = ConversationSessionSchema.parse({ id: `session-${randomUUID()}`, workspaceId: input.workspaceId, projectId: input.projectId, title: input.title?.trim() || "Research conversation", status: "active", createdAt: now, updatedAt: now });
    this.db.prepare("INSERT INTO conversation_sessions_v15(id,workspace_id,project_id,title,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(session.id, session.workspaceId, session.projectId, session.title, session.status, JSON.stringify(session), session.createdAt, session.updatedAt);
    return session;
  }

  session(workspaceId: string, projectId: string, sessionId: string): ConversationSession {
    const row = this.db.prepare("SELECT payload_json FROM conversation_sessions_v15 WHERE id=?").get(sessionId) as JsonRow | undefined;
    if (!row) throw new Error(`Unknown conversation session ${sessionId}`);
    const session = ConversationSessionSchema.parse(JSON.parse(row.payload_json));
    if (session.workspaceId !== workspaceId || session.projectId !== projectId) throw new Error("Conversation session does not belong to this project and workspace");
    return session;
  }

  appendMessage(session: ConversationSession, role: "user" | "assistant", content: string): ConversationMessage {
    const transaction = this.db.transaction(() => {
      const sequence = (this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next FROM conversation_messages_v15 WHERE session_id=?").get(session.id) as { next: number }).next;
      const message = ConversationMessageSchema.parse({ id: `message-${randomUUID()}`, sessionId: session.id, sequence, role, content, createdAt: new Date().toISOString() });
      this.db.prepare("INSERT INTO conversation_messages_v15(id,session_id,sequence,role,content,payload_json,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(message.id, message.sessionId, message.sequence, message.role, message.content, JSON.stringify(message), message.createdAt);
      const updated = { ...session, updatedAt: message.createdAt };
      this.db.prepare("UPDATE conversation_sessions_v15 SET payload_json=?,updated_at=? WHERE id=?").run(JSON.stringify(updated), message.createdAt, session.id);
      return message;
    });
    return transaction();
  }

  messages(workspaceId: string, projectId: string, sessionId: string): ConversationMessage[] {
    this.session(workspaceId, projectId, sessionId);
    return (this.db.prepare("SELECT payload_json FROM conversation_messages_v15 WHERE session_id=? ORDER BY sequence").all(sessionId) as JsonRow[])
      .map(row => ConversationMessageSchema.parse(JSON.parse(row.payload_json)));
  }

  saveCandidates(input: Omit<CandidateSet, "id" | "status" | "createdAt" | "consumedAt" | "freeInputAllowed">): CandidateSet {
    const session = this.session(input.workspaceId, input.projectId, input.sessionId);
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE candidate_sets_v15 SET status='superseded',payload_json=json_set(payload_json,'$.status','superseded') WHERE session_id=? AND status='open'").run(session.id);
      const set = CandidateSetSchema.parse({ ...input, id: `candidates-${randomUUID()}`, status: "open", freeInputAllowed: true, createdAt: new Date().toISOString(), consumedAt: null });
      this.db.prepare("INSERT INTO candidate_sets_v15(id,workspace_id,project_id,session_id,status,payload_json,created_at,consumed_at) VALUES(?,?,?,?,?,?,?,NULL)")
        .run(set.id, set.workspaceId, set.projectId, set.sessionId, set.status, JSON.stringify(set), set.createdAt);
      return set;
    });
    return transaction();
  }

  candidateSet(workspaceId: string, projectId: string, sessionId: string, candidateSetId: string): CandidateSet {
    this.session(workspaceId, projectId, sessionId);
    const row = this.db.prepare("SELECT payload_json FROM candidate_sets_v15 WHERE id=?").get(candidateSetId) as JsonRow | undefined;
    if (!row) throw new Error(`Unknown candidate set ${candidateSetId}`);
    const set = CandidateSetSchema.parse(JSON.parse(row.payload_json));
    if (set.workspaceId !== workspaceId || set.projectId !== projectId || set.sessionId !== sessionId) throw new Error("Candidate set does not belong to this conversation");
    return set;
  }

  latestCandidates(workspaceId: string, projectId: string, sessionId: string): CandidateSet | null {
    this.session(workspaceId, projectId, sessionId);
    const row = this.db.prepare("SELECT payload_json FROM candidate_sets_v15 WHERE session_id=? ORDER BY created_at DESC LIMIT 1").get(sessionId) as JsonRow | undefined;
    return row ? CandidateSetSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  consumeCandidateSet(set: CandidateSet): CandidateSet {
    if (set.status !== "open") throw new Error(`Candidate set ${set.id} is already ${set.status}`);
    const consumed = CandidateSetSchema.parse({ ...set, status: "consumed", consumedAt: new Date().toISOString() });
    const result = this.db.prepare("UPDATE candidate_sets_v15 SET status='consumed',payload_json=?,consumed_at=? WHERE id=? AND status='open'").run(JSON.stringify(consumed), consumed.consumedAt, set.id);
    if (result.changes !== 1) throw new Error(`Candidate set ${set.id} was consumed concurrently`);
    return consumed;
  }

  recordAction(input: { workspaceId: string; projectId: string; sessionId?: string | null; candidateSetId?: string | null; source: "api" | "chat" | "candidate"; action: ResearchAction; status: "proposed" | "accepted" | "rejected"; result?: unknown }): void {
    this.assertProject(input.workspaceId, input.projectId); ResearchActionSchema.parse(input.action);
    const now = new Date().toISOString();
    const existing=this.db.prepare("SELECT workspace_id,project_id,payload_json FROM research_actions_v15 WHERE id=?").get(input.action.id) as {workspace_id:string;project_id:string;payload_json:string}|undefined;
    if(existing){
      if(existing.workspace_id!==input.workspaceId||existing.project_id!==input.projectId||existing.payload_json!==JSON.stringify(input.action))throw new Error(`Research action ID ${input.action.id} conflicts with another action`);
      this.db.prepare("UPDATE research_actions_v15 SET status=?,result_json=?,completed_at=? WHERE id=?").run(input.status,input.result===undefined?null:JSON.stringify(input.result),input.status==="proposed"?null:now,input.action.id);
      return;
    }
    this.db.prepare("INSERT INTO research_actions_v15(id,workspace_id,project_id,session_id,candidate_set_id,source,status,payload_json,result_json,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(input.action.id,input.workspaceId,input.projectId,input.sessionId??null,input.candidateSetId??null,input.source,input.status,JSON.stringify(input.action),input.result===undefined?null:JSON.stringify(input.result),now,input.status==="proposed"?null:now);
  }

  conversation(workspaceId: string, projectId: string, sessionId: string): ConversationReadModel {
    return ConversationReadModelSchema.parse({ session: this.session(workspaceId, projectId, sessionId), messages: this.messages(workspaceId, projectId, sessionId), latestCandidates: this.latestCandidates(workspaceId, projectId, sessionId), policy: this.policy(workspaceId, projectId) });
  }

  private assertProject(workspaceId: string, projectId: string): void {
    const row = this.db.prepare("SELECT workspace_id FROM research_projects_v15 WHERE id=?").get(projectId) as { workspace_id: string } | undefined;
    if (!row) throw new Error(`Unknown project ${projectId}`);
    if (row.workspace_id !== workspaceId) throw new Error("Project does not belong to this workspace");
  }
}
