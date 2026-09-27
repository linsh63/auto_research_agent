import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BoundedExperimentSearch } from "../src/application/experiment-search.js";
import { StudyWorkflow } from "../src/application/study-workflow.js";
import { SearchStore } from "../src/infrastructure/db/search-store.js";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";
import { hCaseDb, hCaseRoot, hStudyContext } from "./h_case_context.js";

const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const root=hCaseRoot,db=hCaseDb,studyId=hStudyContext().id;
const load=(variant:string,seed:number)=>JSON.parse(readFileSync(join(root,"sandboxes",`${variant}-seed${seed}`,`${variant}-seed${seed}.json`),"utf8"));
const seeds=[11,23,47],baseline=seeds.map(seed=>load("baseline",seed)),candidate=seeds.map(seed=>load("augmix",seed));
for(const row of [...baseline,...candidate]){if(row.epochs!==12||row.phase!=="exploration"||row.dataManifestSha256!=="07de6e6cedf69dff6ddb99f724cb79172ab663a6001c9721830b2843efb1535d")throw new Error("Exploration artifact lineage mismatch");}
const groups=["brightness-severity3","defocus_blur-severity3"];const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const candidateMetric=mean(candidate.flatMap(row=>groups.map(group=>row.metrics[group].accuracy)));const artifactHash=createHash("sha256").update(JSON.stringify([...baseline,...candidate].map(row=>row.checkpointSha256))).digest("hex");
const studies=await StudyStore.open(db),searches=new SearchStore(db),research=await ResearchStore.open(db);
try{
 const study=studies.getStudy(studyId);if(study.status!=="exploring")throw new Error(`Expected exploring study, got ${study.status}`);const outcomes=studies.outcomes(studyId),primary=outcomes.find(item=>item.name==="mean corruption accuracy")!,clean=outcomes.find(item=>item.name==="clean accuracy")!,ece=outcomes.find(item=>item.name==="expected calibration error")!;
 for(const [variant,rows] of [["baseline",baseline],["candidate",candidate]] as const)for(const row of rows){for(const group of groups)studies.addObservation(studyId,{phase:"exploration",variant,seed:row.seed,group,outcomeId:primary.id,value:row.metrics[group].accuracy,missingReason:null,runId:`exploration-${variant}-${row.seed}`});studies.addObservation(studyId,{phase:"exploration",variant,seed:row.seed,group:"clean-validation",outcomeId:clean.id,value:row.metrics.validation.accuracy,missingReason:null,runId:`exploration-${variant}-${row.seed}`});studies.addObservation(studyId,{phase:"exploration",variant,seed:row.seed,group:"clean-validation",outcomeId:ece.id,value:row.metrics.validation.ece,missingReason:null,runId:`exploration-${variant}-${row.seed}`});}
 const hypothesis=research.getHypothesisSet(study.hypothesisSetId);const search=new BoundedExperimentSearch(searches);const nodes=await search.run({runId:"h-augmix-exploration",strategy:"linear",candidates:[{method:"AugMix",epochs:12,seeds}],budget:{maxCandidates:1,maxWallMs:1000,maxCostUsd:0.01,concurrency:1},runner:async()=>({metric:candidateMetric,costUsd:0,durationMs:candidate.reduce((sum,row)=>sum+row.wallSeconds*1000,0),artifactHash}),direction:"maximize",context:{protocolId:study.protocolId,hypothesisSetId:study.hypothesisSetId,predictionIds:hypothesis.hypotheses.flatMap(item=>item.discriminatingObservations)}});
 const workflow=new StudyWorkflow(studies,searches,research);const freeze=workflow.freezeBestCandidate(studyId,nodes[0]!.searchRunId,nodes[0]!.id,{codeHash:sha(resolve("examples/cifar-h/experiment-exploration-frozen.py")),configHash:sha(resolve("examples/cifar-h/config.json"))});const summary={baseline:baseline.map(row=>({seed:row.seed,mean:mean(groups.map(group=>row.metrics[group].accuracy)),clean:row.metrics.validation.accuracy,ece:row.metrics.validation.ece,checkpointSha256:row.checkpointSha256})),candidate:candidate.map(row=>({seed:row.seed,mean:mean(groups.map(group=>row.metrics[group].accuracy)),clean:row.metrics.validation.accuracy,ece:row.metrics.validation.ece,checkpointSha256:row.checkpointSha256})),candidateMetric,node:nodes[0],freeze};writeFileSync(join(root,"candidate-freeze.json"),JSON.stringify(summary,null,2)+"\n");console.log(JSON.stringify(summary,null,2));
}finally{research.close();searches.close();studies.close();}
