import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { z } from "zod";
import type { ModelOutput, ResearchModel } from "../src/adapters/pi-model.js";
import { ReviewWorkflow } from "../src/application/review-workflow.js";
import { auditFactAssertions,createFactLedger } from "../src/domain/facts.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { FactAuditStore } from "../src/infrastructure/db/fact-audit-store.js";
import { ReviewStore } from "../src/infrastructure/db/review-store.js";
import { applyMigrationTransaction } from "../src/infrastructure/db/research-store.js";

class ReviewFixtureModel implements ResearchModel {
  readonly id = "fixture/reviewer";
  async generate<T>(stage: string, _input: unknown, schema: z.ZodType<T>): Promise<ModelOutput<T>> {
    if(stage==="result-interpretation"){const payload={summary:"The bounded deterministic result supports a cautious interpretation.",claim:"The candidate has a bounded positive effect.",scope:"Only the frozen fixture study.",grade:"suggestive",alternativeExplanations:["Sampling variation may contribute."],invalidationConditions:["A replication reverses the direction."],recommendedAction:"publish_bounded_result",factAssertions:[{factId:"result.effect",assertedValue:.1,context:"primary effect"}]};return{value:schema.parse(payload),raw:JSON.stringify(payload),usage:{totalTokens:0}};}
    const needsWork = stage === "review-methods";
    const payload = {
      verdict: needsWork ? "needs_work" : "sound",
      confidence: "high",
      summary: needsWork
        ? "The methods review found one bounded issue requiring an explicit limitation response."
        : `The ${stage} snapshot is internally consistent within the supplied fixture.`,
      findings: needsWork ? [{
        severity: "major", location: "Study design",
        observation: "The fixture has only three independent training seeds.",
        criterion: "Precision and independent replication",
        whyItMatters: "The effect interval is wide and generalization is limited.",
        requestedAction: "Restrict the claim and retain the small-seed limitation.",
      }] : [],factAssertions:[{factId:"result.effect",assertedValue:.1,context:"primary effect"}],
    };
    return { value: schema.parse(payload), raw: JSON.stringify(payload), usage: { totalTokens: 0 } };
  }
}

class FactDriftModel implements ResearchModel{
  readonly id="fixture/drift-reviewer";
  async generate<T>(_stage:string,_input:unknown,schema:z.ZodType<T>):Promise<ModelOutput<T>>{const payload={verdict:"sound",confidence:"high",summary:"The supplied result appears internally consistent but contains an injected factual error.",factAssertions:[{factId:"result.effect",assertedValue:.05,context:"primary effect"}],findings:[]};return{value:schema.parse(payload),raw:JSON.stringify(payload),usage:{totalTokens:0}};}
}

test("H four-dimensional review blocks unresolved findings and emits a bounded report", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-h-review-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "research.db");
  const raw = new Database(dbPath);
  raw.pragma("foreign_keys = OFF");
  for (const file of [
    "migrations/003_research_protocol.sql", "migrations/003b_research_cognitive_objects.sql",
    "migrations/004_evidence_synthesis.sql", "migrations/005_study_analysis.sql",
  ]) raw.exec(readFileSync(resolve(file), "utf8"));
  const now = new Date().toISOString();
  raw.prepare("INSERT INTO research_programs(id,profile,status,payload_json,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run("program", "confirmatory", "frozen", "{}", "a".repeat(64), now, now);
  raw.prepare("INSERT INTO studies(id,program_id,protocol_id,hypothesis_set_id,evidence_map_id,status,payload_json,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("study", "program", "protocol", "hypotheses", "map", "analyzed", JSON.stringify({reliabilityPolicy:"fact_bound_v1"}), "b".repeat(64), now, now);
  raw.prepare("INSERT INTO analysis_plans(id,study_id,status,payload_json,content_hash,created_at) VALUES(?,?,?,?,?,?)")
    .run("plan", "study", "frozen", "{}", "c".repeat(64), now);
  raw.prepare("INSERT INTO analysis_runs(id,study_id,analysis_plan_id,status,payload_json,created_at) VALUES(?,?,?,?,?,?)")
    .run("analysis", "study", "plan", "completed", "{}", now);
  raw.prepare("INSERT INTO statistical_estimates(id,analysis_run_id,payload_json,created_at) VALUES(?,?,?,?)")
    .run("estimate", "analysis", "{}", now);
  raw.prepare("INSERT INTO evidence_maps(id,program_id,question_id,search_protocol_id,version,status,coverage_status,novelty_status,payload_json,content_hash,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("map", "program", "question", "search", 1, "frozen", "complete", "unresolved", "{}", "d".repeat(64), null, now);
  raw.prepare("INSERT INTO evidence_map_entries(id,map_id,source_id,passage_id,claim_id,relation,topic,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("evidence-entry", "map", "source", null, null, "background", "problem", "{}", now);
  raw.close();

  const evidence = new EvidenceStore(dbPath);
  evidence.addClaim({ id: "claim", runId: "program", kind: "result", text: "The candidate showed a bounded descriptive improvement.", status: "reviewed", createdAt: now });
  evidence.close();

  const store = await ReviewStore.open(dbPath);
  assert.ok(store.migrationBackupPath);
  const factStore=await FactAuditStore.open(dbPath);const ledger=factStore.addLedger(createFactLedger({id:"fixture-ledger",programId:"program",studyId:"study",facts:[{id:"result.effect",kind:"result",value:.1,unit:"proportion",sourceObjectId:"estimate",sourcePath:"estimate",sourceHash:"a".repeat(64)}],requiredFactIds:["result.effect"]}));
  assert.throws(()=>store.addClaimAssessment({programId:"program",studyId:"study",claimId:"claim",claimText:"The effect was 0.05.",scope:"Only the bounded fixture study.",protocolId:"protocol",evidenceMapId:"map",analysisRunId:"analysis",estimateIds:["estimate"],supportingEvidenceIds:["estimate"],opposingEvidenceIds:[],alternativeExplanations:["Sampling variation."],invalidationConditions:["Replication reverses it."],grade:"suggestive",factLedgerId:null,claimFactIds:[],claimTemplate:null}),/Fact-bound study requires/);
  const assessment = new ReviewWorkflow(store,undefined,dir).addFactBoundAssessment({
    programId: "program", studyId: "study", claimId: "claim",
    claimTemplate: "The candidate effect was {{result.effect}}.",factLedgerId:ledger.id,claimFactIds:["result.effect"],
    scope: "Only the declared fixture seeds and groups.", protocolId: "protocol", evidenceMapId: "map",
    analysisRunId: "analysis", estimateIds: ["estimate"], supportingEvidenceIds: ["estimate", "evidence-entry"], opposingEvidenceIds: [],
    alternativeExplanations: ["Training-seed variation may explain part of the estimate."],
    invalidationConditions: ["A larger confirmation run reverses the effect."], grade: "suggestive",
  });
  store.addThreat({ claimAssessmentId: assessment.id, kind: "external", severity: "high", description: "The fixture does not establish cross-dataset generalization.", mitigation: "Restrict the claim scope." });
  const driftWorkflow=new ReviewWorkflow(store,new FactDriftModel(),dir,factStore);await driftWorkflow.review({programId:"program",studyId:"study",dimension:"evidence",auditSnapshot:{estimate:.1},factLedger:ledger});assert.equal(factStore.audits(ledger.id)[0]!.status,"fail");assert.equal(factStore.audits(ledger.id).some(item=>item.stage==="review-evidence-deterministic-repair"&&item.status==="pass"),true);
  const workflow = new ReviewWorkflow(store, new ReviewFixtureModel(), dir);
  await assert.rejects(workflow.review({programId:"program",studyId:"study",dimension:"evidence",auditSnapshot:{},independence:"session"}),/requires a FactLedger/);
  const auditedWorkflow=new ReviewWorkflow(store,new ReviewFixtureModel(),dir,factStore);
  const snapshot = { assessmentId: assessment.id, protocolId: "protocol", analysisRunId: "analysis", evidenceMapId: "map" };
  for (const dimension of ["evidence", "methods", "statistics", "reproducibility"] as const) {
    if(!store.reviews("study").some(item=>item.dimension===dimension))await auditedWorkflow.review({programId:"program",studyId:"study",dimension,auditSnapshot:snapshot,factLedger:ledger});
  }
  assert.equal(store.modelInvocations("program").length,4);
  assert.equal(store.reviews("study").length, 4);
  assert.throws(() => workflow.finalize({ programId: "program", studyId: "study", action: "publish_bounded_result", rationale: "The bounded fixture result can be reported with its limitations.", claimAssessmentIds: [assessment.id], approvedBy: "researcher" }), /Major review findings/);
  const major = store.findings("study").find((item) => item.severity === "major")!;
  store.respond({ reviewId: major.reviewId, findingId: major.id, disposition: "accepted_limitation", response: "The claim is restricted to three seeds and no broader generalization is asserted.", evidenceIds: [assessment.id], actor: "researcher" });
  assert.throws(()=>workflow.finalize({programId:"program",studyId:"study",action:"publish_bounded_result",rationale:"The bounded result passed all required gates.",claimAssessmentIds:[assessment.id],approvedBy:"researcher"}),/requires passing audit interpretation/);
  await auditedWorkflow.interpret({programId:"program",studyId:"study",auditSnapshot:snapshot,factLedger:ledger});
  const repairAssertions=ledger.requiredFactIds.map(factId=>({factId,assertedValue:ledger.facts.find(item=>item.id===factId)!.value,context:"Test deterministic audit alias."}));for(const stage of ["review-evidence","review-methods","review-statistics","review-reproducibility"])factStore.addAudit(auditFactAssertions(ledger,stage,repairAssertions,{requireAll:true}));
  assert.equal(store.modelInvocations("program").length,5);
  store.addReproductionManifest({ programId: "program", studyId: "study", codeHashes: ["e".repeat(64)], dataManifestHashes: ["f".repeat(64)], protocolHash: "1".repeat(64), analysisPlanHash: "2".repeat(64), environment: { node: process.version }, commands: [["npm", "test"]], artifactHashes: [] });
  const decision = workflow.finalize({ programId: "program", studyId: "study", action: "publish_bounded_result", rationale: "All major findings are resolved and the claim remains explicitly bounded to the fixture.", claimAssessmentIds: [assessment.id], approvedBy: "researcher" });
  const report = workflow.writeReport("program", "study", decision);
  assert.ok(existsSync(report.path));
  assert.match(readFileSync(report.path, "utf8"), /Only the declared fixture seeds/);
  assert.match(readFileSync(report.path,"utf8"),/The candidate effect was 0\.1 proportion/);
  const statusDb = new Database(dbPath, { readonly: true });
  assert.equal((statusDb.prepare("SELECT status FROM studies WHERE id='study'").get() as { status: string }).status, "closed");
  assert.equal((statusDb.prepare("SELECT status FROM research_programs WHERE id='program'").get() as { status: string }).status, "closed");
  statusDb.close();
  factStore.close();
  store.close();
});

test("H migration failure rolls back schema 006 atomically", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-h-migration-failure-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = new Database(join(dir, "research.db"));
  for (const file of [
    "migrations/003_research_protocol.sql", "migrations/003b_research_cognitive_objects.sql",
    "migrations/004_evidence_synthesis.sql", "migrations/005_study_analysis.sql",
  ]) raw.exec(readFileSync(resolve(file), "utf8"));
  const migration = readFileSync(resolve("migrations/006_claim_review_decision.sql"), "utf8");
  assert.throws(() => applyMigrationTransaction(raw, `${migration}\nCREATE TABLE broken (`));
  assert.equal(raw.pragma("user_version", { simple: true }), 6);
  const table = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='structured_reviews'").get();
  assert.equal(table, undefined);
  raw.close();
});
