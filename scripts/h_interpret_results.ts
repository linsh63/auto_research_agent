import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { PiResearchModel } from "../src/adapters/pi-model.js";
import { ReviewWorkflow } from "../src/application/review-workflow.js";
import { FactAuditStore } from "../src/infrastructure/db/fact-audit-store.js";
import { ReviewStore } from "../src/infrastructure/db/review-store.js";
import { hCaseDb,hCaseRoot,hStudyContext } from "./h_case_context.js";
import { ensureHFactLedger } from "./h_fact_ledger.js";

const root=hCaseRoot,study=hStudyContext(),analysis=JSON.parse(readFileSync(join(root,"analysis.json"),"utf8")),ledger=await ensureHFactLedger(),store=await ReviewStore.open(hCaseDb),facts=await FactAuditStore.open(hCaseDb);
try{const model=await PiResearchModel.create({providerId:"local-vllm",modelId:"qwen-local",baseUrl:process.env.H_LOCAL_LLM_BASE_URL??"http://127.0.0.1:18082/v1",apiKey:"local",api:"openai-completions",timeoutMs:180000,contextWindow:8192,maxTokens:1400,temperature:0}),workflow=new ReviewWorkflow(store,model,root,facts),output=await workflow.interpret({programId:study.programId,studyId:study.id,auditSnapshot:{question:"Does the candidate improve the frozen primary outcome?",scope:"Only the frozen H case.",analysis:analysis.analysis},factLedger:ledger}),artifact={model:model.id,usage:output.usage,interpretation:output.value,factLedgerId:ledger.id,createdAt:new Date().toISOString()};writeFileSync(join(root,"interpretation.json"),JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify(artifact,null,2));}finally{facts.close();store.close();}
