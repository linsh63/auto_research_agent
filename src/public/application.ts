import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { PublicApplicationBackend } from "../application/public-application-backend.js";
import {
  PUBLIC_SCHEMA_VERSION, CandidateSetReadModelSchema, CommandResultSchema, ConversationReadModelSchema,
  ExecutionPolicySchema, ProjectStatusReadModelSchema, PublicCommandSchema, ProjectEventListSchema,
  JobLogListSchema, JobReadModelSchema, JobRecordSchema, PublicProjectBundleSchema, PublicQuerySchema, QueryResultSchema, ResearchActionSchema,
  PluginInspectionSchema, PluginInstallationsResultSchema, PluginInstallationSchema, PluginPermissionSchema, PluginRuntimeSelectionSchema, PluginSearchResultSchema, PluginSourceRecordSchema, PluginSourcesResultSchema,
  WorkerDescriptorSchema, WorkerRequestSchema, WorkerResultSchema,
  type Actor, type CommandResult, type ExecutionPolicy, type ProjectStatusReadModel, type PublicCommand,
  type PublicProjectBundle, type PublicQuery, type QueryResult, type ResearchAction, type ResearchActionCandidate, type WorkerResult,
} from "./contracts.js";
import { assertCommandContext, assertQueryContext, PublicKernelError, toPublicError } from "./kernel.js";

export interface ResearchApplicationOptions {
  databasePath: string;
  maxDerivedRuns?: number;
  /** Explicit compatibility bindings for projects created before Workspace persistence exists. */
  workspaceBindings?: Record<string, string>;
}
export interface LocalWorkerOptions{descriptor:import("./contracts.js").WorkerDescriptor;artifactRoot:string;pythonExecutable?:string;pythonRunnerPath?:string;heartbeatIntervalMs?:number}
export interface LocalWorkerController{runOnce():Promise<import("./contracts.js").JobLease|null>}
export interface ExecutionAuditContext{permissions?:import("./contracts.js").PluginPermission[];externalServices?:string[]}

interface DispatchOutcome {
  data: unknown;
  eventType: string | null;
  eventPayload?: unknown;
  projectionPatch?: { researchStatus?: string };
}
type PluginCommand=Extract<PublicCommand,{type:"plugin.source.add"|"plugin.source.refresh"|"plugin.install"|"plugin.enable"|"plugin.disable"|"plugin.update"|"plugin.remove"}>;
function isPluginCommand(command:PublicCommand):command is PluginCommand{return command.type.startsWith("plugin.");}

export class ResearchApplication {
  private constructor(private readonly backend: PublicApplicationBackend) {}

  static async open(options: ResearchApplicationOptions): Promise<ResearchApplication> {
    const backend=await PublicApplicationBackend.open(options.databasePath,{maxDerivedRuns:options.maxDerivedRuns});
    try{for(const[projectId,workspaceId]of Object.entries(options.workspaceBindings??{}))backend.projects.adoptLegacyProject({projectId,workspaceId,actor:{id:"system:compatibility",kind:"system",displayName:"Compatibility importer"},schemaVersion:PUBLIC_SCHEMA_VERSION});return new ResearchApplication(backend);}catch(error){backend.close();throw error;}
  }

  close(): void { this.backend.close(); }

  createLocalWorker(options:LocalWorkerOptions):LocalWorkerController{
    const descriptor=WorkerDescriptorSchema.parse(options.descriptor);
    const worker=this.backend.createLocalWorker(descriptor,{artifactRoot:options.artifactRoot,pythonExecutable:options.pythonExecutable,pythonRunnerPath:options.pythonRunnerPath,heartbeatIntervalMs:options.heartbeatIntervalMs});
    return{runOnce:()=>worker.runOnce()};
  }

  async execute(input: unknown,auditContext:ExecutionAuditContext={}): Promise<CommandResult> {
    const parsed = PublicCommandSchema.safeParse(input);
    if (!parsed.success) return this.rejectedCommand(input, parsed.error);
    const command = parsed.data;
    const security={permissions:[...new Set(PluginPermissionSchema.array().parse(auditContext.permissions??[]))],externalServices:[...new Set((auditContext.externalServices??[]).map(item=>String(item)))]};
    const commandHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    let prepared;
    try{prepared=this.backend.projects.prepareCommand({workspaceId:command.workspaceId,projectId:command.projectId,commandId:command.commandId,idempotencyKey:command.idempotencyKey,commandHash,actor:command.actor});}
    catch(error){return this.reject(command,error);}
    if(prepared.kind==="replay")return CommandResultSchema.parse(prepared.receipt.result);
    try{assertCommandContext(command);}catch(error){const result=this.reject(command,error);this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result});return result;}
    let outcome:DispatchOutcome;
    try{outcome=this.dispatch(command);}catch(error){const eventId=command.projectId?`event-${randomUUID()}`:null,result=this.reject(command,error,eventId?[eventId]:[]);this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result,event:eventId?{eventId,type:"command.rejected",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{commandType:command.type,error:result.error},...security}:undefined});return result;}
    const data=outcome.data;
    const eventIds=command.type==="project.fork"?[`event-${randomUUID()}`,`event-${randomUUID()}`]:command.type==="project.import"?[(data as any).importEventId]:outcome.eventType?[`event-${randomUUID()}`]:[],result=this.accept(command,data,eventIds);
    try{
      if(command.type==="project.create")this.backend.projects.completeProjectCreation({receipt:prepared.receipt,projectId:result.projectId!,branchName:"main",researchStatus:"draft",result,event:{eventId:eventIds[0]!,type:"project.created",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{intent:command.payload.intent,project:(data as any).project,projectionPatch:{researchStatus:"draft"}},projectionPatch:{researchStatus:"draft"},...security}});
      else if(command.type==="project.fork"){const child=(data as any).project;this.backend.projects.completeFork({receipt:prepared.receipt,childProjectId:child.id,branchName:command.payload.branchName,researchStatus:child.status,result,parentEvent:{eventId:eventIds[0]!,type:"branch.created",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{childProjectId:child.id,branchName:command.payload.branchName},...security},childEvent:{eventId:eventIds[1]!,type:"project.forked",schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:{parentProjectId:command.projectId,branchName:command.payload.branchName,reason:command.payload.reason,projectionPatch:{researchStatus:child.status}},projectionPatch:{researchStatus:child.status},...security}});}
      else if(command.type==="project.import")this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result});
      else this.backend.projects.completeExistingCommand({receipt:prepared.receipt,result,event:outcome.eventType?{eventId:eventIds[0]!,type:outcome.eventType,schemaVersion:PUBLIC_SCHEMA_VERSION,actor:command.actor,causationId:command.commandId,correlationId:command.commandId,payload:outcome.eventPayload??{commandType:command.type,data,projectionPatch:outcome.projectionPatch},projectionPatch:outcome.projectionPatch,...security}:undefined});
      return result;
    }catch(error){return this.reject(command,new PublicKernelError("CONFLICT",`Command ${command.commandId} is in doubt after domain mutation`,false,{cause:error instanceof Error?error.message:String(error)}));}
  }

  async query(input: unknown): Promise<QueryResult> {
    const parsed = PublicQuerySchema.safeParse(input);
    if (!parsed.success) return this.rejectedQuery(input, parsed.error);
    const query = parsed.data;
    try {
      assertQueryContext(query);
      if(query.projectId!==null){const project=this.backend.projects.project(query.projectId);if(!project)throw new PublicKernelError("NOT_FOUND",`Unknown project ${query.projectId}`,false);if(project.workspaceId!==query.workspaceId)throw new PublicKernelError("FORBIDDEN","Project does not belong to this workspace",false);}else if(!this.backend.projects.workspace(query.workspaceId))throw new PublicKernelError("NOT_FOUND",`Unknown workspace ${query.workspaceId}`,false);
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "ok", data: this.queryData(query), error: null, handledAt: new Date().toISOString() });
    } catch (error) {
      return QueryResultSchema.parse({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: query.queryId, workspaceId: query.workspaceId,
        projectId: query.projectId, status: "rejected", data: null, error: toPublicError(error), handledAt: new Date().toISOString() });
    }
  }

  /** Language-neutral worker protocol entry point. Lease tokens, not process locality, authorize mutations. */
  async worker(input:unknown):Promise<WorkerResult>{
    const parsed=WorkerRequestSchema.safeParse(input),raw=input&&typeof input==="object"?input as Record<string,unknown>:{};
    if(!parsed.success)return WorkerResultSchema.parse({requestId:typeof raw.requestId==="string"&&raw.requestId?raw.requestId:"invalid",status:"rejected",data:null,error:toPublicError(parsed.error),handledAt:new Date().toISOString()});
    const request=parsed.data;
    try{let data:unknown;if(request.type==="worker.claim")data={lease:this.backend.jobs.claim(request.worker)};else if(request.type==="worker.heartbeat")data=this.backend.jobs.heartbeat(request);else if(request.type==="worker.log")data={log:this.backend.jobs.appendLog(request)};else if(request.type==="worker.complete")data={job:this.backend.jobs.complete(request)};else if(request.type==="worker.fail")data={job:this.backend.jobs.fail(request)};else data={jobs:this.backend.jobs.recoverExpired()};return WorkerResultSchema.parse({requestId:request.requestId,status:"ok",data,error:null,handledAt:new Date().toISOString()});}
    catch(error){return WorkerResultSchema.parse({requestId:request.requestId,status:"rejected",data:null,error:toPublicError(error),handledAt:new Date().toISOString()});}
  }

  private dispatch(command: PublicCommand): DispatchOutcome {
    if (command.type === "project.create") {
      const program = this.backend.workflow.createIntent(command.payload.intent);
      return { data:{ project: this.projectSummary(program), workspaceId: command.workspaceId },eventType:"project.created" };
    }
    if(command.type==="project.fork"){const derived=this.backend.workflow.derive(command.projectId,command.payload.reason,command.actor.id,[]);return{data:{project:this.projectSummary(derived.program),derivation:derived.derivation},eventType:null};}
    if(command.type==="project.import"){const imported=this.backend.projects.importBundle(command.payload.bundle,command.workspaceId,command.actor),program=this.backend.research.getProgram(imported.project.id);return{data:{project:this.projectSummary(program),eventCount:this.backend.projects.events(imported.project.id).length,importEventId:imported.event.eventId},eventType:null};}
    if(command.type==="policy.set"){
      if(command.actor.kind!=="user")throw new PublicKernelError("FORBIDDEN","Only a user actor can change execution policy",false);
      const policy=this.backend.interactions.setPolicy(command.workspaceId,command.projectId,command.payload);
      return{data:{policy:ExecutionPolicySchema.parse(policy)},eventType:"policy.updated",eventPayload:{policy}};
    }
    if(command.type==="job.submit"){
      if(command.payload.spec.dataRole==="confirmation"&&command.actor.kind!=="user")throw new PublicKernelError("FORBIDDEN","Only a user actor can submit a confirmation job",false);
      const job=this.backend.jobs.submit({workspaceId:command.workspaceId,projectId:command.projectId,spec:command.payload.spec,confirmationToken:command.payload.confirmationToken});
      return{data:{job:JobRecordSchema.parse(job)},eventType:"job.submitted",eventPayload:{job}};
    }
    if(command.type==="job.cancel"||command.type==="job.retry"){
      if(command.actor.kind!=="user")throw new PublicKernelError("FORBIDDEN",`Only a user actor can ${command.type==="job.cancel"?"cancel":"retry"} a job`,false);
      const job=command.type==="job.cancel"?this.backend.jobs.cancel(command.workspaceId,command.projectId,command.payload.jobId):this.backend.jobs.retry(command.workspaceId,command.projectId,command.payload.jobId);
      return{data:{job:JobRecordSchema.parse(job)},eventType:command.type==="job.cancel"?"job.cancellation_requested":"job.retried",eventPayload:{job}};
    }
    if(isPluginCommand(command)){
      if(command.actor.kind!=="user")throw new PublicKernelError("FORBIDDEN","Plugin lifecycle changes require a user actor",false);
      if(command.type==="plugin.source.add"){const source=this.backend.plugins.addSource({workspaceId:command.workspaceId,...command.payload});return{data:{source:PluginSourceRecordSchema.parse(source)},eventType:null};}
      if(command.type==="plugin.source.refresh"){const refreshed=this.backend.plugins.refresh(command.workspaceId,command.payload.sourceId);return{data:{source:PluginSourceRecordSchema.parse(refreshed.source),plugins:refreshed.descriptors,issues:refreshed.issues},eventType:null};}
      if(command.type==="plugin.install"){const installation=this.backend.plugins.install({workspaceId:command.workspaceId,projectId:command.projectId,scope:command.payload.scope,descriptorId:command.payload.descriptorId,approvedPermissions:command.payload.approvedPermissions,actorId:command.actor.id});return{data:{installation:PluginInstallationSchema.parse(installation)},eventType:command.projectId?"plugin.installed":null,eventPayload:{installation}};}
      const current=this.backend.plugins.installation(command.workspaceId,command.payload.installationId);if(current.projectId!==command.projectId)throw new PublicKernelError("FORBIDDEN","Plugin installation scope does not match command project",false);
      if(command.type==="plugin.enable"){const installation=this.backend.plugins.enable({workspaceId:command.workspaceId,installationId:current.id,actorId:command.actor.id});return{data:{installation:PluginInstallationSchema.parse(installation)},eventType:command.projectId?"plugin.enabled":null,eventPayload:{installation}};}
      if(command.type==="plugin.disable"){const installation=this.backend.plugins.disable(command.workspaceId,current.id,command.actor.id);return{data:{installation:PluginInstallationSchema.parse(installation)},eventType:command.projectId?"plugin.disabled":null,eventPayload:{installation}};}
      if(command.type==="plugin.remove"){const installation=this.backend.plugins.remove(command.workspaceId,current.id,command.actor.id);return{data:{installation:PluginInstallationSchema.parse(installation)},eventType:command.projectId?"plugin.removed":null,eventPayload:{installation}};}
      const updated=this.backend.plugins.update({workspaceId:command.workspaceId,installationId:current.id,targetDescriptorId:command.payload.targetDescriptorId,approvedPermissions:command.payload.approvedPermissions,actorId:command.actor.id});return{data:{installation:PluginInstallationSchema.parse(updated.installation),permissionDiff:updated.permissionDiff},eventType:command.projectId?"plugin.updated":null,eventPayload:updated};
    }
    if(command.type==="conversation.send")return this.handleConversation(command,command.payload.sessionId,command.payload.message,"chat");
    if(command.type==="candidate.choose")return this.handleCandidateChoice(command);
    if(command.type==="action.execute")return this.executeAction(command,command.payload.action,"api",null,null);
    const action=this.legacyAction(command);
    return this.executeAction(command,action,"api",null,null,true);
  }

  private legacyAction(command:Extract<PublicCommand,{type:"question.propose"|"question.select"|"scope.approve"}>):ResearchAction{
    const common={id:`action:${command.commandId}`,factRefs:[],assumptionRefs:[],estimatedCostUsd:0,estimatedMinutes:1,risks:["Research state may become stale before execution"],stoppingConditions:["Kernel gate rejects the transition"],requiredPermissions:[],expectedInformationGain:"medium" as const};
    if(command.type==="question.propose")return ResearchActionSchema.parse({...common,type:command.type,title:"Propose research question",description:"Add a scoped research question",rationale:command.payload.question.rationale,requiresHumanApproval:false,input:{question:command.payload.question}});
    if(command.type==="question.select")return ResearchActionSchema.parse({...common,type:command.type,title:"Select research question",description:"Select the question that the project will pursue",rationale:"The selected question defines the next scope gate.",requiresHumanApproval:false,input:{questionId:command.payload.questionId}});
    return ResearchActionSchema.parse({...common,type:command.type,title:"Approve research scope",description:"Record explicit human approval of the selected scope",rationale:"Scope approval is a mandatory human gate.",expectedInformationGain:"low",requiresHumanApproval:true,input:{note:command.payload.note}});
  }

  private executeAction(command:PublicCommand,rawAction:ResearchAction,source:"api"|"chat"|"candidate",sessionId:string|null,candidateSetId:string|null,legacyResult=false):DispatchOutcome{
    const action=ResearchActionSchema.parse(rawAction),workspaceId=command.workspaceId,projectId=command.projectId!;
    if(action.type==="scope.approve"&&(!action.requiresHumanApproval||command.actor.kind!=="user"||source==="chat"))throw new PublicKernelError("GATE_REJECTED","Scope approval requires an explicit user action",false,{actionType:action.type});
    this.backend.interactions.recordAction({workspaceId,projectId,sessionId,candidateSetId,source,action,status:"proposed"});
    try{
      let result:unknown;
      if(action.type==="question.propose"){
        const question=this.backend.workflow.proposeQuestion(projectId,action.input.question);
        result={question:{id:question.id,version:question.version,status:question.status,question:question.question}};
      }else if(action.type==="question.select"){
        const question=this.backend.workflow.selectQuestion(projectId,action.input.questionId);
        result={question:{id:question.id,version:question.version,status:question.status,question:question.question}};
      }else{
        const approval=this.backend.workflow.approveScope(projectId,command.actor.id,action.input.note);
        result={approval:{id:approval.id,kind:approval.kind,decision:approval.decision,actor:approval.actor,createdAt:approval.createdAt}};
      }
      this.backend.interactions.recordAction({workspaceId,projectId,sessionId,candidateSetId,source,action,status:"accepted",result});
      const projectionPatch=action.type==="scope.approve"?{researchStatus:"scoped"}:undefined;
      return{data:legacyResult?result:{action,result},eventType:this.actionEventType(action),eventPayload:{action,result,projectionPatch},projectionPatch};
    }catch(error){
      this.backend.interactions.recordAction({workspaceId,projectId,sessionId,candidateSetId,source,action,status:"rejected",result:{error:error instanceof Error?error.message:String(error)}});
      throw error;
    }
  }

  private handleConversation(command:Extract<PublicCommand,{type:"conversation.send"|"candidate.choose"}>,sessionId:string|null,message:string,source:"chat"|"candidate"):DispatchOutcome{
    const session=this.backend.interactions.openSession({workspaceId:command.workspaceId,projectId:command.projectId,sessionId,title:message.slice(0,80)});
    this.backend.interactions.appendMessage(session,"user",message);
    const policy=this.backend.interactions.policy(command.workspaceId,command.projectId),actions=this.nextActions(command.projectId),auto=policy.mode==="auto"?actions.find(action=>this.canAutoExecute(action,policy)):undefined;
    if(auto){
      const outcome=this.executeAction(command,auto,source,session.id,null),reply=`已执行：${auto.title}`;
      this.backend.interactions.appendMessage(session,"assistant",reply);
      return{...outcome,data:{sessionId:session.id,reply,executedAction:auto,actionResult:outcome.data,candidates:null,policy}};
    }
    const visible=policy.mode==="manual"?actions.slice(0,1):actions;
    const freeInput:ResearchActionCandidate={id:`candidate-${randomUUID()}`,kind:"free_input",title:"其他 / 自由输入",description:"输入你希望采取的研究行动，由核心重新解析。",action:null};
    const candidates:ResearchActionCandidate[]=[...visible.map(action=>({id:`candidate-${randomUUID()}`,kind:"action" as const,title:action.title,description:action.description,action})),freeInput];
    const set=this.backend.interactions.saveCandidates({workspaceId:command.workspaceId,projectId:command.projectId,sessionId:session.id,candidates});
    for(const candidate of candidates)if(candidate.action)this.backend.interactions.recordAction({workspaceId:command.workspaceId,projectId:command.projectId,sessionId:session.id,candidateSetId:set.id,source:"chat",action:candidate.action,status:"proposed"});
    const blocked=policy.mode==="auto"&&actions.length>0,reply=blocked?"下一步触及人工门禁、权限或预算限制，请由用户选择。":actions.length?"请选择下一步研究行动，或使用自由输入。":"当前阶段没有可自动推进的行动，你仍可自由输入。";
    this.backend.interactions.appendMessage(session,"assistant",reply);
    return{data:{sessionId:session.id,reply,executedAction:null,candidates:CandidateSetReadModelSchema.parse(set),policy},eventType:"conversation.responded",eventPayload:{sessionId:session.id,candidateSetId:set.id,policyMode:policy.mode,autoBlocked:blocked}};
  }

  private handleCandidateChoice(command:Extract<PublicCommand,{type:"candidate.choose"}>):DispatchOutcome{
    if(command.actor.kind!=="user")throw new PublicKernelError("FORBIDDEN","Candidate selection requires a user actor",false);
    const set=this.backend.interactions.candidateSet(command.workspaceId,command.projectId,command.payload.sessionId,command.payload.candidateSetId);
    if(set.status!=="open")throw new PublicKernelError("CONFLICT",`Candidate set ${set.id} is ${set.status}`,false);
    if(command.payload.freeInput!==null){this.backend.interactions.consumeCandidateSet(set);return this.handleConversation(command,set.sessionId,command.payload.freeInput,"candidate");}
    const candidate=set.candidates.find(item=>item.id===command.payload.candidateId);
    if(!candidate)throw new PublicKernelError("NOT_FOUND",`Unknown candidate ${command.payload.candidateId}`,false);
    if(candidate.kind!=="action"||!candidate.action)throw new PublicKernelError("INVALID_COMMAND","Choose the free-input option by providing freeInput",false);
    this.backend.interactions.consumeCandidateSet(set);
    const session=this.backend.interactions.session(command.workspaceId,command.projectId,set.sessionId);
    this.backend.interactions.appendMessage(session,"user",`选择候选：${candidate.title}`);
    const outcome=this.executeAction(command,candidate.action,"candidate",session.id,set.id),reply=`已执行：${candidate.title}`;
    this.backend.interactions.appendMessage(session,"assistant",reply);
    return{...outcome,data:{sessionId:session.id,reply,executedAction:candidate.action,actionResult:outcome.data,candidates:null,policy:this.backend.interactions.policy(command.workspaceId,command.projectId)}};
  }

  private nextActions(projectId:string):ResearchAction[]{
    const status=this.backend.workflow.status(projectId),common={factRefs:[] as string[],assumptionRefs:[] as string[],estimatedCostUsd:0,estimatedMinutes:1,risks:["The proposed transition may need revision after new evidence"],stoppingConditions:["Kernel gate rejects the transition"],requiredPermissions:[] as string[]};
    const proposed=status.questions.filter(item=>item.status==="proposed");
    if(status.questions.length===0){const direction=status.program.direction,question=`How does the proposed approach affect the primary measurable outcome for ${status.program.domain} research?`;return[ResearchActionSchema.parse({...common,id:`action-${randomUUID()}`,type:"question.propose",title:"提出首个研究问题",description:"根据项目方向形成可审查的研究问题。",rationale:`The project direction requires a concrete and falsifiable question: ${direction}`,expectedInformationGain:"high",requiresHumanApproval:false,input:{question:{question,rationale:`A scoped question is required before evidence collection and protocol design can begin for: ${direction}`,targetPopulation:`${status.program.domain} research tasks`,intervention:direction.slice(0,200),comparator:"An established baseline under the same evaluation protocol",primaryOutcome:"A preregistered primary metric",scope:"The approved project constraints and allowed data sources",sourceIds:[]}}})];}
    if(proposed.length)return proposed.map(item=>ResearchActionSchema.parse({...common,id:`action-${randomUUID()}`,type:"question.select",title:`选择问题 v${item.version}`,description:item.question,rationale:"Selecting one proposed question is required before scope approval.",expectedInformationGain:"medium",requiresHumanApproval:false,input:{questionId:item.id}}));
    if(status.program.status==="draft"&&status.questions.some(item=>item.status==="selected"))return[ResearchActionSchema.parse({...common,id:`action-${randomUUID()}`,type:"scope.approve",title:"批准研究范围",description:"人工确认已选择的问题和项目边界。",rationale:"Scope approval is a non-bypassable human research gate.",expectedInformationGain:"low",requiresHumanApproval:true,input:{note:"Explicit approval from candidate selection."}})];
    return[];
  }

  private canAutoExecute(action:ResearchAction,policy:ExecutionPolicy):boolean{
    return policy.maxAutoActionsPerTurn>0&&action.type!=="scope.approve"&&!action.requiresHumanApproval&&action.requiredPermissions.length===0&&action.estimatedCostUsd<=policy.maxKnownCostUsdPerAction&&policy.autoAllowedActionTypes.includes(action.type);
  }

  private actionEventType(action:ResearchAction):string{return action.type==="question.propose"?"question.proposed":action.type==="question.select"?"question.selected":"scope.approved";}

  private projectStatus(query: PublicQuery): ProjectStatusReadModel {
    const status = this.backend.workflow.status(query.projectId!),projection=this.backend.projects.projection(query.projectId!);
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
    if(query.type==="conversation.get")return ConversationReadModelSchema.parse(this.backend.interactions.conversation(query.workspaceId,query.projectId,query.sessionId));
    if(query.type==="policy.get")return ExecutionPolicySchema.parse(this.backend.interactions.policy(query.workspaceId,query.projectId));
    if(query.type==="job.get")return JobReadModelSchema.parse({job:this.backend.jobs.job(query.workspaceId,query.projectId,query.jobId),artifacts:this.backend.jobs.artifacts(query.workspaceId,query.projectId,query.jobId)});
    if(query.type==="job.logs"){const page=this.backend.jobs.logs(query.workspaceId,query.projectId,query.jobId,query.fromSequence,query.limit+1),more=page.length>query.limit,logs=page.slice(0,query.limit);return JobLogListSchema.parse({jobId:query.jobId,logs,nextSequence:more?(logs.at(-1)?.sequence??query.fromSequence-1)+1:null});}
    if(query.type==="plugin.search")return PluginSearchResultSchema.parse({plugins:this.backend.plugins.search(query.workspaceId,query.query,query.filters)});
    if(query.type==="plugin.inspect")return PluginInspectionSchema.parse({plugin:this.backend.plugins.descriptor(query.workspaceId,query.descriptorId),inspectionStatus:"inspected"});
    if(query.type==="plugin.sources")return PluginSourcesResultSchema.parse({sources:this.backend.plugins.sources(query.workspaceId)});
    if(query.type==="plugin.installations")return PluginInstallationsResultSchema.parse({installations:this.backend.plugins.installations(query.workspaceId,query.projectId)});
    if(query.type==="plugin.runtime")return PluginRuntimeSelectionSchema.parse({plugins:this.backend.plugins.runtimeSelection(query.workspaceId,query.projectId)});
    const all=this.backend.projects.events(query.projectId),events=all.filter(item=>item.sequence>=query.fromSequence).slice(0,query.limit),last=events.at(-1)?.sequence??query.fromSequence-1,nextSequence=all.some(item=>item.sequence>last)?last+1:null;
    return ProjectEventListSchema.parse({schemaVersion:PUBLIC_SCHEMA_VERSION,workspaceId:query.workspaceId,projectId:query.projectId,events,nextSequence});
  }

  private projectSummary(program: ReturnType<PublicApplicationBackend["research"]["getProgram"]>) {
    return { id: program.id, title: program.title, direction: program.direction, domain: program.domain, profile: program.profile,
      status: program.status, updatedAt: program.updatedAt };
  }

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
