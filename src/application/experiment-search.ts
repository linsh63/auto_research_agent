import { createHash, randomUUID } from "node:crypto";
import { SearchBudgetSchema, SearchNodeSchema, type SearchBudget, type SearchNode } from "../domain/search.js";
import { SearchStore } from "../infrastructure/db/search-store.js";

export interface CandidateResult { metric: number | null; costUsd: number; durationMs: number; artifactHash?: string; failureClass?: string; }
export type CandidateRunner = (parameters: Record<string, unknown>) => Promise<CandidateResult>;
export type CandidateExpander = (node: SearchNode) => Promise<Array<Record<string, unknown>>>;

export class BoundedExperimentSearch {
  constructor(private readonly store: SearchStore) {}
  async run(options: { runId?: string; strategy: "linear" | "best-first"; candidates: Array<Record<string, unknown>>; budget: SearchBudget; runner: CandidateRunner; expand?: CandidateExpander; direction?: "maximize" | "minimize"; context?: { protocolId: string; hypothesisSetId: string; predictionIds: string[] } }): Promise<SearchNode[]> {
    const runId = options.runId ?? randomUUID();
    const budget = SearchBudgetSchema.parse(options.budget);
    this.store.createRun(runId, options.strategy, budget);
    const started = Date.now(); const direction = options.direction ?? "maximize";
    const pending = options.candidates.slice();
    if (options.strategy === "best-first") pending.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
    const output: SearchNode[] = [];
    while (pending.length) {
      const parameters = pending.shift()!;
      if (output.length >= budget.maxCandidates || Date.now() - started >= budget.maxWallMs) break;
      if (output.reduce((sum, n) => sum + n.costUsd, 0) >= budget.maxCostUsd) break;
      const estimatedCost = typeof parameters._estimatedCostUsd === "number" ? parameters._estimatedCostUsd : 0;
      if (output.reduce((sum, n) => sum + n.costUsd, 0) + estimatedCost > budget.maxCostUsd) break;
      const parentId = typeof parameters._parentId === "string" ? parameters._parentId : null;
      const cleanParameters = Object.fromEntries(Object.entries(parameters).filter(([key]) => !key.startsWith("_") && key !== "priority"));
      const signature = createHash("sha256").update(stableJson(cleanParameters)).digest("hex");
      const cached = this.store.findBySignature(signature);
      if (cached) {
        const reused = SearchNodeSchema.parse({ ...cached, id: randomUUID(), searchRunId: runId, parentId, kind: parentId ? "candidate" : "root", protocolId: options.context?.protocolId ?? null, hypothesisSetId: options.context?.hypothesisSetId ?? null, predictionIds: options.context?.predictionIds ?? [], phase: "exploration", createdAt: new Date().toISOString() });
        this.store.add(reused); output.push(reused); continue;
      }
      const node = SearchNodeSchema.parse({ id: randomUUID(), searchRunId: runId, parentId, kind: parentId ? "candidate" : "root", status: "running", parameters: cleanParameters, signature, metric: null, costUsd: 0, durationMs: 0, failureClass: null, artifactHash: null, protocolId: options.context?.protocolId ?? null, hypothesisSetId: options.context?.hypothesisSetId ?? null, predictionIds: options.context?.predictionIds ?? [], phase: "exploration", createdAt: new Date().toISOString() });
      this.store.add(node);
      let result: CandidateResult;
      try { result = await options.runner(parameters); } catch (error) { result = { metric: null, costUsd: 0, durationMs: Date.now() - started, failureClass: error instanceof Error ? error.name : "runner_error" }; }
      const finished = this.store.update(node.id, result.metric === null ? "failed" : "succeeded", { metric: result.metric, costUsd: result.costUsd, durationMs: result.durationMs, artifactHash: result.artifactHash ?? null, failureClass: result.failureClass ?? null });
      output.push(finished);
      if (options.strategy === "best-first" && result.metric !== null && options.expand) {
        const children = await options.expand(finished);
        pending.push(...children.map((child) => ({ ...child, _parentId: finished.id })));
      }
      if (output.reduce((sum, n) => sum + n.costUsd, 0) >= budget.maxCostUsd) break;
      if (options.strategy === "best-first") pending.sort((a, b) => Number(b._priority ?? b.priority ?? 0) - Number(a._priority ?? a.priority ?? 0));
      void direction;
    }
    this.store.finishRun(runId, output.length >= budget.maxCandidates ? "completed" : "stopped");
    return output.sort((a,b)=>{
      if(a.metric===null) return 1; if(b.metric===null) return -1;
      return direction==="maximize" ? b.metric-a.metric : a.metric-b.metric;
    });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
