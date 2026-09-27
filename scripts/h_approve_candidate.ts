import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { hCaseDb, hCaseRoot, hStudyContext } from "./h_case_context.js";
const root=hCaseRoot,studyId=hStudyContext().id;const summary=JSON.parse(readFileSync(join(root,"candidate-freeze.json"),"utf8"));const studies=await StudyStore.open(hCaseDb);try{const approved=studies.approveCandidate(studyId,"user");const issued=studies.issueConfirmationToken(studyId);const consumed=studies.consumeConfirmationToken(studyId,issued.token,"h-confirmation-once");const artifact={approved,tokenRecord:consumed.record,confirmationRole:consumed.confirmation,candidateSummary:{baseline:summary.baseline,candidate:summary.candidate},createdAt:new Date().toISOString()};writeFileSync(join(root,"confirmation-capability.json"),JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify(artifact,null,2));}finally{studies.close();}
