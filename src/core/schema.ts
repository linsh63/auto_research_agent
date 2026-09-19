import { z } from "zod";

export const CommandSchema = z.object({
  program: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

export const ExperimentSchema = z.object({
  workspace: z.string().min(1),
  baseline: CommandSchema,
  candidate: CommandSchema,
  metric: z.string().min(1),
  direction: z.enum(["maximize", "minimize"]),
  seed: z.number().int().default(42),
  pairedSeeds: z.array(z.number().int()).min(1).optional(),
  protocol: z.string().optional(),
  successCriterion: z.string().min(5).optional(),
  execution: z.enum(["process", "docker"]).default("docker"),
  dockerImage: z.string().optional(),
}).refine((value) => value.execution !== "docker" || Boolean(value.dockerImage), {
  message: "dockerImage is required for docker execution",
  path: ["dockerImage"],
});

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  url: z.url(),
  year: z.number().int().optional(),
  authors: z.array(z.string()).default([]),
  abstract: z.string().default(""),
  doi: z.string().optional(),
  origin: z.string(),
  accessedAt: z.string(),
});

export const SeedSourceSchema = SourceSchema.omit({ id: true, accessedAt: true, origin: true }).extend({
  origin: z.string().default("provided"),
});

export const BriefSchema = z.object({
  title: z.string().min(3),
  question: z.string().min(10),
  domain: z.string().default("AI"),
  keywords: z.array(z.string().min(2)).min(1),
  seedSources: z.array(SeedSourceSchema).default([]),
  sourceUrls: z.array(z.url()).default([]),
  startYear: z.number().int().min(1900).optional(),
  endYear: z.number().int().min(1900).optional(),
  experiment: ExperimentSchema,
  limits: z.object({
    maxModelCalls: z.number().int().positive().default(8),
    maxWallMinutes: z.number().positive().default(30),
    maxExperimentSeconds: z.number().positive().default(120),
    maxIterations: z.literal(1).default(1),
  }).default({ maxModelCalls: 8, maxWallMinutes: 30, maxExperimentSeconds: 120, maxIterations: 1 }),
  publicMaterialsOnly: z.literal(true).default(true),
});

export const HypothesisSchema = z.object({
  statement: z.string().min(10),
  rationale: z.string().min(10),
  prediction: z.string().min(5),
  alternative: z.string().min(5),
  falsification: z.string().min(5),
  sourceIds: z.array(z.string()).default([]),
});

export const PlanSchema = z.object({
  comparison: z.string().min(10),
  replicateSeeds: z.array(z.number().int()).min(1),
  baselineDescription: z.string().min(5),
  candidateDescription: z.string().min(5),
  metricInterpretation: z.string().min(5),
  successCriterion: z.string().min(5),
  limitations: z.array(z.string()).default([]),
});

export const AnalysisSchema = z.object({
  summary: z.string().min(10),
  supportsHypothesis: z.enum(["yes", "no", "inconclusive"]),
  evidence: z.array(z.string()).min(1),
  limitations: z.array(z.string()).min(1),
  nextStep: z.string().min(5),
});

export const ReviewSchema = z.object({
  verdict: z.enum(["sound", "needs_work", "invalid"]),
  concerns: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ReviewResponseSchema = z.object({
  summary: z.string().min(10),
  conclusion: z.string().min(10),
  changes: z.array(z.object({
    requirement: z.string().min(5),
    disposition: z.enum(["addressed", "accepted_limitation"]),
    response: z.string().min(10),
    evidence: z.array(z.string()).min(1),
  })).min(1),
  remainingLimitations: z.array(z.string()),
});

export type ResearchBrief = z.infer<typeof BriefSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export type Command = z.infer<typeof CommandSchema>;

export const STAGES = [
  "evidence", "hypothesis", "plan", "approval", "baseline", "candidate",
  "analysis", "review", "final_approval", "done",
] as const;
export type Stage = typeof STAGES[number];

export interface ResearchRun {
  id: string;
  brief: ResearchBrief;
  stage: Stage;
  modelCalls: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  lastError: string | null;
}

export interface ExperimentResult {
  variant: "baseline" | "candidate";
  command: Command;
  seed: number;
  codePath: string | null;
  codeSha256: string | null;
  codeSnapshotPath: string | null;
  metric: number | null;
  details: Record<string, unknown> | null;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  startedAt: string;
  finishedAt: string;
}
