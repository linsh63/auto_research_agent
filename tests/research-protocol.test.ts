import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { WorkflowCoordinator } from "../src/application/workflow-coordinator.js";
import { BriefSchema } from "../src/core/schema.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { ProjectConfigSchema, loadProjectConfig } from "../src/infrastructure/config/config.js";
import { ResearchStore } from "../src/infrastructure/db/research-store.js";
import { Ledger } from "../src/core/ledger.js";

const execFileAsync = promisify(execFile);
import Database from "better-sqlite3";

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

test("E state graph enforces scope, protocol freeze, visibility and derivation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-research-protocol-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = join(dir, "research.db");
  const ledger = new Ledger(db);
  const legacyRun = ledger.create({
    title: "Legacy v1.1 run", question: "Does a fixed candidate improve this controlled task?", keywords: ["baseline"],
    experiment: { workspace: ".", baseline: { program: "python3", args: ["-c", "print('{}')"] }, candidate: { program: "python3", args: ["-c", "print('{}')"] }, metric: "score", direction: "maximize", execution: "process" },
  });
  const legacyPayload = { ...legacyRun.brief } as Record<string, unknown>;
  delete legacyPayload.profile;
  ledger.close();
  const legacyDb = new Database(db);
  legacyDb.prepare("UPDATE runs SET brief_json=? WHERE id=?").run(JSON.stringify(legacyPayload), legacyRun.id);
  legacyDb.close();
  const store = await ResearchStore.open(db);
  const workflow = new WorkflowCoordinator(store);
  assert.ok(store.migrationBackupPath());
  assert.ok(existsSync(store.migrationBackupPath()!));
  assert.ok(store.artifactManifestSnapshotPath());
  assert.ok(existsSync(store.artifactManifestSnapshotPath()!));
  const backupDb = new Database(store.migrationBackupPath()!);
  assert.equal(backupDb.pragma("user_version", { simple: true }), 1);
  assert.equal((backupDb.prepare("SELECT count(*) n FROM runs").get() as { n: number }).n, 1);
  backupDb.close();

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
  const assumption = workflow.addAssumption(candidate.id, { statement: "The declared corruption labels remain valid.", invalidationCondition: "A label audit finds a systematic mismatch.", evidenceIds: [] });
  const register = workflow.createAssumptionRegister(candidate.id, [assumption.id]);
  assert.equal(register.assumptionIds.length, 1);
  const hypothesisSet = workflow.createHypothesisSet(program.id, { hypotheses: [
    { kind: "target", statement: "The declared change improves robustness under held-out corruptions.", prediction: "Primary robustness accuracy increases on confirmation groups.", falsification: "The frozen candidate does not improve robustness.", evidenceIds: [] },
    { kind: "null", statement: "The declared change does not alter robustness under held-out corruptions.", prediction: "The paired difference is centered near zero.", falsification: "A stable improvement exceeds the predeclared effect boundary.", evidenceIds: [] },
  ] });
  assert.equal(hypothesisSet.hypotheses.length, 2);
  const drafted = workflow.draftProtocol(program.id, protocol());
  assert.throws(() => workflow.freezeProtocol(program.id, drafted.id), /approved before freeze/);
  workflow.approveProtocol(program.id, drafted.id);
  const freeze = workflow.freezeProtocol(program.id, drafted.id);
  assert.equal(freeze.contentHash, drafted.contentHash);
  assert.equal(store.getProtocol(drafted.id).status, "frozen");
  assert.throws(() => workflow.freezeProtocol(program.id, drafted.id), /already frozen/);

  const approvedDeviation = workflow.recordDeviation(program.id, { reason: "Change the declared primary analysis after the initial freeze.", observedData: false, requestedChange: "Use the predeclared grouped robustness outcome.", approved: true, actor: "researcher" });
  assert.equal(approvedDeviation.resolution, "approved");
  const revisedProtocol = store.listProtocols(program.id).at(-1)!;
  assert.equal(revisedProtocol.status, "draft");
  workflow.approveProtocol(program.id, revisedProtocol.id);
  workflow.freezeProtocol(program.id, revisedProtocol.id);

  const pendingDeviation = workflow.recordDeviation(program.id, { reason: "Request a changed primary analysis after freeze.", observedData: false, requestedChange: "Replace the frozen primary analysis.", approved: false, actor: "agent" });
  assert.throws(() => workflow.recordVisibility({ programId: program.id, runId: "blocked-confirmation", dataRole: "confirmation", artifactHash: "c".repeat(64) }), /pending protocol deviation/);
  workflow.rejectDeviation(program.id, pendingDeviation.id);
  workflow.recordVisibility({ programId: program.id, runId: "confirmation-run-1", dataRole: "confirmation", artifactHash: "a".repeat(64) });
  assert.throws(() => workflow.assertExplorationAllowed(program.id), /derive a new run/);
  assert.throws(() => workflow.recordVisibility({ programId: program.id, runId: "confirmation-run-2", dataRole: "confirmation", artifactHash: "b".repeat(64) }), /already been observed/);
  assert.throws(() => workflow.proposeQuestion(program.id, { ...question(), question: "Can a second question be added after confirmation has already been observed?" }), /closed after confirmation/);
  const derived = workflow.derive(program.id, "Confirmation exposed a calibration failure; test a new predeclared mechanism.", "researcher", ["confirmation-run-1"]);
  assert.equal(derived.program.derivedFromId, program.id);
  assert.equal(store.status(program.id).derivations.length, 1);
  workflow.derive(program.id, "A second bounded follow-up is required for diagnosis.");
  workflow.derive(program.id, "A third bounded follow-up is required for replication.");
  assert.throws(() => workflow.derive(program.id, "A fourth follow-up must be refused by the budget."), /Derived run limit reached/);
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

test("E research CLI has a machine-readable create/status contract", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-research-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, AUTO_RESEARCH_DATA_DIR: dir };
  const run = (args: string[]) => execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: resolve("."), env });
  const created = JSON.parse((await run(["research", "new", "examples/v1.2-e/intent.json"])).stdout) as { id: string; profile: string; status: string };
  assert.equal(created.profile, "confirmatory");
  assert.equal(created.status, "draft");
  const status = JSON.parse((await run(["research", "status", created.id])).stdout) as { program: { id: string; status: string }; questions: unknown[] };
  assert.equal(status.program.id, created.id);
  assert.equal(status.program.status, "draft");
  assert.deepEqual(status.questions, []);
});

test("E corrective migration upgrades an existing schema-3 database with an online backup", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-research-003b-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "research.db");
  const raw = new Database(dbPath);
  raw.exec(readFileSync(resolve("migrations/003_research_protocol.sql"), "utf8"));
  raw.close();
  const store = await ResearchStore.open(dbPath);
  const migrated = new Database(dbPath);
  assert.equal(migrated.pragma("user_version", { simple: true }), 4);
  migrated.close();
  assert.match(store.migrationBackupPath() ?? "", /research-before-003b-/);
  assert.match(store.artifactManifestSnapshotPath() ?? "", /artifact-manifest-before-003b/);
  store.close();
});
