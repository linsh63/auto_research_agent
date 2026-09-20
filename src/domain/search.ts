import { z } from "zod";

export const SearchNodeSchema = z.object({
  id: z.string(), searchRunId: z.string(), parentId: z.string().nullable(), kind: z.enum(["root", "candidate", "debug"]),
  status: z.enum(["queued", "running", "succeeded", "failed", "pruned"]), parameters: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
  metric: z.number().nullable(), costUsd: z.number().nonnegative().default(0), durationMs: z.number().nonnegative().default(0),
  failureClass: z.string().nullable().default(null), artifactHash: z.string().nullable().default(null), createdAt: z.string(),
  protocolId: z.string().nullable().default(null), hypothesisSetId: z.string().nullable().default(null),
  predictionIds: z.array(z.string()).default([]), phase: z.enum(["exploration", "debug", "confirmation"]).default("exploration"),
});
export const SearchBudgetSchema = z.object({ maxCandidates: z.number().int().positive(), maxWallMs: z.number().positive(), maxCostUsd: z.number().nonnegative(), concurrency: z.number().int().positive() });
export const DatasetRoleSchema = z.object({ name: z.enum(["train", "validation", "test", "audit"]), manifestHash: z.string(), path: z.string(), sealed: z.boolean() });
export const SearchPlanSchema = z.object({ mode: z.enum(["parameter", "patch"]), allowedPaths: z.array(z.string()).default([]), forbiddenPaths: z.array(z.string()).default(["test", "evaluation", "scheduler", "sandbox"]), datasets: z.array(DatasetRoleSchema), finalTestApproved: z.boolean().default(false) });
export type SearchNode = z.infer<typeof SearchNodeSchema>;
export type SearchBudget = z.infer<typeof SearchBudgetSchema>;
export type DatasetRole = z.infer<typeof DatasetRoleSchema>;
export type SearchPlan = z.infer<typeof SearchPlanSchema>;

export function validateDatasetRoles(roles: DatasetRole[]): void {
  const names = new Set(roles.map((role) => role.name));
  if (!names.has("train") || !names.has("validation")) throw new Error("train and validation roles are required");
  const test = roles.find((role) => role.name === "test");
  if (test && !test.sealed) throw new Error("test role must be sealed during search");
  if (roles.some((role) => role.name === "train" && role.sealed)) throw new Error("train cannot be sealed");
}

export function assertPatchAllowed(paths: string[], plan: SearchPlan): void {
  if (plan.mode !== "patch" && paths.length) throw new Error("patches are disabled in parameter mode");
  for (const path of paths) {
    if (plan.forbiddenPaths.some((part) => path.includes(part))) throw new Error(`forbidden patch path: ${path}`);
    if (plan.allowedPaths.length && !plan.allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) throw new Error(`patch path outside allowlist: ${path}`);
  }
}
