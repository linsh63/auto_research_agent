import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { z } from "zod";
import type { PaperSearchResult } from "../src/adapters/papers.js";
import type { ModelOutput, ResearchModel } from "../src/adapters/pi-model.js";
import { ResearchEngine } from "../src/core/engine.js";
import { Ledger } from "../src/core/ledger.js";
import { BriefSchema, type Plan, type ResearchBrief } from "../src/core/schema.js";

class FixtureModel implements ResearchModel {
  readonly id = "fixture/model";
  badSourceOnce = false;
  async generate<T>(stage: string, _input: unknown, schema: z.ZodType<T>, _instructions: string): Promise<ModelOutput<T>> {
    let payload: unknown;
    switch (stage) {
      case "hypothesis":
        payload = {
          statement: "A quadratic feature should lower error on this synthetic quadratic target.",
          rationale: "The target has a quadratic term and the baseline omits it.",
          prediction: "Candidate RMSE is lower than baseline RMSE.",
          alternative: "The quadratic feature does not lower error.",
          falsification: "Candidate RMSE is equal or higher.",
          sourceIds: [this.badSourceOnce ? "source-999" : "source-1"],
        };
        this.badSourceOnce = false;
        break;
      case "plan":
        payload = {
          comparison: "Run the fixed baseline and candidate commands with one shared seed.",
          replicateSeeds: [42],
          baselineDescription: "Linear features only.", candidateDescription: "Add a quadratic feature.",
          metricInterpretation: "Lower RMSE means lower prediction error.",
          successCriterion: "Candidate RMSE lower than baseline RMSE.",
          limitations: ["Single seed gives no uncertainty estimate."],
        };
        break;
      case "analysis":
        payload = {
          summary: "The candidate reduced RMSE in one deterministic comparison.",
          supportsHypothesis: "yes", evidence: ["Candidate RMSE is lower."],
          limitations: ["One run per variant cannot establish generalization."],
          nextStep: "Repeat with multiple seeds.",
        };
        break;
      case "review":
        payload = { verdict: "needs_work", concerns: ["One seed only."], requiredChanges: ["Repeat with more seeds."], confidence: "medium" };
        break;
      default: throw new Error(`Unexpected stage: ${stage}`);
    }
    return { value: schema.parse(payload), raw: JSON.stringify(payload), usage: { totalTokens: 0 } };
  }
}

function brief(maxModelCalls = 6): ResearchBrief {
  return BriefSchema.parse({
    title: "Pipeline fixture", question: "Does a quadratic feature reduce RMSE on deterministic synthetic data?",
    keywords: ["polynomial regression"],
    experiment: {
      workspace: resolve("examples/toy-regression"),
      baseline: { program: "python3", args: ["experiment.py", "baseline"] },
      candidate: { program: "python3", args: ["experiment.py", "candidate"] },
      metric: "rmse", direction: "minimize", seed: 42, execution: "process",
    },
    limits: { maxModelCalls, maxWallMinutes: 5, maxExperimentSeconds: 10, maxIterations: 1 },
  });
}

function evidence(): PaperSearchResult {
  return {
    sources: [{ id: "source-1", title: "Provided method reference", url: "https://example.org/method", origin: "provided", accessedAt: new Date().toISOString(), authors: [], abstract: "" }],
    search: { query: "polynomial regression", startYear: 2023, endYear: 2026, sourceCounts: {}, warnings: [] },
  };
}

test("research run pauses at both human gates and preserves executable evidence", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-engine-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = new Ledger(join(dir, "research.db"));
  t.after(() => ledger.close());
  const id = ledger.create(brief()).id;
  const engine = new ResearchEngine(ledger, new FixtureModel(), { dataDir: dir, search: async () => evidence() });

  assert.equal(await engine.run(id), "approval");
  assert.equal(ledger.latest(id, "experiment_baseline"), undefined);
  const plan = ledger.latest<Plan>(id, "plan")!;
  assert.throws(() => engine.revisePlan(id, { ...plan, replicateSeeds: [999] }), /do not match brief/);
  engine.revisePlan(id, { ...plan, successCriterion: "Researcher-approved descriptive comparison." });
  assert.equal(ledger.latest<Plan>(id, "plan")?.successCriterion, "Researcher-approved descriptive comparison.");
  assert.equal(engine.approvePlan(id), "baseline");
  assert.equal(await engine.run(id), "final_approval");
  const baseline = ledger.latest<{ metric: number; codeSha256: string }>(id, "experiment_baseline")!;
  const candidate = ledger.latest<{ metric: number; codeSha256: string }>(id, "experiment_candidate")!;
  assert.ok(candidate.metric < baseline.metric);
  assert.match(candidate.codeSha256, /^[a-f0-9]{64}$/);
  assert.ok(existsSync(engine.reportPath(id)));
  assert.match(readFileSync(engine.reportPath(id), "utf8"), /SHA-256=/);
  assert.throws(() => engine.approveConclusion(id), /review response is required/);
  engine.respondToReview(id, {
    summary: "The bounded conclusion retains the single-seed limitation.",
    conclusion: "The candidate was better only in this recorded fixture run.",
    changes: [{ requirement: "Repeat with more seeds.", disposition: "accepted_limitation", response: "No extra run is claimed in this fixture.", evidence: ["The report records one seed."] }],
    remainingLimitations: ["One seed only."],
  });
  assert.equal(engine.approveConclusion(id), "done");
  assert.equal(ledger.get(id).stage, "done");
});

test("invalid citations keep the stage retryable without repeating search", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-engine-retry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = new Ledger(join(dir, "research.db"));
  t.after(() => ledger.close());
  const id = ledger.create(brief()).id;
  const model = new FixtureModel();
  model.badSourceOnce = true;
  let searches = 0;
  const engine = new ResearchEngine(ledger, model, { dataDir: dir, search: async () => { searches++; return evidence(); } });
  await assert.rejects(engine.run(id), /valid source IDs/);
  assert.equal(ledger.get(id).stage, "hypothesis");
  assert.equal(await engine.run(id), "approval");
  assert.equal(searches, 1);
});

test("model-call limit stops before an unbudgeted stage", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-engine-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = new Ledger(join(dir, "research.db"));
  t.after(() => ledger.close());
  const id = ledger.create(brief(1)).id;
  const engine = new ResearchEngine(ledger, new FixtureModel(), { dataDir: dir, search: async () => evidence() });
  await assert.rejects(engine.run(id), /Model-call budget reached/);
  assert.equal(ledger.get(id).stage, "plan");
  assert.equal(ledger.get(id).modelCalls, 1);
});
