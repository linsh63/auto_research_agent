import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { PublicApplicationBackend } from "../application/public-application-backend.js";
import {
  PUBLIC_SCHEMA_VERSION, CommandResultSchema, ProjectStatusReadModelSchema, PublicCommandSchema,
  ProjectEventListSchema, PublicProjectBundleSchema, PublicQuerySchema, QueryResultSchema,
  type Actor, type CommandResult, type ProjectStatusReadModel, type PublicCommand, type PublicProjectBundle, type PublicQuery, type QueryResult,
} from "./contracts.js";
import { assertCommandContext, assertQueryContext, PublicKernelError, toPublicError } from "./kernel.js";

export interface ResearchApplicationOptions {
  databasePath: string;
  maxDerivedRuns?: number;
  /** Explicit compatibility bindings for projects created before Workspace persistence exists. */
  workspaceBindings?: Record<string, string>;
}

export class ResearchApplication {
  private constructor(private readonly backend: PublicApplicationBackend) {}

  static async open(options: ResearchApplicationOptions): Promise<ResearchApplication> {
    const backend=await PublicApplicationBackend.open(options.databasePath,{maxDerivedRuns:options.maxDerivedRuns});
    try{for(const[projectId,workspaceId]of Object.entries(options.workspaceBindings??{}))backend.projects.adoptLegacyProject({projectId,workspaceId,actor:{id:"system:compatibility",kind:"system",displayName:"Compatibility importer"},schemaVersion:PUBLIC_SCHEMA_VERSION});return new ResearchApplication(backend);}catch(error){backend.close();throw error;}
  }

  close(): void { this.backend.close(); }

  async execute(input: unknown): Promise<CommandResult> {
    const parsed = PublicCommandSchema.safeParse(input);
    if (!parsed.success) return this.rejectedCommand(input, parsed.error);
    const command = parsed.data;
    const commandHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    let prepared;
    try{prepared=this.backend.projects.prepareCommand({workspaceId:command.workspaceId,projectId:command.projectId,commandId:command.commandId,idempotencyKey:command.idempotencyKey,commandHash,actor:command.actor});}
    catch(error){return this.reject(command,error);}
    if(prepared.kind==="replay")return CommandResultSchema.parse(prepared.receipt.result);
    try{assertCommandContext(command);}catch(error){const result=this.reject(command,error);this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result});return result;}
    let data:unknown;
    try{data=this.dispatch(command);}catch(error){const eventId=command.projectId?`event-${randomUUID()}`:null,result=this.reject(command,error,eventId?[eventId]:[]);this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result,event:eventId?{eventId,type:"command.rejected",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{commandType:command.type,error:result.error}}:undefined});return result;}
    const eventIds=command.type==="project.fork"?[`event-${randomUUID()}`,`event-${randomUUID()}`]:command.type==="project.import"?[(data as any).importEventId]:[`event-${randomUUID()}`],result=this.accept(command,data,eventIds);
    try{
      if(command.type==="project.create")this.backend.projects.completeProjectCreation({receipt:prepared.receipt,projectId:result.projectId!,branchName:"main",researchStatus:"draft",result,event:{eventId:eventIds[0]!,type:"project.created",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{intent:command.payload.intent,project:(data as any).project,projectionPatch:{researchStatus:"draft"}},projectionPatch:{researchStatus:"draft"}}});
      else if(command.type==="project.fork"){const child=(data as any).project;this.backend.projects.completeFork({receipt:prepared.receipt,childProjectId:child.id,branchName:command.payload.branchName,researchStatus:child.status,result,parentEvent:{eventId:eventIds[0]!,type:"branch.created",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{childProjectId:child.id,branchName:command.payload.branchName}},childEvent:{eventId:eventIds[1]!,type:"project.forked",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{parentProjectId:command.projectId,branchName:command.payload.branchName,reason:command.payload.reason,projectionPatch:{researchStatus:child.status}},projectionPatch:{researchStatus:child.status}}});}
      else if(command.type==="project.import")this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result});
      else this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result,event:{eventId:eventIds[0]!,type:this.eventType(command),schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{commandType:command.type,data,projectionPatch:command.type==="scope.approve"?{researchStatus:"scoped"}:undefined},projectionPatch:command.type==="scope.approve"?{researchStatus:"scoped"}:undefined}});
      return result;
    }catch(error){return this.reject(command,new PublicKernelError("CONFLICT",`Command ${command.commandId} is in doubt after domain mutation`,false,{cause:error instanceof Error?error.message:String(error)}));}
  }

  async query(input: unknown): Promise<QueryResult> {
    const parsed = PublicQuerySchema.safeParse(input);
    if (!parsed.success) return this.rejectedQuery(input, parsed.error);
    const query = parsed.data;
    try {
      assertQueryContext(query);
      const project=this.backend.projects.project(query.projectId);if(!project)throw new PublicKernelError("NOT_FOUND",`Unknown project ${query.projectId}`,false);if(project.workspaceId!==query.workspaceId)throw new PublicKernelError("FORBIDDEN","Project does not belong to this workspace",false);
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "ok", data: this.queryData(query), error: null, handledAt: new Date().toISOString() });
    } catch (error) {
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "rejected", data: null, error: toPublicError(error), handledAt: new Date().toISOString() });
    }
  }

  private dispatch(command: PublicCommand): unknown {
    if (command.type === "project.create") {
      const program = this.backend.workflow.createIntent(command.payload.intent);
      return { project: this.projectSummary(program), workspaceId: command.workspaceId };
    }
    if (command.type === "question.propose") {
      const question = this.backend.workflow.proposeQuestion(command.projectId, command.payload.question);
      return { question: { id: question.id, version: question.version, status: question.status, question: question.question } };
    }
    if (command.type === "question.select") {
      const question = this.backend.workflow.selectQuestion(command.projectId, command.payload.questionId);
      return { question: { id: question.id, version: question.version, status: question.status, question: question.question } };
    }
    if(command.type==="project.fork"){const derived=this.backend.workflow.derive(command.projectId,command.payload.reason,command.actor.id,[]);return{project:this.projectSummary(derived.program),derivation:derived.derivation};}
    if(command.type==="project.import"){const imported=this.backend.projects.importBundle(command.payload.bundle,command.workspaceId,command.actor),program=this.backend.research.getProgram(imported.project.id);return{project:this.projectSummary(program),eventCount:this.backend.projects.events(imported.project.id).length,importEventId:imported.event.eventId};}
    const approval = this.backend.workflow.approveScope(command.projectId, command.actor.id, command.payload.note);
    return { approval: { id: approval.id, kind: approval.kind, decision: approval.decision, actor: approval.actor, createdAt: approval.createdAt } };
  }

  private projectStatus(query: PublicQuery): ProjectStatusReadModel {
    const status = this.backend.workflow.status(query.projectId),projection=this.backend.projects.projection(query.projectId);
    return ProjectStatusReadModelSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, workspaceId: query.workspaceId,
      project: this.projectSummary(status.program),
      questions: status.questions.map(item => ({ id: item.id, version: item.version, status: item.status, question: item.question })),
      counts: { assumptions: status.assumptions.length, hypothesisSets: status.hypothesisSets.length, protocols: status.protocols.length,
        approvals: status.approvals.length, deviations: status.deviations.length, derivations: status.derivations.length },
      confirmationObserved: status.visibility.some(item => item.dataRole === "confirmation" || item.dataRole === "test"),
      persistence:{rootProjectId:projection.rootProjectId,parentProjectId:projection.parentProjectId,branchName:projection.branchName,lastEventSequence:projection.lastSequence,eventCount:projection.eventCount},
    });
  }

  private queryData(query:PublicQuery):unknown{
    if(query.type==="project.status")return this.projectStatus(query);
    if(query.type==="project.bundle")return PublicProjectBundleSchema.parse(this.backend.projects.exportBundle(query.projectId,PUBLIC_SCHEMA_VERSION));
    const all=this.backend.projects.events(query.projectId),events=all.filter(item=>item.sequence>=query.fromSequence).slice(0,query.limit),last=events.at(-1)?.sequence??query.fromSequence-1,nextSequence=all.some(item=>item.sequence>last)?last+1:null;
    return ProjectEventListSchema.parse({schemaVersion:PUBLIC_SCHEMA_VERSION,workspaceId:query.workspaceId,projectId:query.projectId,events,nextSequence});
  }

  private projectSummary(program: ReturnType<PublicApplicationBackend["research"]["getProgram"]>) {
    return { id: program.id, title: program.title, direction: program.direction, domain: program.domain, profile: program.profile,
      status: program.status, updatedAt: program.updatedAt };
  }

  private eventType(command:PublicCommand):string{return command.type==="question.propose"?"question.proposed":command.type==="question.select"?"question.selected":"scope.approved";}
  private accept(command: PublicCommand, data: unknown,eventIds:string[]): CommandResult {
    const projectId = command.type === "project.create"||command.type==="project.import" ? (data as { project: { id: string } }).project.id : command.projectId;
    return CommandResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: command.commandId, workspaceId: command.workspaceId,
      projectId, status: "accepted", data, error: null, eventIds, handledAt: new Date().toISOString() });
  }

  private reject(command: PublicCommand, error: unknown,eventIds:string[]=[]): CommandResult {
    return CommandResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: command.commandId, workspaceId: command.workspaceId,
      projectId: command.projectId, status: "rejected", data: null, error: toPublicError(error), eventIds, handledAt: new Date().toISOString() });
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
