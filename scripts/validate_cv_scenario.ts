import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "zod";
import type { ModelOutput, ResearchModel } from "../src/adapters/pi-model.js";
import type { PaperSearchResult } from "../src/adapters/papers.js";
import { ResearchEngine } from "../src/core/engine.js";
import { Ledger } from "../src/core/ledger.js";
import { BriefSchema, type ResearchBrief } from "../src/core/schema.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { MemoryStore } from "../src/infrastructure/db/memory-store.js";

class CvAuditModel implements ResearchModel {
  readonly id = "deterministic/cv-stage-audit";

  async generate<T>(stage: string, wrapped: unknown, schema: z.ZodType<T>): Promise<ModelOutput<T>> {
    const outer = wrapped as { input: Record<string, unknown> };
    let payload: unknown;
    if (stage === "hypothesis") {
      payload = {
        statement: "Four-direction one-pixel translation augmentation increases mean holdout accuracy for the fixed RBF SVC on Digits.",
        rationale: "Small translations encode a plausible image invariance while keeping labels unchanged for these centered digit images.",
        prediction: "Candidate mean accuracy exceeds baseline mean accuracy across the five paired splits.",
        alternative: "The extra translated samples have no benefit or reduce accuracy by adding unrealistic boundary artifacts.",
        falsification: "Candidate mean accuracy is no higher than baseline mean accuracy.",
        sourceIds: ["digits-dataset", "augmentation-survey"],
      };
    } else if (stage === "plan") {
      payload = {
        comparison: "Run the fixed RBF SVC with and without four one-pixel training translations on the same five stratified holdouts.",
        replicateSeeds: [11, 23, 47, 73, 101],
        baselineDescription: "Fit on the original training images.",
        candidateDescription: "Fit on original images plus four cardinal one-pixel translations.",
        metricInterpretation: "Higher mean classification accuracy is better.",
        successCriterion: "Candidate mean accuracy must exceed baseline mean accuracy while all paired outcomes remain visible.",
        limitations: ["Repeated holdouts overlap and are not independent datasets.", "The task uses one small dataset and one fixed classifier."],
      };
    } else if (stage === "analysis") {
      const inner = outer.input as unknown as { baseline: { metric: number }; candidate: { metric: number }; deterministicComparison: { paired: Array<{ difference: number }> } };
      const differences = inner.deterministicComparison.paired.map((row) => row.difference);
      payload = {
        summary: `Translation augmentation raised mean accuracy from ${inner.baseline.metric.toFixed(6)} to ${inner.candidate.metric.toFixed(6)} (delta ${(inner.candidate.metric - inner.baseline.metric).toFixed(6)}). Paired outcomes include improvements, a tie, and a degradation.`,
        supportsHypothesis: inner.candidate.metric > inner.baseline.metric ? "yes" : "no",
        evidence: [
          `Recorded mean delta: ${(inner.candidate.metric - inner.baseline.metric).toFixed(6)}.`,
          `Recorded paired deltas: ${differences.map((value) => value.toFixed(6)).join(", ")}.`,
        ],
        limitations: ["The mean gain is only about 0.13 percentage points.", "Overlapping repeated holdouts do not provide independent replication.", "Training size and compute increase fivefold."],
        nextStep: "Confirm on a second image dataset with a sealed test split before claiming a reusable augmentation benefit.",
      };
    } else if (stage === "review") {
      payload = {
        verdict: "needs_work",
        concerns: ["The gain is tiny and one split degrades.", "Repeated holdouts overlap.", "The candidate uses roughly five times as many training examples."],
        requiredChanges: ["State the mixed paired outcomes and restrict the conclusion to Digits with this fixed RBF SVC."],
        confidence: "high",
      };
    } else {
      throw new Error(`Unexpected model stage: ${stage}`);
    }
    const value = schema.parse(payload);
    return { value, raw: JSON.stringify(value), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function evidence(): PaperSearchResult {
  const accessedAt = new Date().toISOString();
  return {
    sources: [
      { id: "digits-dataset", title: "Optical Recognition of Handwritten Digits dataset", url: "https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits", year: 1998, authors: ["E. Alpaydin", "C. Kaynak"], abstract: "Public normalized 8 by 8 handwritten digit images used by the packaged Digits task.", origin: "dataset-primary", accessedAt },
      { id: "sklearn-digits", title: "scikit-learn load_digits documentation", url: "https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_digits.html", year: 2026, authors: [], abstract: "Official documentation for the packaged 1,797-sample Digits dataset.", origin: "official-documentation", accessedAt },
      { id: "augmentation-survey", title: "A survey on Image Data Augmentation for Deep Learning", url: "https://doi.org/10.1186/s40537-019-0197-0", year: 2019, authors: ["Connor Shorten", "Taghi M. Khoshgoftaar"], abstract: "Survey of image augmentation methods including geometric translation and their limitations.", doi: "10.1186/s40537-019-0197-0", origin: "primary-paper", accessedAt },
    ],
    search: { query: "handwritten digit image translation augmentation", startYear: 1998, endYear: 2026, sourceCounts: { provided: 3 }, warnings: ["D-stage replay uses pinned seed-source metadata; no live search was required."] },
  };
}

async function main(): Promise<void> {
  const project = resolve(".");
  const caseDir = join(project, ".research-data", "cases", "sklearn-digits");
  rmSync(caseDir, { recursive: true, force: true });
  mkdirSync(caseDir, { recursive: true });
  const brief = BriefSchema.parse(JSON.parse(readFileSync(join(project, "examples", "sklearn-digits", "brief.json"), "utf8"))) as ResearchBrief;
  brief.experiment.workspace = join(project, "examples", "sklearn-digits");

  const database = join(caseDir, "d-stage.db");
  const ledger = new Ledger(database);
  const evidenceStore = new EvidenceStore(database);
  const memoryStore = new MemoryStore(database);
  try {
    const runId = ledger.create(brief).id;
    const engine = new ResearchEngine(ledger, new CvAuditModel(), {
      dataDir: caseDir,
      search: async () => evidence(),
      evidenceStore,
      memoryStore,
    });
    if (await engine.run(runId) !== "approval") throw new Error("CV run did not stop at plan approval");
    engine.approvePlan(runId);
    if (await engine.run(runId) !== "final_approval") throw new Error("CV run did not stop at final approval");
    engine.respondToReview(runId, {
      summary: "The final statement now reports the mixed paired outcomes and the narrow scope.",
      conclusion: "On these five Digits holdouts and this fixed RBF SVC, translation augmentation increased mean accuracy by about 0.13 percentage points; the tiny mixed effect does not establish a general augmentation benefit.",
      changes: [{
        requirement: "State the mixed paired outcomes and restrict the conclusion to Digits with this fixed RBF SVC.",
        disposition: "addressed",
        response: "The conclusion names the dataset and classifier, quantifies the small mean effect, and notes that individual split effects include improvement, no change, and degradation.",
        evidence: ["The report's paired table contains all five differences.", "The recorded means are 0.992000 and 0.993333."],
      }],
      remainingLimitations: ["No independent second image dataset.", "No uncertainty claim from overlapping holdouts.", "Docker execution could not be exercised without daemon permission."],
    });
    engine.approveConclusion(runId);

    const baseline = ledger.latest<{ metric: number; details: Record<string, unknown>; codeSha256: string }>(runId, "experiment_baseline")!;
    const candidate = ledger.latest<{ metric: number; details: Record<string, unknown>; codeSha256: string }>(runId, "experiment_candidate")!;
    const reportPath = engine.reportPath(runId);
    const result = {
      schemaVersion: 1,
      runId,
      stage: ledger.get(runId).stage,
      profile: "local-process",
      baselineAccuracy: baseline.metric,
      candidateAccuracy: candidate.metric,
      delta: candidate.metric - baseline.metric,
      baselinePerSeed: baseline.details.per_seed,
      candidatePerSeed: candidate.details.per_seed,
      codeSha256: baseline.codeSha256,
      reportPath,
      reportSha256: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
      evidenceCounts: evidenceStore.counts(),
      memoryCounts: memoryStore.counts(),
      docker: { verified: false, reason: "permission denied for /var/run/docker.sock" },
    };
    writeFileSync(join(caseDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    memoryStore.close();
    evidenceStore.close();
    ledger.close();
  }
}

await main();
