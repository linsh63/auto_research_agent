import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PiResearchModel } from "../src/adapters/pi-model.js";
import { QuestionCandidatesSchema } from "../src/application/review-workflow.js";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";
import { hashPayload } from "../src/domain/research.js";
import { ReviewStore } from "../src/infrastructure/db/review-store.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";

const root=resolve(".research-data/cases/cifar-h");
const db=join(root,"research.db");
const prior=JSON.parse(readFileSync(join(root,"scope-candidates.json"),"utf8")) as {programId:string};
const research=await ResearchStore.open(db);
const reviews=await ReviewStore.open(db);
try{
  const model=await PiResearchModel.create({providerId:"local-vllm",modelId:"qwen-local",baseUrl:process.env.H_LOCAL_LLM_BASE_URL??"http://127.0.0.1:18082/v1",apiKey:"local",api:"openai-completions",timeoutMs:180_000,contextWindow:8192,maxTokens:1500});
  const evidence=[
    {id:"guo-2017-calibration",title:"On Calibration of Modern Neural Networks",url:"https://proceedings.mlr.press/v70/guo17a.html",boundary:"Reports temperature scaling as an effective one-parameter post-hoc calibration method on held-out validation data; it does not establish effectiveness on every distribution shift."},
    {id:"hendrycks-dietterich-2019",title:"Benchmarking Neural Network Robustness to Common Corruptions and Perturbations",url:"https://arxiv.org/abs/1903.12261",boundary:"Introduces CIFAR-10-C corruption evaluation; corruption test data must not be used for training or method selection in this run."},
    {id:"hendrycks-etal-2020-augmix",title:"AugMix: A Simple Data Processing Method to Improve Robustness and Uncertainty",url:"https://openreview.net/forum?id=S1gmrxHFvB",boundary:"Reports limited-overhead augmentation improving corruption robustness and uncertainty; this run would test a small bounded implementation, not reproduce every published setting."},
    {id:"zhang-etal-2018-mixup",title:"mixup: Beyond Empirical Risk Minimization",url:"https://openreview.net/forum?id=r1Ddp1-Rb",boundary:"Defines convex input/label interpolation; corruption robustness in this run remains an empirical question."},
  ];
  const input={direction:"Compare one low-cost intervention with standard training for a small CIFAR-10 classifier, then evaluate on held-out CIFAR-10-C corruption groups.",evidence,constraints:{pairedSeeds:3,gpuHours:12,primaryOutcomes:["mean corruption accuracy","worst-group corruption accuracy","calibration error"],confirmation:"held-out corruption groups inaccessible until candidate freeze"}};
  const inputHash=hashPayload(input);
  const session=reviews.addRoleSession({programId:prior.programId,role:"researcher",providerModel:model.id,sessionKind:"independent",toolAccess:["read:verified-evidence"],inputHash,independence:"session"});
  const startedAt=new Date().toISOString();
  try{
    const output=await model.generate("scope-question-refinement",input,QuestionCandidatesSchema,"Propose exactly three candidates in this order: (1) temperature scaling with primaryOutcome exactly 'calibration error'; (2) AugMix with primaryOutcome exactly 'mean corruption accuracy'; (3) Mixup with primaryOutcome exactly 'worst-group corruption accuracy'. Temperature scaling is fit only on clean validation logits. AugMix is an image augmentation consistency method; do not describe it as mixing labels. Mixup interpolates inputs and labels. Every comparator is the same architecture under standard training without the intervention. Training uses CIFAR-10 train only and confirmation CIFAR-10-C groups remain held out. Fill every field. Do not invent results or novelty.");
    reviews.addModelInvocation({programId:prior.programId,roleSessionId:session.id,stage:"scope-question-refinement",providerModel:model.id,status:"completed",inputHash,outputHash:hashPayload(output.raw),outputText:output.raw,usage:output.usage,knownCostUsd:0,error:null,createdAt:startedAt});
    const workflow=new WorkflowCoordinator(research);
    const questions=output.value.candidates.map(candidate=>workflow.proposeQuestion(prior.programId,{...candidate,sourceIds:evidence.map(item=>item.id)}));
    const artifact={programId:prior.programId,model:model.id,usage:output.usage,inputHash,evidence,candidates:questions,createdAt:new Date().toISOString()};
    const path=join(root,"scope-candidates-refined.json");writeFileSync(path,JSON.stringify(artifact,null,2)+"\n");
    console.log(JSON.stringify({programId:prior.programId,path,candidates:questions.map(({id,question,rationale,intervention,comparator,primaryOutcome,scope})=>({id,question,rationale,intervention,comparator,primaryOutcome,scope}))},null,2));
  }catch(error){reviews.addModelInvocation({programId:prior.programId,roleSessionId:session.id,stage:"scope-question-refinement",providerModel:model.id,status:error instanceof Error&&/timed out/i.test(error.message)?"timed_out":"failed",inputHash,outputHash:null,outputText:null,usage:null,knownCostUsd:0,error:error instanceof Error?error.message:String(error),createdAt:startedAt});throw error;}
}finally{reviews.close();research.close();}
