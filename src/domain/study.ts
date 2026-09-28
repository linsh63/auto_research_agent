import { z } from "zod";

export const StudyStatusSchema = z.enum(["draft", "frozen", "baseline_passed", "baseline_failed", "exploring", "candidate_frozen", "confirmation_ready", "confirmation_consumed", "analyzed", "closed"]);
export const AnalysisDesignSchema = z.enum(["paired_repeated_run", "seed_by_corruption"]);

const UnitAttributeSchema=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const ExperimentalUnitSchema=z.object({
  id:z.string().min(1),kind:z.string().min(2),clusterId:z.string().min(1).nullable().default(null),
  attributes:z.record(z.string(),UnitAttributeSchema).default({}),legacySeed:z.number().int().nullable().default(null),
});
export type ExperimentalUnit=z.infer<typeof ExperimentalUnitSchema>;

export const StudyDesignSchema = z.object({
  id: z.string().min(1), programId: z.string().min(1), protocolId: z.string().min(1), hypothesisSetId: z.string().min(1), evidenceMapId: z.string().min(1),
  status: StudyStatusSchema, experimentalUnit: z.string().min(5), design: AnalysisDesignSchema,
  reliabilityPolicy:z.enum(["legacy_v1_2","fact_bound_v1"]).default("legacy_v1_2"),
  units:z.array(ExperimentalUnitSchema).default([]),seeds:z.array(z.number().int()).default([]),blockingFactors:z.array(z.string()).default([]),nuisanceFactors:z.array(z.string()).default([]),
  randomizationSeed: z.number().int(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string(), updatedAt: z.string(),
}).superRefine((value,ctx)=>{const ids=value.units.map(unit=>unit.id);if(Math.max(ids.length,value.seeds.length)<2)ctx.addIssue({code:"custom",message:"At least two experimental units or legacy seeds are required"});if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Experimental unit IDs must be unique"});if(new Set(value.seeds).size!==value.seeds.length)ctx.addIssue({code:"custom",message:"Legacy seeds must be unique"});});
export type StudyDesign = z.infer<typeof StudyDesignSchema>;

export const OutcomeDefinitionSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), name: z.string().min(1), role: z.enum(["primary", "secondary", "exploratory"]),
  direction: z.enum(["maximize", "minimize"]), unit: z.string().min(1), minimumMeaningfulEffect: z.number().finite().nonnegative(), createdAt: z.string(),
});
export type OutcomeDefinition = z.infer<typeof OutcomeDefinitionSchema>;

export const DataRoleManifestSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), role: z.enum(["train", "validation", "confirmation", "audit"]),
  path: z.string().min(1), manifestHash: z.string().regex(/^[a-f0-9]{64}$/), sealed: z.boolean(), createdAt: z.string(),
});
export type DataRoleManifest = z.infer<typeof DataRoleManifestSchema>;

export const AnalysisPlanSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), design: AnalysisDesignSchema, primaryOutcomeId: z.string().min(1),
  confidenceLevel: z.number().gt(0).lt(1).default(0.95), multiplicityMethod: z.enum(["none", "holm"]).default("holm"),
  missingPolicy: z.enum(["fail", "exclude_with_reason"]), outlierPolicy: z.string().min(5), status: z.enum(["draft", "frozen"]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string(),
});
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

export const DeviationPolicySchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), allowedBeforeConfirmation: z.array(z.string()).default([]),
  forbiddenAfterVisibility: z.array(z.string()).min(1), failedRunPolicy: z.enum(["retain_and_analyze", "retain_and_exclude_with_reason", "hard_fail"]),
  missingValuePolicy: z.enum(["fail", "exclude_with_reason"]), contentHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string(),
});
export type DeviationPolicy = z.infer<typeof DeviationPolicySchema>;

export const BaselineReproductionSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), expectedMin: z.number().finite(), expectedMax: z.number().finite(),
  observed: z.number().finite().nullable(), status: z.enum(["passed", "failed"]),
  failureClass: z.enum(["environment_failure", "implementation_mismatch", "data_mismatch", "metric_mismatch", "published_result_not_reproduced", "none"]),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string(),
}).refine((value) => value.expectedMin <= value.expectedMax, { message: "expectedMin must be <= expectedMax" });
export type BaselineReproduction = z.infer<typeof BaselineReproductionSchema>;

export const CandidateFreezeSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), searchRunId: z.string().min(1), nodeId: z.string().min(1),
  nodeSignature: z.string().min(1), protocolHash: z.string().regex(/^[a-f0-9]{64}$/), analysisPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/), configHash: z.string().regex(/^[a-f0-9]{64}$/), dataManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["frozen", "approved"]), createdAt: z.string(), approvedAt: z.string().nullable().default(null), approvedBy: z.string().nullable().default(null),
});
export type CandidateFreeze = z.infer<typeof CandidateFreezeSchema>;

export const ConfirmationTokenSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), candidateFreezeId: z.string().min(1), tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["issued", "consumed"]), issuedAt: z.string(), consumedAt: z.string().nullable().default(null), runId: z.string().nullable().default(null),
});
export type ConfirmationToken = z.infer<typeof ConfirmationTokenSchema>;

export const ObservationSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), phase: z.enum(["baseline", "exploration", "confirmation"]),
  variant: z.enum(["baseline", "candidate"]), seed: z.number().int(), group: z.string().nullable().default(null), outcomeId: z.string().min(1),
  value: z.number().finite().nullable(), missingReason: z.string().nullable().default(null), runId: z.string().min(1), createdAt: z.string(),
}).refine((value) => (value.value === null) !== (value.missingReason === null), { message: "Exactly one of value or missingReason is required" });
export type Observation = z.infer<typeof ObservationSchema>;

export const UnitObservationSchema=z.object({
  id:z.string().min(1),studyId:z.string().min(1),phase:z.enum(["baseline","exploration","confirmation"]),
  variant:z.enum(["baseline","candidate"]),unitId:z.string().min(1),group:z.string().nullable().default(null),outcomeId:z.string().min(1),
  value:z.number().finite().nullable(),missingReason:z.string().nullable().default(null),runId:z.string().min(1),createdAt:z.string(),
}).refine(value=>(value.value===null)!==(value.missingReason===null),{message:"Exactly one of value or missingReason is required"});
export type UnitObservation=z.infer<typeof UnitObservationSchema>;
export type ObservationRecord=Observation|UnitObservation;

export function observationUnitId(observation:ObservationRecord):string{return "unitId" in observation?observation.unitId:`seed:${observation.seed}`;}

export const StatisticalEstimateSchema = z.object({
  id: z.string().min(1), analysisRunId: z.string().min(1), outcomeId: z.string().min(1), estimand: z.string().min(3),
  estimate: z.number().finite(), standardError: z.number().finite().nonnegative().nullable(), intervalLow: z.number().finite().nullable(), intervalHigh: z.number().finite().nullable(),
  effectSize: z.number().finite().nullable(), method: z.string().min(3), nUnits: z.number().int().positive(), createdAt: z.string(),
});
export type StatisticalEstimate = z.infer<typeof StatisticalEstimateSchema>;

export const DiagnosticResultSchema = z.object({ id: z.string().min(1), analysisRunId: z.string().min(1), name: z.string().min(2), status: z.enum(["pass", "warn", "fail"]), details: z.string().min(3), createdAt: z.string() });
export type DiagnosticResult = z.infer<typeof DiagnosticResultSchema>;

export const MultiplicityRecordSchema = z.object({ id: z.string().min(1), analysisRunId: z.string().min(1), family: z.string().min(1), comparisons: z.number().int().positive(), method: z.enum(["none", "holm"]), adjustedValues: z.array(z.number().finite()), createdAt: z.string() });
export type MultiplicityRecord = z.infer<typeof MultiplicityRecordSchema>;

export const SensitivityAnalysisSchema = z.object({ id: z.string().min(1), analysisRunId: z.string().min(1), name: z.string().min(3), estimates: z.array(z.number().finite()).min(1), conclusionStable: z.boolean(), createdAt: z.string() });
export type SensitivityAnalysis = z.infer<typeof SensitivityAnalysisSchema>;

export const AnalysisRunSchema = z.object({
  id: z.string().min(1), studyId: z.string().min(1), analysisPlanId: z.string().min(1), design: AnalysisDesignSchema,
  status: z.enum(["completed", "failed"]), inputHash: z.string().regex(/^[a-f0-9]{64}$/), implementation: z.string().min(3), createdAt: z.string(),
});
export type AnalysisRun = z.infer<typeof AnalysisRunSchema>;

export const SandboxRunSchema = z.object({
  id:z.string().min(1),studyId:z.string().nullable(),backend:z.enum(["bubblewrap","trusted_process"]),status:z.enum(["succeeded","failed","timed_out"]),
  commandHash:z.string().regex(/^[a-f0-9]{64}$/),exitCode:z.number().int().nullable(),timedOut:z.boolean(),durationMs:z.number().nonnegative(),
  gpuDevice:z.string().nullable(),artifactHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),createdAt:z.string(),finishedAt:z.string(),
});
export type SandboxRun=z.infer<typeof SandboxRunSchema>;

export const ResourceUsageSchema=z.object({id:z.string().min(1),studyId:z.string().min(1),runId:z.string().min(1),kind:z.enum(["baseline","exploration","confirmation","analysis","sandbox"]),wallMs:z.number().nonnegative(),cpuSeconds:z.number().nonnegative().nullable(),gpuSeconds:z.number().nonnegative().nullable(),peakMemoryBytes:z.number().nonnegative().nullable(),diskBytes:z.number().nonnegative().nullable(),costUsd:z.number().nonnegative().nullable(),createdAt:z.string()});
export type ResourceUsage=z.infer<typeof ResourceUsageSchema>;

export function validateDataRoles(roles: DataRoleManifest[]): void {
  const byRole = new Map(roles.map((role) => [role.role, role]));
  if (!byRole.has("train") || !byRole.has("validation") || !byRole.has("confirmation")) throw new Error("train, validation and confirmation roles are required");
  if (byRole.get("train")!.sealed || byRole.get("validation")!.sealed) throw new Error("train and validation must be visible during exploration");
  if (!byRole.get("confirmation")!.sealed) throw new Error("confirmation role must be sealed before candidate approval");
}
