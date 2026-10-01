#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ResearchClient } from "./public/client.js";
import { PUBLIC_SCHEMA_VERSION, type Actor } from "./public/contracts.js";

const [operation,...args]=process.argv.slice(2),dataDir=resolve(process.env.AUTO_RESEARCH_SERVICE_DIR??".research-data/service"),databasePath=resolve(process.env.AUTO_RESEARCH_DATABASE??".research-data/research.db"),client=await ResearchClient.connectLocal({dataDir,databasePath,autoStart:true}),actor:Actor={id:process.env.AUTO_RESEARCH_ACTOR_ID??"user:reference-cli",kind:"user",displayName:"Reference CLI"};
const context=(workspaceId:string,projectId:string|null)=>({schemaVersion:PUBLIC_SCHEMA_VERSION,commandId:`command-${randomUUID()}`,idempotencyKey:`cli-${randomUUID()}`,workspaceId,projectId,actor,issuedAt:new Date().toISOString()}),q=(workspaceId:string,projectId:string|null)=>({schemaVersion:PUBLIC_SCHEMA_VERSION,queryId:`query-${randomUUID()}`,workspaceId,projectId,actor}),json=(path:string)=>JSON.parse(readFileSync(resolve(path),"utf8"));
let result:unknown;
if(operation==="capabilities")result=await client.negotiate();
else if(operation==="new"){const[workspaceId,path]=args;result=await client.execute({...context(required(workspaceId),null),type:"project.create",payload:{intent:json(required(path))}});}
else if(operation==="status"){const[workspaceId,projectId]=args;result=await client.query({...q(required(workspaceId),required(projectId)),type:"project.status"});}
else if(operation==="chat"){const[workspaceId,projectId,message,sessionId]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:"conversation.send",payload:{sessionId:sessionId??null,message:required(message)}});}
else if(operation==="choose"){const[workspaceId,projectId,sessionId,candidateSetId,choice,...rest]=args;const free=choice==="--free";result=await client.execute({...context(required(workspaceId),required(projectId)),type:"candidate.choose",payload:{sessionId:required(sessionId),candidateSetId:required(candidateSetId),candidateId:free?null:required(choice),freeInput:free?required(rest.join(" ")):null}});}
else if(operation==="approve"){const[workspaceId,projectId,...note]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:"scope.approve",payload:{note:note.join(" ")}});}
else if(operation==="job-submit"){const[workspaceId,projectId,path]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:"job.submit",payload:{spec:json(required(path)),confirmationToken:process.env.AUTO_RESEARCH_CONFIRMATION_TOKEN??null}});}
else if(operation==="job-status"){const[workspaceId,projectId,jobId]=args;result=await client.query({...q(required(workspaceId),required(projectId)),type:"job.get",jobId:required(jobId)});}
else if(operation==="job-cancel"){const[workspaceId,projectId,jobId]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:"job.cancel",payload:{jobId:required(jobId)}});}
else if(operation==="report"){const[workspaceId,projectId]=args,status=await client.query({...q(required(workspaceId),required(projectId)),type:"project.status"}),events=await client.query({...q(required(workspaceId),required(projectId)),type:"project.events",fromSequence:1,limit:1000});result={status,events};}
else if(operation==="plugin-source-add"){const[workspaceId,kind,location,...label]=args;result=await client.execute({...context(required(workspaceId),null),type:"plugin.source.add",payload:{kind:required(kind),location:required(location),label:label.join(" ")||required(location)}});}
else if(operation==="plugin-source-refresh"){const[workspaceId,sourceId]=args;result=await client.execute({...context(required(workspaceId),null),type:"plugin.source.refresh",payload:{sourceId:required(sourceId)}});}
else if(operation==="plugin-search"){const[workspaceId,...query]=args;result=await client.query({...q(required(workspaceId),null),type:"plugin.search",query:query.join(" "),filters:{}});}
else if(operation==="plugin-inspect"){const[workspaceId,descriptorId]=args;result=await client.query({...q(required(workspaceId),null),type:"plugin.inspect",descriptorId:required(descriptorId)});}
else if(operation==="plugin-install"){const[workspaceId,projectId,descriptorId,permissions]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:"plugin.install",payload:{scope:"project",descriptorId:required(descriptorId),approvedPermissions:required(permissions).split(",")}});}
else if(operation==="plugin-enable"||operation==="plugin-disable"){const[workspaceId,projectId,installationId]=args;result=await client.execute({...context(required(workspaceId),required(projectId)),type:operation==="plugin-enable"?"plugin.enable":"plugin.disable",payload:{installationId:required(installationId)}});}
else throw new Error("Usage: reference-cli <capabilities|new|status|chat|choose|approve|job-submit|job-status|job-cancel|report|plugin-source-add|plugin-source-refresh|plugin-search|plugin-inspect|plugin-install|plugin-enable|plugin-disable> ...");
console.log(JSON.stringify(result,null,2));
function required(value:string|undefined):string{if(!value)throw new Error("Missing required argument");return value;}
