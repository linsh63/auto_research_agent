import { createHash } from "node:crypto";
import { WorkflowCoordinator } from "../application/workflow-coordinator.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import {
  PUBLIC_SCHEMA_VERSION, CommandResultSchema, ProjectStatusReadModelSchema, PublicCommandSchema,
  PublicQuerySchema, QueryResultSchema,
  type CommandResult, type ProjectStatusReadModel, type PublicCommand, type PublicQuery, type QueryResult,
} from "./contracts.js";
import { assertCommandContext, assertQueryContext, PublicKernelError, toPublicError } from "./kernel.js";

export interface ResearchApplicationOptions {
  databasePath: string;
  maxDerivedRuns?: number;
  /** Explicit compatibility bindings for projects created before Workspace persistence exists. */
  workspaceBindings?: Record<string, string>;
}

export class ResearchApplication {
  private readonly workflow: WorkflowCoordinator;
  private readonly idempotency = new Map<string, { commandHash: string; result: CommandResult }>();
  private readonly workspaceByProject = new Map<string, string>();
  private constructor(private readonly store: ResearchStore, bindings: Record<string, string>) {
    this.workflow = new WorkflowCoordinator(store);
    for (const [projectId, workspaceId] of Object.entries(bindings)) {
      if (!projectId || !workspaceId) throw new PublicKernelError("INVALID_COMMAND", "Workspace compatibility bindings require non-empty IDs", false);
      this.workspaceByProject.set(projectId, workspaceId);
    }
  }

  static async open(options: ResearchApplicationOptions): Promise<ResearchApplication> {
    const store = await ResearchStore.open(options.databasePath, { maxDerivedRuns: options.maxDerivedRuns });
    return new ResearchApplication(store, options.workspaceBindings ?? {});
  }

  close(): void { this.store.close(); }

  async execute(input: unknown): Promise<CommandResult> {
    const parsed = PublicCommandSchema.safeParse(input);
    if (!parsed.success) return this.rejectedCommand(input, parsed.error);
    const command = parsed.data;
    const key = `${command.workspaceId}:${command.projectId ?? "create"}:${command.idempotencyKey}`;
    const commandHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const prior = this.idempotency.get(key);
    if (prior) return prior.commandHash === commandHash ? prior.result : this.reject(command,
      new PublicKernelError("CONFLICT", "Idempotency key was already used for a different command", false));
    let result: CommandResult;
    try {
      assertCommandContext(command);
      if (command.type !== "project.create") this.assertWorkspace(command.workspaceId, command.projectId);
      result = this.accept(command, this.dispatch(command));
    } catch (error) {
      result = this.reject(command, error);
    }
    this.idempotency.set(key, { commandHash, result });
    return result;
  }

  async query(input: unknown): Promise<QueryResult> {
    const parsed = PublicQuerySchema.safeParse(input);
    if (!parsed.success) return this.rejectedQuery(input, parsed.error);
    const query = parsed.data;
    try {
      assertQueryContext(query);
      this.assertWorkspace(query.workspaceId, query.projectId);
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "ok", data: this.projectStatus(query), error: null, handledAt: new Date().toISOString() });
    } catch (error) {
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "rejected", data: null, error: toPublicError(error), handledAt: new Date().toISOString() });
    }
  }

  private dispatch(command: PublicCommand): unknown {
    if (command.type === "project.create") {
      const program = this.workflow.createIntent(command.payload.intent);
      this.workspaceByProject.set(program.id, command.workspaceId);
      return { project: this.projectSummary(program), workspaceId: command.workspaceId };
    }
    if (command.type === "question.propose") {
      const question = this.workflow.proposeQuestion(command.projectId, command.payload.question);
      return { question: { id: question.id, version: question.version, status: question.status, question: question.question } };
    }
    if (command.type === "question.select") {
      const question = this.workflow.selectQuestion(command.projectId, command.payload.questionId);
      return { question: { id: question.id, version: question.version, status: question.status, question: question.question } };
    }
    const approval = this.workflow.approveScope(command.projectId, command.actor.id, command.payload.note);
    return { approval: { id: approval.id, kind: approval.kind, decision: approval.decision, actor: approval.actor, createdAt: approval.createdAt } };
  }

  private projectStatus(query: PublicQuery): ProjectStatusReadModel {
    const status = this.workflow.status(query.projectId);
    return ProjectStatusReadModelSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, workspaceId: query.workspaceId,
      project: this.projectSummary(status.program),
      questions: status.questions.map(item => ({ id: item.id, version: item.version, status: item.status, question: item.question })),
      counts: { assumptions: status.assumptions.length, hypothesisSets: status.hypothesisSets.length, protocols: status.protocols.length,
        approvals: status.approvals.length, deviations: status.deviations.length, derivations: status.derivations.length },
      confirmationObserved: status.visibility.some(item => item.dataRole === "confirmation" || item.dataRole === "test"),
    });
  }

  private projectSummary(program: ReturnType<ResearchStore["getProgram"]>) {
    return { id: program.id, title: program.title, direction: program.direction, domain: program.domain, profile: program.profile,
      status: program.status, updatedAt: program.updatedAt };
  }

  private assertWorkspace(workspaceId: string, projectId: string): void {
    const bound = this.workspaceByProject.get(projectId);
    if (!bound) throw new PublicKernelError("NOT_FOUND", `Project ${projectId} is not registered in the public application`, false);
    if (bound !== workspaceId) throw new PublicKernelError("FORBIDDEN", "Project does not belong to this workspace", false);
  }

  private accept(command: PublicCommand, data: unknown): CommandResult {
    const projectId = command.type === "project.create" ? (data as { project: { id: string } }).project.id : command.projectId;
    return CommandResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: command.commandId, workspaceId: command.workspaceId,
      projectId, status: "accepted", data, error: null, eventIds: [], handledAt: new Date().toISOString() });
  }

  private reject(command: PublicCommand, error: unknown): CommandResult {
    return CommandResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: command.commandId, workspaceId: command.workspaceId,
      projectId: command.projectId, status: "rejected", data: null, error: toPublicError(error), eventIds: [], handledAt: new Date().toISOString() });
  }

  private rejectedCommand(input: unknown, error: unknown): CommandResult {
    const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const publicError = raw.schemaVersion !== undefined && raw.schemaVersion !== PUBLIC_SCHEMA_VERSION
      ? new PublicKernelError("INCOMPATIBLE_VERSION", `Unsupported public schema version: ${String(raw.schemaVersion)}`, false)
      : error;
    return CommandResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: typeof raw.commandId === "string" && raw.commandId ? raw.commandId : "invalid",
      workspaceId: typeof raw.workspaceId === "string" && raw.workspaceId ? raw.workspaceId : null,
      projectId: typeof raw.projectId === "string" && raw.projectId ? raw.projectId : null,
      status: "rejected", data: null, error: toPublicError(publicError), eventIds: [], handledAt: new Date().toISOString() });
  }

  private rejectedQuery(input: unknown, error: unknown): QueryResult {
    const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const publicError = raw.schemaVersion !== undefined && raw.schemaVersion !== PUBLIC_SCHEMA_VERSION
      ? new PublicKernelError("INCOMPATIBLE_VERSION", `Unsupported public schema version: ${String(raw.schemaVersion)}`, false)
      : error;
    return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: typeof raw.queryId === "string" && raw.queryId ? raw.queryId : "invalid",
      workspaceId: typeof raw.workspaceId === "string" && raw.workspaceId ? raw.workspaceId : null,
      projectId: typeof raw.projectId === "string" && raw.projectId ? raw.projectId : null,
      status: "rejected", data: null, error: toPublicError(publicError), handledAt: new Date().toISOString() });
  }
}
