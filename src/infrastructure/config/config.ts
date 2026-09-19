import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const Positive = z.number().finite().nonnegative();
export const ProjectConfigSchema = z.object({
  schemaVersion: z.literal(1),
  paths: z.object({ database: z.string(), artifacts: z.string(), index: z.string(), reports: z.string() }),
  resources: z.object({
    model: z.object({ softUsd: Positive, hardUsd: Positive, softWallMinutes: Positive, hardWallMinutes: Positive, perCallSoftSeconds: Positive, perCallHardSeconds: Positive }),
    retrieval: z.object({ softRequestSeconds: Positive, hardRequestSeconds: Positive, softParseSeconds: Positive, hardParseSeconds: Positive }),
    experiments: z.object({ softGpuHours: Positive, hardGpuHours: Positive, softCandidates: Positive, hardCandidates: Positive, softConcurrency: Positive, hardConcurrency: Positive }),
  }),
  evidence: z.object({
    metadataSources: z.array(z.string()), parserOrder: z.array(z.string()),
    passage: z.object({ targetTokens: Positive, maxTokens: Positive, overlapTokens: Positive }),
    retrieval: z.object({ defaultBackend: z.string(), fallbackBackend: z.string(), topK: Positive, indexVersion: Positive }),
  }),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

function merge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && typeof output[key] === "object" && output[key] !== null && !Array.isArray(output[key])) {
      output[key] = merge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else output[key] = value;
  }
  return output;
}

export function loadProjectConfig(path = resolve("config/defaults.yaml"), overrides: unknown = {}): ProjectConfig {
  const base = parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return ProjectConfigSchema.parse(merge(base, overrides as Record<string, unknown>));
}
