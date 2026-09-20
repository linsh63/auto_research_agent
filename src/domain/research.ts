import { createHash } from "node:crypto";
import { z } from "zod";

export const ResearchProfileSchema = z.enum(["smoke", "exploratory", "confirmatory"]);
export type ResearchProfile = z.infer<typeof ResearchProfileSchema>;

export const ProgramStatusSchema = z.enum(["draft", "scoped", "protocol_ready", "frozen", "confirmation_observed", "closed", "derived"]);
export type ProgramStatus = z.infer<typeof ProgramStatusSchema>;

export const QuestionStatusSchema = z.enum(["proposed", "selected", "superseded", "rejected"]);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

export const ProtocolStatusSchema = z.enum(["draft", "approved", "frozen", "deviated", "closed"]);
export type ProtocolStatus = z.infer<typeof ProtocolStatusSchema>;

export const ApprovalKindSchema = z.enum(["scope", "protocol"]);
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;

export const ResearchIntentSchema = z.object({
  title: z.string().min(3),
  direction: z.string().min(20),
  domain: z.string().min(2).default("AI/ML"),
  constraints: z.array(z.string().min(2)).default([]),
  allowedData: z.array(z.string().min(2)).default([]),
  prohibitions: z.array(z.string().min(2)).default([]),
  profile: ResearchProfileSchema.default("confirmatory"),
  budget: z.object({
    gpuHours: z.number().finite().positive().default(12),
    wallHours: z.number().finite().positive().default(24),
    diskGiB: z.number().finite().positive().default(20),
    modelCalls: z.number().int().positive().default(20),
    knownCostUsd: z.number().finite().nonnegative().default(10),
  }).default({ gpuHours: 12, wallHours: 24, diskGiB: 20, modelCalls: 20, knownCostUsd: 10 }),
});
export type ResearchIntent = z.infer<typeof ResearchIntentSchema>;

export const ResearchProgramSchema = ResearchIntentSchema.extend({
  id: z.string().min(1),
  status: ProgramStatusSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  derivedFromId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResearchProgram = z.infer<typeof ResearchProgramSchema>;

export const ResearchQuestionSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  version: z.number().int().positive(),
  status: QuestionStatusSchema,
  question: z.string().min(20),
  rationale: z.string().min(20),
  targetPopulation: z.string().min(3),
  intervention: z.string().min(3),
  comparator: z.string().min(3),
  primaryOutcome: z.string().min(3),
  scope: z.string().min(10),
  sourceIds: z.array(z.string()).default([]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  supersedesId: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;

export const AssumptionSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
  statement: z.string().min(10),
  invalidationCondition: z.string().min(5),
  status: z.enum(["open", "supported", "challenged", "invalidated"]).default("open"),
  evidenceIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const ResearchProtocolSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  questionId: z.string().min(1),
  version: z.number().int().positive(),
  profile: ResearchProfileSchema,
  status: ProtocolStatusSchema,
  primaryOutcome: z.string().min(3),
  secondaryOutcomes: z.array(z.string().min(3)).default([]),
  exploratoryOutcomes: z.array(z.string().min(3)).default([]),
  experimentUnit: z.string().min(3),
  dataRoles: z.object({ train: z.string().min(1), validation: z.string().min(1), confirmation: z.string().min(1) }),
  analysisPlan: z.string().min(20),
  stoppingRules: z.array(z.string().min(5)).min(1),
  allowedChanges: z.array(z.string().min(3)).default([]),
  baselineTolerance: z.string().min(5),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parentId: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ResearchProtocol = z.infer<typeof ResearchProtocolSchema>;

export const ProtocolDeviationSchema = z.object({
  id: z.string().min(1),
  protocolId: z.string().min(1),
  reason: z.string().min(10),
  observedData: z.boolean().default(false),
  requestedChange: z.string().min(10),
  approved: z.boolean().default(false),
  actor: z.string().min(1),
  createdAt: z.string(),
});
export type ProtocolDeviation = z.infer<typeof ProtocolDeviationSchema>;

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  kind: ApprovalKindSchema,
  objectId: z.string().min(1),
  objectHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["approved", "rejected"]),
  actor: z.string().min(1),
  note: z.string().default(""),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ProtocolFreezeSchema = z.object({
  id: z.string().min(1),
  protocolId: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedBy: z.string().min(1),
  createdAt: z.string(),
});
export type ProtocolFreeze = z.infer<typeof ProtocolFreezeSchema>;

export const RunDerivationSchema = z.object({
  id: z.string().min(1),
  parentProgramId: z.string().min(1),
  childProgramId: z.string().min(1),
  reason: z.string().min(10),
  observedData: z.array(z.string()).default([]),
  actor: z.string().min(1),
  createdAt: z.string(),
});
export type RunDerivation = z.infer<typeof RunDerivationSchema>;

export const VisibilityEventSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  runId: z.string().min(1),
  dataRole: z.enum(["confirmation", "test", "audit"]),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  observedAt: z.string(),
});
export type VisibilityEvent = z.infer<typeof VisibilityEventSchema>;

export function hashPayload(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertProtocolCanFreeze(protocol: ResearchProtocol, approved: boolean): void {
  if (protocol.status !== "approved") throw new Error(`Protocol must be approved before freeze; got ${protocol.status}`);
  if (!approved) throw new Error("Protocol approval record is required before freeze");
  if (protocol.profile === "confirmatory" && protocol.exploratoryOutcomes.includes(protocol.primaryOutcome)) {
    throw new Error("Primary outcome cannot also be exploratory");
  }
}

export function assertConfirmationAllowed(protocol: ResearchProtocol, observedConfirmation: boolean): void {
  if (protocol.status !== "frozen" && protocol.status !== "deviated") throw new Error("Confirmation requires a frozen protocol");
  if (observedConfirmation) throw new Error("Confirmation has already been observed; derive a new run");
}
