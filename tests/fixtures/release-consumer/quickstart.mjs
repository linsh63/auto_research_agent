import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResearchClient } from "auto-research-agent/client";
import { PUBLIC_SCHEMA_VERSION } from "auto-research-agent/contracts";
import { startCoreService } from "auto-research-agent/server";

const root=mkdtempSync(join(tmpdir(),"auto-research-quickstart-"));
const service=await startCoreService({databasePath:join(root,"research.db"),dataDir:join(root,"service")});
try{
  const token=readFileSync(service.address.tokenFile,"utf8").trim();
  const client=await ResearchClient.connect({baseUrl:service.address.baseUrl,token});
  const result=await client.execute({schemaVersion:PUBLIC_SCHEMA_VERSION,commandId:"quickstart-create",idempotencyKey:"quickstart-create",workspaceId:"workspace:quickstart",projectId:null,actor:{id:"user:quickstart",kind:"user"},issuedAt:new Date().toISOString(),type:"project.create",payload:{intent:{title:"Quickstart research project",direction:"Verify that the installed headless research kernel can create an auditable project.",domain:"research tooling",constraints:["public SDK only"],allowedData:["synthetic fixture"],prohibitions:["no external calls"],profile:"smoke",budget:{gpuHours:0.001,wallHours:1,diskGiB:1,modelCalls:1,knownCostUsd:0}}}});
  if(result.status!=="accepted"||!result.projectId)throw new Error(JSON.stringify(result));
  console.log(JSON.stringify({status:result.status,projectCreated:true,schemaVersion:PUBLIC_SCHEMA_VERSION}));
}finally{await service.close();}
