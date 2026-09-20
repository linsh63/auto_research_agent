import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";
import { BriefSchema } from "../src/core/schema.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { ProjectConfigSchema, loadProjectConfig } from "../src/infrastructure/config/config.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";
import { Ledger } from "../src/core/ledger.js";

function question() {
  return {
    question: "Does a low-cost image classifier retain accuracy under common distribution shifts?",
    rationale: "The direction is relevant to deployment, while corruption groups provide a bounded and observable stress test.",
    targetPopulation: "Small public natural-image classification datasets",
    intervention: "A declared training or calibration change",
    comparator: "The frozen baseline training procedure",
    primaryOutcome: "Mean corruption accuracy on held-out corruption groups",
    scope: "One small classifier and the declared CIFAR corruption profile only.",
    sourceIds: ["source-cv-1"],
  };
}

function protocol() {
  return {
    primaryOutcome: "mean_corruption_accuracy",
    secondaryOutcomes: ["clean_accuracy"],
    exploratoryOutcomes: ["calibration_error"],
    experimentUnit: "one model training seed evaluated on one declared corruption group",
    dataRoles: { train: "cifar-train", validation: "cifar-validation", confirmation: "cifar-confirmation-sealed" },
    analysisPlan: "Compare paired training seeds across the declared corruption groups and report the raw difference with a 95% interval.",
    stoppingRules: ["Stop at the GPU or wall-clock hard limit.", "Stop if baseline reproduction is outside the declared tolerance."],
    allowedChanges: ["Change only the declared training parameter grid during exploration."],
    baselineTolerance: "Within the predeclared validation interval of the reference implementation.",
  };
}

test("E state graph enforces scope, protocol freeze, visibility and derivation", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-research-protocol-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = join(dir, "research.db");
  const ledger = new Ledger(db);
  const legacyRun = ledger.create({
    title: "Legacy v1.1 run", question: "Does a fixed candidate improve this controlled task?", keywords: ["baseline"],
    experiment: { workspace: ".", baseline: { program: "python3", args: ["-c", "print('{}')"] }, candidate: { program: "python3", args: ["-c", "print('{}')"] }, metric: "score", direction: "maximize", execution: "process" },
  });
  ledger.close();
  const store = new ResearchStore(db);
  const workflow = new WorkflowCoordinator(store);
  assert.ok(store.migrationBackupPath());
  assert.ok(existsSync(store.migrationBackupPath()!));

  const program = workflow.createIntent({
    title: "CV shift robustness",
    direction: "Study whether a small image classifier remains reliable under common distribution shifts.",
    domain: "AI / computer vision",
    constraints: ["one GPU", "public data only"],
    allowedData: ["CIFAR-10", "CIFAR-10-C"],
    profile: "confirmatory",
  });
  const candidate = workflow.proposeQuestion(program.id, question());
  workflow.selectQuestion(program.id, candidate.id);
  workflow.approveScope(program.id, "researcher", "Question is bounded and testable.");
  const drafted = workflow.draftProtocol(program.id, protocol());
  assert.throws(() => workflow.freezeProtocol(program.id, drafted.id), /approved before freeze/);
  workflow.approveProtocol(program.id, drafted.id);
  const freeze = workflow.freezeProtocol(program.id, drafted.id);
  assert.equal(freeze.contentHash, drafted.contentHash);
  assert.equal(store.getProtocol(drafted.id).status, "frozen");
  assert.throws(() => workflow.freezeProtocol(program.id, drafted.id), /already frozen/);

  workflow.recordVisibility({ programId: program.id, runId: "confirmation-run-1", dataRole: "confirmation", artifactHash: "a".repeat(64) });
  assert.throws(() => workflow.assertExplorationAllowed(program.id), /derive a new run/);
  assert.throws(() => workflow.recordVisibility({ programId: program.id, runId: "confirmation-run-2", dataRole: "confirmation", artifactHash: "b".repeat(64) }), /already been observed/);
  const derived = workflow.derive(program.id, "Confirmation exposed a calibration failure; test a new predeclared mechanism.", "researcher", ["confirmation-run-1"]);
  assert.equal(derived.program.derivedFromId, program.id);
  assert.equal(store.status(program.id).derivations.length, 1);
  store.close();

  const evidence = new EvidenceStore(db);
  evidence.close();
  const readableLedger = new Ledger(db);
  assert.equal(readableLedger.list().length, 1);
  assert.equal(readableLedger.get(legacyRun.id).brief.title, "Legacy v1.1 run");
  readableLedger.close();
});

test("E config and legacy briefs default to smoke without inventing protocol state", () => {
  const brief = BriefSchema.parse({
    title: "Legacy brief", question: "Does a fixed candidate improve this controlled task?", keywords: ["baseline"],
    experiment: { workspace: ".", baseline: { program: "python3", args: ["-c", "print('{}')"] }, candidate: { program: "python3", args: ["-c", "print('{}')"] }, metric: "score", direction: "maximize", execution: "process" },
  });
  assert.equal(brief.profile, "smoke");
  assert.equal(loadProjectConfig().research.profile, "smoke");
  assert.equal(ProjectConfigSchema.parse(loadProjectConfig()).research.maxDerivedRuns, 3);
});
