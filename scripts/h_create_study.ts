import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { hCaseDb, hCaseRoot, hProtocolContext } from "./h_case_context.js";

const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const root=hCaseRoot,db=hCaseDb,visible=join(root,"data/prepared/exploration"),sealed=join(root,"capability/confirmation"),context=hProtocolContext();
const studies=await StudyStore.open(db);
try{
 const study=studies.createStudy({programId:context.programId,protocolId:context.protocol.id,hypothesisSetId:context.protocol.hypothesisSetId,evidenceMapId:context.evidenceMapId,experimentalUnit:"independently trained seed",design:"seed_by_corruption",seeds:[11,23,47],blockingFactors:["corruption group"],nuisanceFactors:["training seed"],randomizationSeed:42});
 const outcomes=[studies.addOutcome(study.id,{name:"mean corruption accuracy",role:"primary",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:0.01}),studies.addOutcome(study.id,{name:"clean accuracy",role:"secondary",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:0.01}),studies.addOutcome(study.id,{name:"expected calibration error",role:"secondary",direction:"minimize",unit:"proportion",minimumMeaningfulEffect:0.01}),studies.addOutcome(study.id,{name:"worst-group corruption accuracy",role:"exploratory",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:0.01})];
 const visibleHash=sha(join(visible,"manifest.json")),sealedHash=sha(join(root,"confirmation-spec.json"));studies.addDataRole(study.id,{role:"train",path:visible,manifestHash:visibleHash,sealed:false});studies.addDataRole(study.id,{role:"validation",path:visible,manifestHash:visibleHash,sealed:false});studies.addDataRole(study.id,{role:"confirmation",path:sealed,manifestHash:sealedHash,sealed:true});
 const plan=studies.addAnalysisPlan(study.id,{design:"seed_by_corruption",primaryOutcomeId:outcomes[0]!.id,confidenceLevel:0.95,multiplicityMethod:"none",missingPolicy:"fail",outlierPolicy:"Retain all three predeclared seeds; do not remove statistical outliers."});
 const policy=studies.addDeviationPolicy(study.id,{allowedBeforeConfirmation:["Retry a declared infrastructure failure with identical frozen inputs."],forbiddenAfterVisibility:["change code","change checkpoint","change primary outcome","change corruption groups","delete seed","repeat confirmation"],failedRunPolicy:"retain_and_analyze",missingValuePolicy:"fail"});
 const frozen=studies.freezeStudy(study.id);const artifact={study:frozen,outcomes,analysisPlan:plan,deviationPolicy:policy,visibleManifestHash:visibleHash,sealedManifestHash:sealedHash};writeFileSync(join(root,"study.json"),JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify(artifact,null,2));
}finally{studies.close();}
