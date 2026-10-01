import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  CandidateSetReadModelSchema, ConversationReadModelSchema, ExecutionPolicySchema, PUBLIC_SCHEMA_VERSION,
  ResearchActionSchema, ResearchApplication, type Actor, type ResearchAction,
} from "../src/public/index.js";
import { InteractionStore } from "../src/infrastructure/db/interaction-store.js";
import { applyMigrationTransaction } from "../src/infrastructure/db/research-store.js";

const user:Actor={id:"user:p",kind:"user",displayName:"P tester"};
const agent:Actor={id:"agent:p",kind:"agent",displayName:"P agent"};
const context={schemaVersion:PUBLIC_SCHEMA_VERSION,workspaceId:"workspace:p",actor:user,issuedAt:"2026-10-01T00:00:00.000Z"};
const intent={title:"P interaction study",direction:"Evaluate whether unified research actions preserve gates across every supported interaction entry.",domain:"AI/ML",constraints:["public API only"],allowedData:["fixture"],prohibitions:["no gate bypass"],profile:"confirmatory" as const,budget:{gpuHours:1,wallHours:1,diskGiB:1,modelCalls:3,knownCostUsd:0}};

async function createProject(app:ResearchApplication,key:string):Promise<string>{const result=await app.execute({...context,type:"project.create",commandId:`${key}:create`,idempotencyKey:`${key}:create`,projectId:null,payload:{intent}});assert.equal(result.status,"accepted");return result.projectId!;}
async function events(app:ResearchApplication,projectId:string){const result=await app.query({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:`events:${projectId}:${Math.random()}`,type:"project.events",workspaceId:context.workspaceId,projectId,actor:user,fromSequence:1,limit:100});assert.equal(result.status,"ok");return(result.data as{events:Array<{type:string,payload:any}>}).events;}
function semantic(action:ResearchAction){const{id:_id,...rest}=action;return rest;}

test("API, candidate choice and auto chat execute the same canonical ResearchAction",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"ara-p-entry-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const app=await ResearchApplication.open({databasePath:join(dir,"research.db")});t.after(()=>app.close());
  const directProject=await createProject(app,"direct"),candidateProject=await createProject(app,"candidate"),autoProject=await createProject(app,"auto");

  const offered=await app.execute({...context,type:"conversation.send",commandId:"candidate:send",idempotencyKey:"candidate:send",projectId:candidateProject,payload:{sessionId:null,message:"请给出下一步候选行动"}});
  assert.equal(offered.status,"accepted");
  const offeredData=offered.data as{sessionId:string;candidates:unknown};
  const candidateSet=CandidateSetReadModelSchema.parse(offeredData.candidates),actionCandidate=candidateSet.candidates.find(item=>item.kind==="action")!;
  const sourceAction=ResearchActionSchema.parse(actionCandidate.action),directAction=ResearchActionSchema.parse({...sourceAction,id:"action:direct-entry"});
  const direct=await app.execute({...context,type:"action.execute",commandId:"direct:action",idempotencyKey:"direct:action",projectId:directProject,payload:{action:directAction}});
  assert.equal(direct.status,"accepted");

  const chosen=await app.execute({...context,type:"candidate.choose",commandId:"candidate:choose",idempotencyKey:"candidate:choose",projectId:candidateProject,payload:{sessionId:offeredData.sessionId,candidateSetId:candidateSet.id,candidateId:actionCandidate.id,freeInput:null}});
  assert.equal(chosen.status,"accepted");
  await app.execute({...context,type:"policy.set",commandId:"auto:policy",idempotencyKey:"auto:policy",projectId:autoProject,payload:{mode:"auto",maxAutoActionsPerTurn:1,maxKnownCostUsdPerAction:0,autoAllowedActionTypes:["question.propose","question.select"]}});
  const chatted=await app.execute({...context,type:"conversation.send",commandId:"auto:send",idempotencyKey:"auto:send",projectId:autoProject,payload:{sessionId:null,message:"继续推进当前研究"}});
  assert.equal(chatted.status,"accepted");assert.equal((chatted.data as any).executedAction.type,"question.propose");

  const finalEvents=await Promise.all([directProject,candidateProject,autoProject].map(projectId=>events(app,projectId).then(items=>items.filter(item=>item.type==="question.proposed").at(-1)!)));
  assert.deepEqual(finalEvents.map(item=>item.type),["question.proposed","question.proposed","question.proposed"]);
  assert.deepEqual(semantic(ResearchActionSchema.parse(finalEvents[0].payload.action)),semantic(ResearchActionSchema.parse(finalEvents[1].payload.action)));
  assert.deepEqual(semantic(ResearchActionSchema.parse(finalEvents[1].payload.action)),semantic(ResearchActionSchema.parse(finalEvents[2].payload.action)));
});

test("auto policy cannot cross mandatory scope approval and only an explicit user action can approve",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"ara-p-gate-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));const app=await ResearchApplication.open({databasePath:join(dir,"research.db")});t.after(()=>app.close());const projectId=await createProject(app,"gate");
  const proposed=await app.execute({...context,type:"conversation.send",commandId:"gate:propose",idempotencyKey:"gate:propose",projectId,payload:{sessionId:null,message:"提出问题"}}),pd=proposed.data as any,set=CandidateSetReadModelSchema.parse(pd.candidates),choice=set.candidates.find(item=>item.kind==="action")!;
  await app.execute({...context,type:"candidate.choose",commandId:"gate:choose-proposal",idempotencyKey:"gate:choose-proposal",projectId,payload:{sessionId:pd.sessionId,candidateSetId:set.id,candidateId:choice.id,freeInput:null}});
  const selectOffer=await app.execute({...context,type:"conversation.send",commandId:"gate:select-offer",idempotencyKey:"gate:select-offer",projectId,payload:{sessionId:pd.sessionId,message:"继续"}}),sd=selectOffer.data as any,selectSet=CandidateSetReadModelSchema.parse(sd.candidates),select=selectSet.candidates.find(item=>item.kind==="action")!;
  await app.execute({...context,type:"candidate.choose",commandId:"gate:select",idempotencyKey:"gate:select",projectId,payload:{sessionId:pd.sessionId,candidateSetId:selectSet.id,candidateId:select.id,freeInput:null}});
  await app.execute({...context,type:"policy.set",commandId:"gate:auto",idempotencyKey:"gate:auto",projectId,payload:{mode:"auto",maxAutoActionsPerTurn:1,maxKnownCostUsdPerAction:0,autoAllowedActionTypes:["question.propose","question.select"]}});
  const blocked=await app.execute({...context,type:"conversation.send",commandId:"gate:blocked",idempotencyKey:"gate:blocked",projectId,payload:{sessionId:pd.sessionId,message:"自动继续"}}),bd=blocked.data as any,approvalSet=CandidateSetReadModelSchema.parse(bd.candidates),approvalCandidate=approvalSet.candidates.find(item=>item.kind==="action")!;
  assert.equal(bd.executedAction,null);assert.equal(approvalCandidate.action?.type,"scope.approve");
  const bypass=await app.execute({...context,actor:agent,type:"action.execute",commandId:"gate:bypass",idempotencyKey:"gate:bypass",projectId,payload:{action:{...approvalCandidate.action!,id:"action:agent-bypass"}}});
  assert.equal(bypass.status,"rejected");assert.equal(bypass.error?.code,"GATE_REJECTED");
  const agentClick=await app.execute({...context,actor:agent,type:"candidate.choose",commandId:"gate:agent-click",idempotencyKey:"gate:agent-click",projectId,payload:{sessionId:pd.sessionId,candidateSetId:approvalSet.id,candidateId:approvalCandidate.id,freeInput:null}});
  assert.equal(agentClick.status,"rejected");assert.equal(agentClick.error?.code,"FORBIDDEN");
  const before=await app.query({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:"gate:before",type:"project.status",workspaceId:context.workspaceId,projectId,actor:user});assert.equal((before.data as any).project.status,"draft");
  const approved=await app.execute({...context,type:"candidate.choose",commandId:"gate:approve",idempotencyKey:"gate:approve",projectId,payload:{sessionId:pd.sessionId,candidateSetId:approvalSet.id,candidateId:approvalCandidate.id,freeInput:null}});
  assert.equal(approved.status,"accepted");const after=await app.query({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:"gate:after",type:"project.status",workspaceId:context.workspaceId,projectId,actor:user});assert.equal((after.data as any).project.status,"scoped");
});

test("manual exposes one recommendation while candidate mode exposes every legal choice",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"ara-p-modes-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));const app=await ResearchApplication.open({databasePath:join(dir,"research.db")});t.after(()=>app.close());const projectId=await createProject(app,"modes");
  for(const [index,intervention] of ["A structured public action","A client-specific workflow call"].entries()){
    const result=await app.execute({...context,type:"question.propose",commandId:`modes:q${index}`,idempotencyKey:`modes:q${index}`,projectId,payload:{question:{question:`Does candidate mode preserve legal research choice number ${index+1} without bypassing the shared kernel?`,rationale:"Multiple proposed questions are needed to verify that policy changes presentation while preserving the same legal transitions.",targetPopulation:"Public research clients",intervention,comparator:"The alternative legal research choice",primaryOutcome:"Visible legal candidate count",scope:"One deterministic policy fixture",sourceIds:[]}}});assert.equal(result.status,"accepted");
  }
  const manual=await app.execute({...context,type:"conversation.send",commandId:"modes:manual",idempotencyKey:"modes:manual",projectId,payload:{sessionId:null,message:"显示推荐"}}),md=manual.data as any,manualSet=CandidateSetReadModelSchema.parse(md.candidates);assert.equal(manualSet.candidates.filter(item=>item.kind==="action").length,1);
  await app.execute({...context,type:"policy.set",commandId:"modes:candidate-policy",idempotencyKey:"modes:candidate-policy",projectId,payload:{mode:"candidate",maxAutoActionsPerTurn:1,maxKnownCostUsdPerAction:0,autoAllowedActionTypes:["question.propose","question.select"]}});
  const all=await app.execute({...context,type:"conversation.send",commandId:"modes:all",idempotencyKey:"modes:all",projectId,payload:{sessionId:md.sessionId,message:"显示全部合法选择"}}),allSet=CandidateSetReadModelSchema.parse((all.data as any).candidates);assert.equal(allSet.candidates.filter(item=>item.kind==="action").length,2);assert.equal(allSet.candidates.at(-1)?.kind,"free_input");
  const stale=await app.execute({...context,type:"candidate.choose",commandId:"modes:stale",idempotencyKey:"modes:stale",projectId,payload:{sessionId:md.sessionId,candidateSetId:manualSet.id,candidateId:manualSet.candidates[0]!.id,freeInput:null}});assert.equal(stale.status,"rejected");assert.equal(stale.error?.code,"CONFLICT");
});

test("free input remains the final candidate and conversation state survives restart",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"ara-p-free-")),path=join(dir,"research.db");t.after(()=>rmSync(dir,{recursive:true,force:true}));let app=await ResearchApplication.open({databasePath:path});const projectId=await createProject(app,"free");
  const first=await app.execute({...context,type:"conversation.send",commandId:"free:first",idempotencyKey:"free:first",projectId,payload:{sessionId:null,message:"显示候选"}}),fd=first.data as any,set=CandidateSetReadModelSchema.parse(fd.candidates);
  assert.equal(set.freeInputAllowed,true);assert.equal(set.candidates.at(-1)?.kind,"free_input");
  const custom=await app.execute({...context,type:"candidate.choose",commandId:"free:custom",idempotencyKey:"free:custom",projectId,payload:{sessionId:fd.sessionId,candidateSetId:set.id,candidateId:null,freeInput:"我希望先重新审视研究问题"}});assert.equal(custom.status,"accepted");
  const reused=await app.execute({...context,type:"candidate.choose",commandId:"free:reuse",idempotencyKey:"free:reuse",projectId,payload:{sessionId:fd.sessionId,candidateSetId:set.id,candidateId:null,freeInput:"再次消费旧候选"}});assert.equal(reused.status,"rejected");assert.equal(reused.error?.code,"CONFLICT");
  const crossWorkspace=await app.execute({...context,workspaceId:"workspace:other",type:"candidate.choose",commandId:"free:cross",idempotencyKey:"free:cross",projectId,payload:{sessionId:fd.sessionId,candidateSetId:set.id,candidateId:null,freeInput:"跨工作区访问"}});assert.equal(crossWorkspace.status,"rejected");assert.equal(crossWorkspace.error?.code,"FORBIDDEN");
  app.close();app=await ResearchApplication.open({databasePath:path});t.after(()=>app.close());
  const query=await app.query({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:"free:conversation",type:"conversation.get",workspaceId:context.workspaceId,projectId,actor:user,sessionId:fd.sessionId}),conversation=ConversationReadModelSchema.parse(query.data);
  assert.equal(conversation.messages.some(item=>item.content==="我希望先重新审视研究问题"),true);assert.equal(conversation.latestCandidates?.candidates.at(-1)?.kind,"free_input");
  const policy=await app.query({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:"free:policy",type:"policy.get",workspaceId:context.workspaceId,projectId,actor:user});assert.equal(ExecutionPolicySchema.parse(policy.data).mode,"manual");
});

test("schema 12 interaction migration backs up and rolls back atomically",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"ara-p-migration-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,"research.db");
  const bootstrap=await ResearchApplication.open({databasePath:path});bootstrap.close();const raw=new Database(path);raw.pragma("user_version = 11");for(const table of ["research_actions_v15","execution_policies_v15","candidate_sets_v15","conversation_messages_v15","conversation_sessions_v15"])raw.exec(`DROP TABLE ${table}`);raw.close();
  const store=await InteractionStore.open(path);assert.ok(store.migrationBackupPath);store.close();const migrated=new Database(path,{readonly:true});assert.equal(migrated.pragma("user_version",{simple:true}),12);migrated.close();
  const failedPath=join(dir,"failed.db"),failedBootstrap=await ResearchApplication.open({databasePath:failedPath});failedBootstrap.close();const failed=new Database(failedPath);failed.pragma("foreign_keys = OFF");for(const table of ["research_actions_v15","execution_policies_v15","candidate_sets_v15","conversation_messages_v15","conversation_sessions_v15"])failed.exec(`DROP TABLE ${table}`);failed.pragma("user_version = 11");const migration=readFileSync(resolve("migrations/011_research_interactions.sql"),"utf8");assert.throws(()=>applyMigrationTransaction(failed,`${migration}\nCREATE TABLE broken (`));assert.equal(failed.pragma("user_version",{simple:true}),11);assert.equal(failed.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_sessions_v15'").get(),undefined);failed.close();
});
