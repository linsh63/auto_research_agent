import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { PiResearchModel } from "../src/adapters/pi-model.js";
import { QuestionCandidatesSchema } from "../src/application/review-workflow.js";
import { hashPayload } from "../src/domain/research.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";
import { EvidenceSynthesisStore } from "../src/infrastructure/db/evidence-synthesis-store.js";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { ReviewStore } from "../src/infrastructure/db/review-store.js";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";

const root=resolve(".research-data/cases/cifar-h");mkdirSync(root,{recursive:true});const db=join(root,"research.db");
const research=await ResearchStore.open(db);const synthesis=await EvidenceSynthesisStore.open(db);const studies=await StudyStore.open(db);const reviews=await ReviewStore.open(db);
try{
  const model=await PiResearchModel.create({providerId:"local-vllm",modelId:"qwen-local",baseUrl:process.env.H_LOCAL_LLM_BASE_URL??"http://127.0.0.1:18082/v1",apiKey:"local",api:"openai-completions",timeoutMs:180_000,contextWindow:8192,maxTokens:1600});
  const direction="Under a single-GPU, 12-GPU-hour budget, study low-cost robustness or calibration of a small CIFAR-10 classifier under CIFAR-10-C distribution shifts. The question must support a clean exploration/confirmation split and paired training seeds.";
  const evidence=[
    {id:"seed-cifar10",title:"CIFAR-10 dataset",boundary:"Public 32x32 natural-image classification benchmark with fixed train/test data."},
    {id:"seed-cifar10c",title:"Benchmarking Neural Network Robustness to Common Corruptions and Perturbations",boundary:"CIFAR-10-C provides fixed common-corruption types and severities for robustness evaluation."},
    {id:"seed-calibration",title:"On Calibration of Modern Neural Networks",boundary:"Calibration error and temperature scaling are relevant secondary concepts; this run must not claim calibration improvement without predeclared metrics."},
  ];
  const program=research.createProgram({title:"CIFAR robustness H acceptance",direction,domain:"AI / computer vision",constraints:["single GPU","12 GPU-hours","24 hours","20 model calls"],allowedData:["CIFAR-10","CIFAR-10-C"],prohibitions:["no confirmation access before candidate freeze","no hidden remote training","no post-confirmation tuning"],profile:"confirmatory"});
  const input={direction,evidence,constraints:{gpuHours:12,wallHours:24,diskGiB:20,modelCalls:20,knownCostUsd:10,confirmation:"held-out CIFAR-10-C corruption groups"}};const inputHash=hashPayload(input);const session=reviews.addRoleSession({programId:program.id,role:"researcher",providerModel:model.id,sessionKind:"independent",toolAccess:["read:seed-evidence"],inputHash,independence:"session"});const startedAt=new Date().toISOString();
  try{const output=await model.generate("scope-question-candidates",input,QuestionCandidatesSchema,"Return exactly three feasible CIFAR-10 research questions. Use only lightweight fixed classifiers. For each candidate fill every schema field with concise text. Each intervention must be a concrete low-cost training or post-hoc calibration change; each comparator must be standard training; each primaryOutcome must be one of clean accuracy, mean corruption accuracy, worst-group corruption accuracy, or calibration error. Use held-out corruption groups and do not claim novelty.");reviews.addModelInvocation({programId:program.id,roleSessionId:session.id,stage:"scope-question-candidates",providerModel:model.id,status:"completed",inputHash,outputHash:hashPayload(output.raw),outputText:output.raw,usage:output.usage,knownCostUsd:0,error:null,createdAt:startedAt});const workflow=new WorkflowCoordinator(research);const questions=output.value.candidates.map(candidate=>workflow.proposeQuestion(program.id,{...candidate,sourceIds:evidence.map(item=>item.id)}));const artifact={programId:program.id,model:model.id,usage:output.usage,inputHash,candidates:questions,createdAt:new Date().toISOString()};const path=join(root,"scope-candidates.json");writeFileSync(path,JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify({programId:program.id,model:model.id,path,candidates:questions.map(({id,question,rationale,primaryOutcome,scope})=>({id,question,rationale,primaryOutcome,scope}))},null,2));}catch(error){reviews.addModelInvocation({programId:program.id,roleSessionId:session.id,stage:"scope-question-candidates",providerModel:model.id,status:error instanceof Error&&/timed out/i.test(error.message)?"timed_out":"failed",inputHash,outputHash:null,outputText:null,usage:null,knownCostUsd:0,error:error instanceof Error?error.message:String(error),createdAt:startedAt});throw error;}
}finally{reviews.close();studies.close();synthesis.close();research.close();}
