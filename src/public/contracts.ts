import { z } from "zod";

export const PUBLIC_SCHEMA_VERSION = "1.0.0" as const;
export const PublicSchemaVersionSchema = z.literal(PUBLIC_SCHEMA_VERSION);

export const ActorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["user", "agent", "worker", "system"]),
  displayName: z.string().min(1).optional(),
}).strict();
export type Actor = z.infer<typeof ActorSchema>;

const CommandContextSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  commandId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  actor: ActorSchema,
  issuedAt: z.string().min(1),
}).strict();

export const PublicResearchIntentSchema = z.object({
  title: z.string().min(3),
  direction: z.string().min(20),
  domain: z.string().min(2).default("AI/ML"),
  constraints: z.array(z.string().min(2)).default([]),
  allowedData: z.array(z.string().min(2)).default([]),
  prohibitions: z.array(z.string().min(2)).default([]),
  profile: z.enum(["smoke", "exploratory", "confirmatory"]).default("confirmatory"),
  budget: z.object({
    gpuHours: z.number().finite().positive().default(12),
    wallHours: z.number().finite().positive().default(24),
    diskGiB: z.number().finite().positive().default(20),
    modelCalls: z.number().int().positive().default(20),
    knownCostUsd: z.number().finite().nonnegative().default(10),
  }).default({ gpuHours: 12, wallHours: 24, diskGiB: 20, modelCalls: 20, knownCostUsd: 10 }),
}).strict();

export const PublicQuestionDraftSchema = z.object({
  question: z.string().min(20),
  rationale: z.string().min(20),
  targetPopulation: z.string().min(3),
  intervention: z.string().min(3),
  comparator: z.string().min(3),
  primaryOutcome: z.string().min(3),
  scope: z.string().min(10),
  sourceIds: z.array(z.string()).default([]),
  supersedesId: z.string().min(1).nullable().optional(),
}).strict();

export const CreateProjectCommandSchema = CommandContextSchema.extend({
  type: z.literal("project.create"),
  projectId: z.null(),
  payload: z.object({ intent: PublicResearchIntentSchema }).strict(),
}).strict();

export const ProposeQuestionCommandSchema = CommandContextSchema.extend({
  type: z.literal("question.propose"),
  projectId: z.string().min(1),
  payload: z.object({ question: PublicQuestionDraftSchema }).strict(),
}).strict();

export const SelectQuestionCommandSchema = CommandContextSchema.extend({
  type: z.literal("question.select"),
  projectId: z.string().min(1),
  payload: z.object({ questionId: z.string().min(1) }).strict(),
}).strict();

export const ApproveScopeCommandSchema = CommandContextSchema.extend({
  type: z.literal("scope.approve"),
  projectId: z.string().min(1),
  payload: z.object({ note: z.string().default("") }).strict(),
}).strict();

export const PublicCommandSchema = z.discriminatedUnion("type", [
  CreateProjectCommandSchema,
  ProposeQuestionCommandSchema,
  SelectQuestionCommandSchema,
  ApproveScopeCommandSchema,
]);
export type PublicCommand = z.infer<typeof PublicCommandSchema>;

export const GetProjectStatusQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  queryId: z.string().min(1),
  type: z.literal("project.status"),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  actor: ActorSchema,
}).strict();
export const PublicQuerySchema = z.discriminatedUnion("type", [GetProjectStatusQuerySchema]);
export type PublicQuery = z.infer<typeof PublicQuerySchema>;

export const PublicErrorCodeSchema = z.enum([
  "INVALID_COMMAND",
  "INCOMPATIBLE_VERSION",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "GATE_REJECTED",
  "INTERNAL",
]);
export type PublicErrorCode = z.infer<typeof PublicErrorCodeSchema>;
export const PublicErrorSchema = z.object({
  code: PublicErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type PublicError = z.infer<typeof PublicErrorSchema>;

export const CommandResultSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  commandId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable(),
  status: z.enum(["accepted", "rejected"]),
  data: z.unknown().nullable(),
  error: PublicErrorSchema.nullable(),
  eventIds: z.array(z.string()).default([]),
  handledAt: z.string().min(1),
}).strict().refine(value => (value.status === "accepted") === (value.error === null), {
  message: "Accepted results cannot contain errors and rejected results require an error",
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

export const ProjectSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  direction: z.string().min(1),
  domain: z.string().min(1),
  profile: z.enum(["smoke", "exploratory", "confirmatory"]),
  status: z.enum(["draft", "scoped", "protocol_ready", "frozen", "confirmation_observed", "closed", "derived"]),
  updatedAt: z.string().min(1),
}).strict();

export const QuestionSummarySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["proposed", "selected", "superseded", "rejected"]),
  question: z.string().min(1),
}).strict();

export const ProjectStatusReadModelSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  workspaceId: z.string().min(1),
  project: ProjectSummarySchema,
  questions: z.array(QuestionSummarySchema),
  counts: z.object({
    assumptions: z.number().int().nonnegative(),
    hypothesisSets: z.number().int().nonnegative(),
    protocols: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    deviations: z.number().int().nonnegative(),
    derivations: z.number().int().nonnegative(),
  }).strict(),
  confirmationObserved: z.boolean(),
}).strict();
export type ProjectStatusReadModel = z.infer<typeof ProjectStatusReadModelSchema>;

export const QueryResultSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  queryId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable(),
  status: z.enum(["ok", "rejected"]),
  data: ProjectStatusReadModelSchema.nullable(),
  error: PublicErrorSchema.nullable(),
  handledAt: z.string().min(1),
}).strict().refine(value => (value.status === "ok") === (value.error === null), {
  message: "Successful queries cannot contain errors and rejected queries require an error",
});
export type QueryResult = z.infer<typeof QueryResultSchema>;

export const ResearchEventEnvelopeSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  eventId: z.string().min(1),
  type: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  actor: ActorSchema,
  causationId: z.string().min(1),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.unknown(),
}).strict();
export type ResearchEventEnvelope = z.infer<typeof ResearchEventEnvelopeSchema>;
