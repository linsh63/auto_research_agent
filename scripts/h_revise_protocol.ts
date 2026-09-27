import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";

const root=resolve(".research-data/cases/cifar-h"),db=join(root,"research.db");
const artifact=JSON.parse(readFileSync(join(root,"protocol-draft.json"),"utf8"));
const store=await ResearchStore.open(db);
try{
  const old=artifact.protocol;
  const revised=new WorkflowCoordinator(store).reviseDraftProtocol(artifact.programId,old.id,{
    assumptionRegisterId:old.assumptionRegisterId,hypothesisSetId:old.hypothesisSetId,
    primaryOutcome:old.primaryOutcome,secondaryOutcomes:old.secondaryOutcomes,exploratoryOutcomes:old.exploratoryOutcomes,experimentUnit:old.experimentUnit,dataRoles:old.dataRoles,analysisPlan:old.analysisPlan,
    stoppingRules:["Run exactly 12 epochs for every planned training run; never stop based on interim outcomes or p-values.","Stop as debug_reproduction if any baseline seed has clean validation accuracy below 0.65.","Stop as inconclusive if a required seed is missing or a frozen resource wall prevents analysis."],
    allowedChanges:["Retry a declared infrastructure failure before confirmation without changing code, configuration, seeds, outcomes, or analysis."],baselineTolerance:old.baselineTolerance,parentId:old.id,
  });
  const updated={...artifact,protocol:revised,revision:{reason:"Removed model-proposed p-value optional stopping; restored fixed 12-epoch design and deterministic terminal rules.",supersededProtocolId:old.id,createdAt:new Date().toISOString()}};
  writeFileSync(join(root,"protocol-draft.json"),JSON.stringify(updated,null,2)+"\n");console.log(JSON.stringify(revised,null,2));
}finally{store.close();}
