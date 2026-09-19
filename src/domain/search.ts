import { z } from "zod";

export const SearchNodeSchema = z.object({
  id: z.string(), searchRunId: z.string(), parentId: z.string().nullable(), kind: z.enum(["root", "candidate", "debug"]),
  status: z.enum(["queued", "running", "succeeded", "failed", "pruned"]), parameters: z.record(z.string(), z.unknown()),
  metric: z.number().nullable(), costUsd: z.number().nonnegative().default(0), durationMs: z.number().nonnegative().default(0),
  failureClass: z.string().nullable().default(null), artifactHash: z.string().nullable().default(null), createdAt: z.string(),
});
export const SearchBudgetSchema = z.object({ maxCandidates: z.number().int().positive(), maxWallMs: z.number().positive(), maxCostUsd: z.number().nonnegative(), concurrency: z.number().int().positive() });
export const DatasetRoleSchema = z.object({ name: z.enum(["train", "validation", "test", "audit"]), manifestHash: z.string(), path: z.string(), sealed: z.boolean() });
export type SearchNode = z.infer<typeof SearchNodeSchema>;
export type SearchBudget = z.infer<typeof SearchBudgetSchema>;
export type DatasetRole = z.infer<typeof DatasetRoleSchema>;

export function validateDatasetRoles(roles: DatasetRole[]): void {
  const names = new Set(roles.map((role) => role.name));
  if (!names.has("train") || !names.has("validation")) throw new Error("train and validation roles are required");
  const test = roles.find((role) => role.name === "test");
  if (test && !test.sealed) throw new Error("test role must be sealed during search");
  if (roles.some((role) => role.name === "train" && role.sealed)) throw new Error("train cannot be sealed");
}
