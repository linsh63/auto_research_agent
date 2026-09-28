import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import test from "node:test";
import { preflightBubblewrap,gpuDevicePaths } from "../src/adapters/bubblewrap-runner.js";
import { analyzePairedObservations } from "../src/adapters/statistics.js";
import { renderFactTemplate,renderStructuredReport } from "../src/application/structured-report.js";
import { assessDatasetSubstitution } from "../src/domain/data-substitution.js";
import { assertFactAudit,auditFactAssertions,createFactLedger } from "../src/domain/facts.js";
import { AnalysisPlanSchema,OutcomeDefinitionSchema,UnitObservationSchema } from "../src/domain/study.js";
import { applyMigrationTransaction } from "../src/infrastructure/db/research-store.js";

const now=new Date(0).toISOString(),sourceHash="a".repeat(64);
const ledger=createFactLedger({id:"ledger",programId:"program",studyId:"study",createdAt:now,requiredFactIds:["result.effect","result.interval_low"],facts:[
  {id:"result.effect",kind:"result",value:.1,unit:"proportion",sourceObjectId:"estimate",sourcePath:"estimate",sourceHash},
  {id:"result.interval_low",kind:"result",value:.025,unit:"proportion",sourceObjectId:"bootstrap",sourcePath:"interval95[0]",sourceHash},
  {id:"scope.dataset",kind:"scope",value:"COCO val2017",unit:null,sourceObjectId:"protocol",sourcePath:"scope.dataset",sourceHash},
]});

test("fact audit rejects factual drift and missing required assertions",()=>{
  const good=auditFactAssertions(ledger,"interpretation",[
    {factId:"result.effect",assertedValue:.1,context:"primary effect"},
    {factId:"result.interval_low",assertedValue:.025,context:"interval lower bound"},
  ],{requireAll:true});assert.equal(good.status,"pass");assert.doesNotThrow(()=>assertFactAudit(good));
  const drift=auditFactAssertions(ledger,"review",[{factId:"result.effect",assertedValue:.05,context:"hallucinated effect"}],{requireAll:true});
  assert.equal(drift.status,"fail");assert.deepEqual(drift.issues.map(issue=>issue.kind),["value_mismatch","missing_required"]);assert.throws(()=>assertFactAudit(drift),/value_mismatch:result.effect/);
});

test("structured reports resolve facts and reject free numeric claims",()=>{
  assert.equal(renderFactTemplate("The effect was {{result.effect}}.",ledger),"The effect was 0.1 proportion.");
  assert.throws(()=>renderFactTemplate("The effect was 0.05 and {{result.effect}}.",ledger),/Numeric literals are forbidden/);
  const report=renderStructuredReport({title:"Bounded result",blocks:[{type:"qualitative",text:"The frozen result passed its declared gate."},{type:"fact_text",template:"The observed effect was {{result.effect}}."},{type:"fact_table",title:"Verified facts",factIds:["result.effect","scope.dataset"]}]},ledger);
  assert.match(report,/0\.1 proportion/);assert.match(report,/COCO val2017/);assert.throws(()=>renderStructuredReport({title:"Bad",blocks:[{type:"qualitative",text:"The effect was 0.05."}]},ledger),/cannot contain numeric literals/);
});

test("generic experimental-unit analysis clusters repeated groups by unit ID",()=>{
  const outcome=OutcomeDefinitionSchema.parse({id:"outcome",studyId:"study",name:"accuracy",role:"primary",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:.01,createdAt:now});
  const plan=AnalysisPlanSchema.parse({id:"plan",studyId:"study",design:"paired_repeated_run",primaryOutcomeId:outcome.id,confidenceLevel:.95,multiplicityMethod:"none",missingPolicy:"fail",outlierPolicy:"Retain declared units.",status:"frozen",contentHash:sourceHash,createdAt:now});
  const observations=[];for(const unitId of ["image:1","image:2"])for(const group of ["positive","negative"]){observations.push(UnitObservationSchema.parse({id:`b-${unitId}-${group}`,studyId:"study",phase:"confirmation",variant:"baseline",unitId,group,outcomeId:outcome.id,value:.5,missingReason:null,runId:"baseline",createdAt:now}));observations.push(UnitObservationSchema.parse({id:`c-${unitId}-${group}`,studyId:"study",phase:"confirmation",variant:"candidate",unitId,group,outcomeId:outcome.id,value:unitId==="image:1"?.7:.6,missingReason:null,runId:"candidate",createdAt:now}));}
  const result=analyzePairedObservations(observations,plan,outcome);assert.equal(result.estimates[0]!.nUnits,2);assert.ok(Math.abs(result.estimates[0]!.estimate-.15)<1e-12);assert.equal(result.estimates[0]!.estimand,"candidate_minus_baseline_by_experimental_unit");assert.match(result.diagnostics.find(item=>item.name==="experimental_unit")!.details,/experimental units/);
});

test("runtime preflight exposes topology requirements before execution",t=>{const workspace=mkdtempSync(join(tmpdir(),"ara-preflight-"));t.after(()=>rmSync(workspace,{recursive:true,force:true}));assert.deepEqual(gpuDevicePaths("3",true).filter(path=>/^\/dev\/nvidia\d+$/.test(path)),["/dev/nvidia3","/dev/nvidia0","/dev/nvidia1","/dev/nvidia2"]);const good=preflightBubblewrap({workspace,command:"/usr/bin/python3",args:[],timeoutMs:1000});assert.equal(good.status,"pass");const bad=preflightBubblewrap({workspace:join(workspace,"missing"),command:"/missing/command",args:[],timeoutMs:1000});assert.equal(bad.status,"fail");assert.deepEqual(bad.checks.filter(check=>check.status==="fail").map(check=>check.name),["workspace","command"]);});

test("v1.3 migration preserves legacy seeds as typed units and rolls back on failure",t=>{const dir=mkdtempSync(join(tmpdir(),"ara-v13-migration-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));const makeV7=(path:string)=>{const db=new Database(path);db.pragma("foreign_keys = OFF");for(const file of ["003_research_protocol.sql","003b_research_cognitive_objects.sql","004_evidence_synthesis.sql","005_study_analysis.sql","006_claim_review_decision.sql"])db.exec(readFileSync(resolve("migrations",file),"utf8"));return db;};const migrated=makeV7(join(dir,"migrated.db")),createdAt=now;migrated.prepare("INSERT INTO research_programs(id,profile,status,payload_json,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("program","confirmatory","frozen","{}",sourceHash,createdAt,createdAt);migrated.prepare("INSERT INTO studies(id,program_id,protocol_id,hypothesis_set_id,evidence_map_id,status,payload_json,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("study","program","protocol","hypotheses","map","draft",JSON.stringify({seeds:[11,23]}),sourceHash,createdAt,createdAt);applyMigrationTransaction(migrated,readFileSync(resolve("migrations/007_reliability_foundations.sql"),"utf8"));assert.equal(migrated.pragma("user_version",{simple:true}),8);assert.deepEqual(migrated.prepare("SELECT unit_id FROM experimental_units ORDER BY unit_id").all(),[{unit_id:"seed:11"},{unit_id:"seed:23"}]);migrated.close();const failed=makeV7(join(dir,"failed.db")),migration=readFileSync(resolve("migrations/007_reliability_foundations.sql"),"utf8");assert.throws(()=>applyMigrationTransaction(failed,`${migration}\nCREATE TABLE broken (`));assert.equal(failed.pragma("user_version",{simple:true}),7);assert.equal(failed.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fact_ledgers'").get(),undefined);failed.close();});

test("dataset fallback cannot silently change the scientific contract",()=>{const base={original:{id:"POPEv2",experimentalUnit:"image",primaryOutcome:"object presence accuracy",targetConstruct:"typographic modality conflict"},replacement:{id:"COCO-val2017",experimentalUnit:"image",primaryOutcome:"object presence accuracy",targetConstruct:"typographic modality conflict"},unavailabilityEvidence:["download timed out from primary and mirror endpoints"],protocolFrozen:false,approvedDeviationId:null,scopeRevision:"Use COCO-val2017 with generated balanced questions."};assert.equal(assessDatasetSubstitution(base).decision,"accepted_pre_freeze");assert.equal(assessDatasetSubstitution({...base,protocolFrozen:true}).decision,"deviation_required");assert.equal(assessDatasetSubstitution({...base,protocolFrozen:true,approvedDeviationId:"deviation-1"}).decision,"accepted_with_deviation");assert.equal(assessDatasetSubstitution({...base,replacement:{...base.replacement,experimentalUnit:"question"}}).decision,"rejected");});
