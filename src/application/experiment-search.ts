import { randomUUID } from "node:crypto";
import { SearchBudgetSchema, SearchNodeSchema, type SearchBudget, type SearchNode } from "../domain/search.js";
import { SearchStore } from "../infrastructure/db/search-store.js";

export interface CandidateResult { metric: number | null; costUsd: number; durationMs: number; artifactHash?: string; failureClass?: string; }
export type CandidateRunner = (parameters: Record<string, unknown>) => Promise<CandidateResult>;

export class BoundedExperimentSearch {
  constructor(private readonly store: SearchStore) {}
  async run(options: { runId?: string; strategy: "linear" | "best-first"; candidates: Array<Record<string, unknown>>; budget: SearchBudget; runner: CandidateRunner; direction?: "maximize" | "minimize" }): Promise<SearchNode[]> {
    const runId = options.runId ?? randomUUID();
    const budget = SearchBudgetSchema.parse(options.budget);
    this.store.createRun(runId, options.strategy, budget);
    const started = Date.now(); const direction = options.direction ?? "maximize";
    const pending = options.candidates.slice();
    if (options.strategy === "best-first") pending.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
    const output: SearchNode[] = [];
    for (const parameters of pending) {
      if (output.length >= budget.maxCandidates || Date.now() - started >= budget.maxWallMs) break;
      if (output.reduce((sum, n) => sum + n.costUsd, 0) >= budget.maxCostUsd) break;
      const node = SearchNodeSchema.parse({ id: randomUUID(), searchRunId: runId, parentId: null, kind: "candidate", status: "running", parameters, metric: null, costUsd: 0, durationMs: 0, failureClass: null, artifactHash: null, createdAt: new Date().toISOString() });
      this.store.add(node);
      let result: CandidateResult;
      try { result = await options.runner(parameters); } catch (error) { result = { metric: null, costUsd: 0, durationMs: Date.now() - started, failureClass: error instanceof Error ? error.name : "runner_error" }; }
      const finished = this.store.update(node.id, result.metric === null ? "failed" : "succeeded", { metric: result.metric, costUsd: result.costUsd, durationMs: result.durationMs, artifactHash: result.artifactHash ?? null, failureClass: result.failureClass ?? null });
      output.push(finished);
      if (output.reduce((sum, n) => sum + n.costUsd, 0) >= budget.maxCostUsd) break;
      if (options.strategy === "best-first") pending.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
      void direction;
    }
    this.store.finishRun(runId, output.length >= budget.maxCandidates ? "completed" : "stopped");
    return output;
  }
}
