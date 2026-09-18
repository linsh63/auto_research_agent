import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { executeExperiment } from "../adapters/experiment.js";
import { searchPapers, type PaperSearchResult } from "../adapters/papers.js";
import type { ResearchModel } from "../adapters/pi-model.js";
import { SkillCatalog } from "../adapters/skills.js";
import { Ledger } from "./ledger.js";
import {
  AnalysisSchema, HypothesisSchema, PlanSchema, ReviewSchema,
  type Analysis, type ExperimentResult, type Hypothesis, type Plan,
  type ResearchBrief, type ResearchRun, type Review, type Stage,
} from "./schema.js";

export interface EngineOptions {
  dataDir: string;
  search?: typeof searchPapers;
  execute?: typeof executeExperiment;
  skills?: SkillCatalog;
}

export class ResearchEngine {
  private readonly search: typeof searchPapers;
  private readonly execute: typeof executeExperiment;
  private readonly skills: SkillCatalog;

  constructor(readonly ledger: Ledger, readonly model: ResearchModel | undefined, readonly options: EngineOptions) {
    this.search = options.search ?? searchPapers;
    this.execute = options.execute ?? executeExperiment;
    this.skills = options.skills ?? new SkillCatalog();
  }

  async run(id: string, maxSteps = 12): Promise<Stage> {
    const invocationStart = Date.now();
    for (let step = 0; step < maxSteps; step++) {
      const run = this.ledger.get(id);
      if (run.stage === "approval" || run.stage === "final_approval" || run.stage === "done") return run.stage;
      if (Date.now() - invocationStart > run.brief.limits.maxWallMinutes * 60_000) {
        throw new Error("Wall-clock limit reached for this invocation");
      }
      try { await this.step(run); }
      catch (error) {
        this.ledger.setError(id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    return this.ledger.get(id).stage;
  }

  approvePlan(id: string): Stage {
    const run = this.ledger.get(id);
    if (run.stage !== "approval") throw new Error(`Run is at ${run.stage}, not awaiting plan approval`);
    if (!this.ledger.latest<Plan>(id, "plan")) throw new Error("No experiment plan to approve");
    this.ledger.record(id, "plan_approval", { approvedAt: new Date().toISOString() });
    this.ledger.transition(id, "approval", "baseline");
    return "baseline";
  }

  approveConclusion(id: string): Stage {
    const run = this.ledger.get(id);
    if (run.stage !== "final_approval") throw new Error(`Run is at ${run.stage}, not awaiting conclusion approval`);
    if (!this.ledger.latest<Review>(id, "review")) throw new Error("No review to approve");
    this.ledger.record(id, "conclusion_approval", { approvedAt: new Date().toISOString() });
    this.ledger.transition(id, "final_approval", "done");
    return "done";
  }

  private async step(run: ResearchRun): Promise<void> {
    const { id, brief } = run;
    switch (run.stage) {
      case "evidence": {
        if (!this.ledger.latest(id, "evidence")) {
          const evidence = await this.search(brief);
          if (evidence.sources.length === 0) throw new Error("No verified sources found; add sourceUrls or retry search");
          this.ledger.record(id, "evidence", evidence);
          this.ledger.event(id, "search_completed", evidence.search);
        }
        this.ledger.transition(id, "evidence", "hypothesis");
        return;
      }
      case "hypothesis": {
        if (!this.ledger.latest(id, "hypothesis")) {
          const evidence = this.requireRecord<PaperSearchResult>(id, "evidence");
          const hypothesis = await this.callModel(run, "hypothesis", HypothesisSchema, {
            question: brief.question, sources: evidence.sources.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract, url: s.url })),
          }, "Propose one falsifiable hypothesis. Cite only source IDs present in the input. Do not claim an idea is novel from abstracts alone.");
          const allowed = new Set(evidence.sources.map((s) => s.id));
          if (hypothesis.sourceIds.length === 0 || hypothesis.sourceIds.some((sourceId) => !allowed.has(sourceId))) {
            throw new Error("Hypothesis has no valid source IDs");
          }
          this.ledger.record(id, "hypothesis", hypothesis);
        }
        this.ledger.transition(id, "hypothesis", "plan");
        return;
      }
      case "plan": {
        if (!this.ledger.latest(id, "plan")) {
          const plan = await this.callModel(run, "plan", PlanSchema, {
            question: brief.question, hypothesis: this.requireRecord<Hypothesis>(id, "hypothesis"),
            experiment: brief.experiment, limits: brief.limits,
          }, "Describe the approved-command comparison exactly as provided. Do not invent completed experiments or silently change commands. State why one run per variant cannot establish statistical significance.");
          this.ledger.record(id, "plan", plan);
        }
        this.ledger.transition(id, "plan", "approval");
        return;
      }
      case "baseline":
      case "candidate": {
        const kind = `experiment_${run.stage}`;
        if (!this.ledger.latest(id, kind)) {
          const result = await this.execute(brief, run.stage, this.runDir(id));
          this.ledger.record(id, kind, result);
          this.ledger.event(id, "experiment_completed", {
            variant: run.stage, metric: result.metric, exitCode: result.exitCode, timedOut: result.timedOut,
          });
        }
        this.ledger.transition(id, run.stage, run.stage === "baseline" ? "candidate" : "analysis");
        return;
      }
      case "analysis": {
        if (!this.ledger.latest(id, "analysis")) {
          const baseline = this.requireRecord<ExperimentResult>(id, "experiment_baseline");
          const candidate = this.requireRecord<ExperimentResult>(id, "experiment_candidate");
          const metricsValid = baseline.metric !== null && candidate.metric !== null;
          const improved = metricsValid && (brief.experiment.direction === "maximize"
            ? candidate.metric! > baseline.metric! : candidate.metric! < baseline.metric!);
          const analysis = await this.callModel(run, "analysis", AnalysisSchema, {
            hypothesis: this.requireRecord<Hypothesis>(id, "hypothesis"),
            plan: this.requireRecord<Plan>(id, "plan"), baseline, candidate,
            deterministicComparison: { metricsValid, improved, delta: metricsValid ? candidate.metric! - baseline.metric! : null },
          }, "Analyze only recorded results. A single run per variant is descriptive, not statistical proof. If either command failed or metric is missing, mark the hypothesis inconclusive.");
          if (!metricsValid && analysis.supportsHypothesis !== "inconclusive") {
            throw new Error("Analysis must be inconclusive when a metric is missing");
          }
          this.ledger.record(id, "analysis", analysis);
        }
        this.ledger.transition(id, "analysis", "review");
        return;
      }
      case "review": {
        if (!this.ledger.latest(id, "review")) {
          const review = await this.callModel(run, "review", ReviewSchema, {
            brief: { question: brief.question, metric: brief.experiment.metric, direction: brief.experiment.direction },
            evidence: this.requireRecord<PaperSearchResult>(id, "evidence"),
            hypothesis: this.requireRecord<Hypothesis>(id, "hypothesis"),
            plan: this.requireRecord<Plan>(id, "plan"),
            baseline: this.requireRecord<ExperimentResult>(id, "experiment_baseline"),
            candidate: this.requireRecord<ExperimentResult>(id, "experiment_candidate"),
            analysis: this.requireRecord<Analysis>(id, "analysis"),
            auditMaterials: {
              baselineCode: this.readAuditFile(this.requireRecord<ExperimentResult>(id, "experiment_baseline").codeSnapshotPath),
              candidateCode: this.readAuditFile(this.requireRecord<ExperimentResult>(id, "experiment_candidate").codeSnapshotPath),
              baselineStdout: this.readAuditFile(this.requireRecord<ExperimentResult>(id, "experiment_baseline").stdoutPath),
              candidateStdout: this.readAuditFile(this.requireRecord<ExperimentResult>(id, "experiment_candidate").stdoutPath),
            },
          }, "Independently challenge the causal claim, metric comparison, citation support, and reproducibility. State required fixes, if any.");
          this.ledger.record(id, "review", review);
        }
        this.writeReport(id);
        this.ledger.transition(id, "review", "final_approval");
        return;
      }
      default: throw new Error(`Cannot execute stage ${run.stage}`);
    }
  }

  private async callModel<T>(run: ResearchRun, stage: string, schema: z.ZodType<T>, input: unknown, instruction: string): Promise<T> {
    if (!this.model) throw new Error("A model is required for this stage");
    const current = this.ledger.get(run.id);
    if (current.modelCalls >= run.brief.limits.maxModelCalls) throw new Error("Model-call budget reached");
    const skill = this.skills.instructions(stage);
    this.ledger.incrementModelCalls(run.id);
    const instructions = `${instruction}\n\nRelevant skill methodology:${skill.text}`;
    const result = await this.model.generate(stage, input, schema, instructions);
    this.ledger.record(run.id, "model_output", {
      stage, model: this.model.id, input, raw: result.raw, usage: result.usage,
      instructionSha256: createHash("sha256").update(instructions).digest("hex"), skills: skill.used,
    });
    return result.value;
  }

  private requireRecord<T>(id: string, kind: string): T {
    const result = this.ledger.latest<T>(id, kind);
    if (!result) throw new Error(`Missing ${kind} for run ${id}`);
    return result;
  }

  private runDir(id: string): string {
    const path = join(this.options.dataDir, "runs", id);
    mkdirSync(path, { recursive: true });
    return path;
  }

  reportPath(id: string): string { return join(this.runDir(id), "report.md"); }

  private readAuditFile(path: string | null, limit = 12000): string | null {
    if (!path || !existsSync(path)) return null;
    const content = readFileSync(path, "utf8");
    return content.length > limit ? `${content.slice(0, limit)}\n[TRUNCATED]` : content;
  }

  private writeReport(id: string): void {
    const run = this.ledger.get(id);
    const evidence = this.requireRecord<PaperSearchResult>(id, "evidence");
    const hypothesis = this.requireRecord<Hypothesis>(id, "hypothesis");
    const plan = this.requireRecord<Plan>(id, "plan");
    const baseline = this.requireRecord<ExperimentResult>(id, "experiment_baseline");
    const candidate = this.requireRecord<ExperimentResult>(id, "experiment_candidate");
    const analysis = this.requireRecord<Analysis>(id, "analysis");
    const review = this.requireRecord<Review>(id, "review");
    const lines = [
      `# ${run.brief.title}`, "", `Run ID: ${id}`, `Question: ${run.brief.question}`, "",
      "## Search and sources", "", `Query: ${evidence.search.query}`, `Years: ${evidence.search.startYear}–${evidence.search.endYear}`, "",
      ...evidence.sources.map((s) => `- [${s.id}] ${s.title} (${s.year ?? "year unknown"}) — ${s.url} [${s.origin}]`), "",
      ...(evidence.search.warnings.length ? ["Search warnings:", ...evidence.search.warnings.map((w) => `- ${w}`), ""] : []),
      "## Hypothesis", "", hypothesis.statement, "", `Prediction: ${hypothesis.prediction}`,
      `Alternative: ${hypothesis.alternative}`, `Falsification: ${hypothesis.falsification}`,
      `Source IDs: ${hypothesis.sourceIds.join(", ")}`, "",
      "## Approved experiment plan", "", plan.comparison, "", `Success criterion: ${plan.successCriterion}`, "",
      "## Recorded experiment results", "",
      `Metric: ${run.brief.experiment.metric} (${run.brief.experiment.direction})`,
      `Baseline: ${baseline.metric ?? "missing"}; exit=${baseline.exitCode}; duration=${baseline.durationMs} ms; log=${baseline.stdoutPath}`,
      `Candidate: ${candidate.metric ?? "missing"}; exit=${candidate.exitCode}; duration=${candidate.durationMs} ms; log=${candidate.stdoutPath}`,
      `Baseline code: ${baseline.codePath ?? "not captured"}; SHA-256=${baseline.codeSha256 ?? "not captured"}; snapshot=${baseline.codeSnapshotPath ?? "not captured"}`,
      `Candidate code: ${candidate.codePath ?? "not captured"}; SHA-256=${candidate.codeSha256 ?? "not captured"}; snapshot=${candidate.codeSnapshotPath ?? "not captured"}`,
      `Baseline stdout: ${this.readAuditFile(baseline.stdoutPath, 2000) ?? "missing"}`,
      `Candidate stdout: ${this.readAuditFile(candidate.stdoutPath, 2000) ?? "missing"}`,
      `Seed: ${run.brief.experiment.seed}`, "",
      "## Analysis", "", analysis.summary, "", `Support: ${analysis.supportsHypothesis}`,
      ...analysis.evidence.map((item) => `- Evidence: ${item}`),
      ...analysis.limitations.map((item) => `- Limitation: ${item}`),
      `Next step: ${analysis.nextStep}`, "",
      "## Independent review", "", `Verdict: ${review.verdict}; confidence: ${review.confidence}`,
      ...review.concerns.map((item) => `- Concern: ${item}`),
      ...review.requiredChanges.map((item) => `- Required change: ${item}`), "",
      "This report is a research record. The final conclusion requires researcher approval.", "",
    ];
    const content = lines.join("\n");
    const path = this.reportPath(id);
    writeFileSync(path, content);
    const sha256 = createHash("sha256").update(content).digest("hex");
    this.ledger.record(id, "artifact", { kind: "report", path, sha256 });
  }
}
