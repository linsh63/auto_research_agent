import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SkillCatalog } from "../src/adapters/skills.js";
import { EvidenceSynthesisService } from "../src/application/evidence-synthesis.js";
import { assertNoveltyValid } from "../src/domain/evidence-synthesis.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { EvidenceSynthesisStore } from "../src/infrastructure/db/evidence-synthesis-store.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";

function hypothesis(kind: "target" | "null" | "rival", statement: string, evidenceIds: string[]) {
  return {
    kind, statement,
    prediction: `A discriminating prediction for ${kind} under the declared comparison.`,
    falsification: `A bounded observation that would falsify the ${kind} explanation.`,
    assumptionIds: [], discriminatingObservations: [`A held-out observation that discriminates the ${kind} explanation.`],
    updateRules: [{ observation: `The held-out result matches the ${kind} prediction.`, effect: "strengthen" as const, rationale: "This result was declared before confirmation." }],
    evidenceIds,
  };
}

test("F evidence map enforces provenance, novelty and explicit capability invocation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-evidence-synthesis-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = join(dir, "research.db");
  const research = await ResearchStore.open(db); const workflow = new WorkflowCoordinator(research);
  const program = workflow.createIntent({ title: "Evidence synthesis fixture", direction: "Study a bounded robustness question using public image classification evidence.", allowedData: ["public"], constraints: [], prohibitions: [], profile: "confirmatory" });
  const question = workflow.proposeQuestion(program.id, { question: "Does the declared training change improve held-out corruption robustness?", rationale: "The question is measurable and can distinguish robustness from clean-accuracy effects.", targetPopulation: "small image classifiers", intervention: "declared training change", comparator: "frozen baseline", primaryOutcome: "held-out robustness accuracy", scope: "one public benchmark and one lightweight classifier", sourceIds: ["source-support"] });
  workflow.selectQuestion(program.id, question.id); workflow.approveScope(program.id);

  const evidence = new EvidenceStore(db);
  evidence.upsertSource({ id: "source-support", title: "Full-text robustness study", authors: ["A"], year: 2025, abstract: "A robustness result.", identifiers: [], sourceUrl: "https://example.org/support", accessUrl: "https://example.org/support", accessStatus: "open", license: "cc-by", origin: "fixture", accessedAt: new Date().toISOString() });
  evidence.addDocumentVersion({ id: "doc-support", sourceId: "source-support", artifactHash: null, contentType: "text", parser: "fixture", parserVersion: "1", parserConfigHash: "fixture", contentHash: "a".repeat(64), status: "parsed", warning: null, createdAt: new Date().toISOString() });
  evidence.addPassage({ id: "passage-support", documentVersionId: "doc-support", parentId: null, kind: "paragraph", sectionPath: ["Results"], text: "The intervention improves corruption robustness under the bounded protocol.", pageStart: 1, pageEnd: 1, charStart: 0, charEnd: 72, locatorHash: "support-locator", ordinal: 0 });
  evidence.addClaim({ id: "claim-premise", runId: program.id, kind: "fact", text: "A bounded robustness effect was reported.", status: "reviewed", createdAt: new Date().toISOString() });

  const synthesis = await EvidenceSynthesisStore.open(db);
  assert.ok(synthesis.migrationBackupPath && existsSync(synthesis.migrationBackupPath));
  assert.ok(synthesis.artifactManifestSnapshotPath && existsSync(synthesis.artifactManifestSnapshotPath));
  assert.throws(()=>synthesis.createSearchProtocol(program.id,{queryFamilies:[{id:"only-problem",kind:"problem",queries:["incomplete search"],rationale:"This invalid draft must never be persisted."}],databases:["fixture"],startYear:2020,endYear:2026,inclusionCriteria:["Relevant"],exclusionCriteria:["Irrelevant"],stopConditions:["Stop"]}),/requires problem, method and adjacent/);
  assert.equal(synthesis.listSearchProtocols(program.id).length,0);
  const search = synthesis.createSearchProtocol(program.id, { queryFamilies: [
    { id: "q-problem", kind: "problem", queries: ["image classifier distribution shift"], rationale: "Find work defining the deployment problem." },
    { id: "q-method", kind: "method", queries: ["training method corruption robustness"], rationale: "Find directly comparable training methods." },
    { id: "q-adjacent", kind: "adjacent", queries: ["calibration under image corruption"], rationale: "Find adjacent explanations and metrics." },
    { id: "q-refute", kind: "refutation", queries: ["augmentation robustness failure"], rationale: "Seek disconfirming or negative evidence." },
  ], databases: ["fixture"], startYear: 2020, endYear: 2026, inclusionCriteria: ["Public AI/ML study with a relevant result."], exclusionCriteria: ["No relevant method or outcome."], stopConditions: ["Two rounds add no relevant work."] });
  synthesis.freezeSearchProtocol(program.id, search.id);
  assert.throws(() => synthesis.screen({ searchProtocolId: search.id, sourceId: "source-support", documentVersionId: "doc-support", decision: "include", reason: "A mismatched version hash must be rejected.", actor: "fixture-reviewer", sourceVersionHash: "b".repeat(64) }), /does not match/);
  synthesis.screen({ searchProtocolId: search.id, sourceId: "source-support", documentVersionId: "doc-support", decision: "include", reason: "Direct full-text result for the bounded method.", actor: "fixture-reviewer", sourceVersionHash: "a".repeat(64) });

  const map1 = synthesis.createEvidenceMap(program.id, { searchProtocolId: search.id, coverageStatus: "incomplete", noveltyStatus: "unresolved", noveltyScope: null });
  const direct = synthesis.addEntry(map1.id, { claimId: "claim-premise", sourceId: "source-support", passageId: "passage-support", relation: "premise_support", topic: "result", summary: "Full-text evidence supports a critical bounded premise.", evidenceLevel: "full_text", critical: true });
  synthesis.addEntry(map1.id, { claimId: null, sourceId: "source-support", passageId: null, relation: "background", topic: "problem", summary: "The abstract supplies background context only.", evidenceLevel: "abstract", critical: false });
  assert.throws(() => synthesis.addEntry(map1.id, { claimId: null, sourceId: "source-support", passageId: null, relation: "background", topic: "result", summary: "Background must not satisfy a critical premise.", evidenceLevel: "abstract", critical: true }), /Background evidence/);
  assert.throws(() => synthesis.addEntry(map1.id, { claimId: null, sourceId: "source-support", passageId: null, relation: "direct_result", topic: "result", summary: "An abstract cannot serve as a direct result.", evidenceLevel: "abstract", critical: false }), /full-text passage/);
  synthesis.addGap(map1.id, { kind: "full_text_unavailable", description: "A potentially relevant contrary source is available only as metadata.", severity: "high", sourceId: null, resolved: false });
  assert.throws(() => assertNoveltyValid({ ...map1, noveltyStatus: "likely_overlap" }, [], synthesis.gaps(map1.id)), /novelty=unresolved/);
  synthesis.freezeEvidenceMap(program.id, map1.id);

  const map2 = synthesis.createEvidenceMap(program.id, { searchProtocolId: search.id, coverageStatus: "complete", noveltyStatus: "supported_with_scope", noveltyScope: "This exact low-cost training comparison on the declared corruption split.", parentId: map1.id });
  const direct2 = synthesis.addEntry(map2.id, { claimId: "claim-premise", sourceId: "source-support", passageId: "passage-support", relation: "premise_support", topic: "novelty", summary: "The passage anchors comparison with the closest bounded study.", evidenceLevel: "full_text", critical: true });
  const refute2 = synthesis.addEntry(map2.id, { claimId: null, sourceId: "source-support", passageId: "passage-support", relation: "refutation", topic: "limitation", summary: "The same source records a bounded alternative explanation.", evidenceLevel: "full_text", critical: false });
  synthesis.addClosestWork(map2.id, { sourceId: "source-support", proposedClaim: "A scoped distinction from the closest robustness setup.", overlap: "Both evaluate corruption robustness.", distinction: "The proposed comparison uses the declared low-cost intervention and held-out groups.", evidencePassageIds: ["passage-support"], status: "partial_overlap" });
  const frozenMap2 = synthesis.freezeEvidenceMap(program.id, map2.id);
  assert.notEqual(frozenMap2.contentHash, map2.contentHash);

  const assumption = workflow.addAssumption(question.id, { statement: "Corruption labels remain valid for the bounded evaluation.", invalidationCondition: "A label audit finds systematic errors.", evidenceIds: [direct2.id] });
  const register = workflow.createAssumptionRegister(question.id, [assumption.id]); workflow.freezeAssumptionRegister(question.id, register.id);
  const skillRoot = join(dir, "skills");
  for (const name of ["paper-search", "hypothesis-generation"]) { mkdirSync(join(skillRoot, name), { recursive: true }); writeFileSync(join(skillRoot, name, "SKILL.md"), `# ${name}\nFixture capability.`); }
  const service = new EvidenceSynthesisService(synthesis, research, new SkillCatalog(skillRoot));
  const evidenceCapability = service.registerCapabilities("build-evidence-map")[0]!;
  const invocation = service.startCapability(program.id, evidenceCapability, "build-evidence-map", { query: "robustness" }, "The capability matches evidence search.");
  service.finishCapability(invocation.id, { mapId: map2.id });
  const set = service.createEvidenceBoundHypothesisSet(program.id, frozenMap2.id, { hypotheses: [
    hypothesis("target", "The intervention improves robustness on held-out corruption groups.", [direct2.id]),
    hypothesis("null", "The intervention has no meaningful effect on held-out corruption robustness.", []),
    hypothesis("rival", "Any apparent robustness gain is explained by clean-accuracy changes.", [refute2.id]),
  ] });
  workflow.freezeHypothesisSet(program.id, set.id);
  assert.ok(research.hypothesisSets(program.id).at(-1)!.hypotheses.every((item) => item.status === "active"));
  assert.deepEqual(synthesis.counts(), { searchProtocols: 1, screenings: 1, maps: 2, entries: 4, gaps: 1, comparisons: 1, manifests: 1, invocations: 1 });
  synthesis.close(); evidence.close(); research.close();
});
