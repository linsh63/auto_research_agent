import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { hCaseDb, hCaseRoot, hStudyContext } from "./h_case_context.js";

const root=hCaseRoot,studyId=hStudyContext().id;
const rows=[11,23,47].map(seed=>JSON.parse(readFileSync(join(root,"sandboxes",`baseline-seed${seed}`,`baseline-seed${seed}.json`),"utf8")));
const hash=createHash("sha256").update(JSON.stringify(rows.map(row=>row.checkpointSha256))).digest("hex");const studies=await StudyStore.open(hCaseDb);
try{const gate=studies.recordBaseline(studyId,{expectedMin:0.65,expectedMax:1,observed:Math.min(...rows.map(row=>row.metrics.validation.accuracy)),artifactHash:hash});const exploring=studies.beginExploration(studyId);const clean=studies.outcomes(studyId).find(item=>item.name==="clean accuracy")!;for(const row of rows)studies.addObservation(studyId,{phase:"baseline",variant:"baseline",seed:row.seed,group:"clean-validation",outcomeId:clean.id,value:row.metrics.validation.accuracy,missingReason:null,runId:`baseline-seed${row.seed}`});const artifact={gate,study:exploring,rows:rows.map(row=>({seed:row.seed,validation:row.metrics.validation,checkpointSha256:row.checkpointSha256,wallSeconds:row.wallSeconds}))};writeFileSync(join(root,"baseline-gate.json"),JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify(artifact,null,2));}finally{studies.close();}
