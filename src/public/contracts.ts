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

export const ExecutionModeSchema = z.enum(["manual", "candidate", "auto"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export const ExecutionPolicySchema = z.object({
  mode: ExecutionModeSchema,
  maxAutoActionsPerTurn: z.number().int().min(0).max(10),
  maxKnownCostUsdPerAction: z.number().finite().nonnegative(),
  autoAllowedActionTypes: z.array(z.enum(["question.propose", "question.select"])),
  updatedAt: z.string().min(1),
}).strict();
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

const ResearchActionMetadataSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), description: z.string().min(1), rationale: z.string().min(1),
  factRefs: z.array(z.string()).default([]), assumptionRefs: z.array(z.string()).default([]),
  expectedInformationGain: z.enum(["low", "medium", "high"]), estimatedCostUsd: z.number().finite().nonnegative(),
  estimatedMinutes: z.number().int().nonnegative(), risks: z.array(z.string().min(1)),
  stoppingConditions: z.array(z.string().min(1)), requiredPermissions: z.array(z.string().min(1)),
  requiresHumanApproval: z.boolean(),
}).strict();
export const ResearchActionSchema = z.discriminatedUnion("type", [
  ResearchActionMetadataSchema.extend({ type: z.literal("question.propose"), input: z.object({ question: PublicQuestionDraftSchema }).strict() }).strict(),
  ResearchActionMetadataSchema.extend({ type: z.literal("question.select"), input: z.object({ questionId: z.string().min(1) }).strict() }).strict(),
  ResearchActionMetadataSchema.extend({ type: z.literal("scope.approve"), input: z.object({ note: z.string() }).strict() }).strict(),
]);
export type ResearchAction = z.infer<typeof ResearchActionSchema>;

export const ResearchActionCandidateSchema = z.object({
  id: z.string().min(1), kind: z.enum(["action", "free_input"]), title: z.string().min(1),
  description: z.string().min(1), action: ResearchActionSchema.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.kind === "action") !== (value.action !== null)) context.addIssue({ code: "custom", message: "Candidate action shape is inconsistent" });
});
export type ResearchActionCandidate = z.infer<typeof ResearchActionCandidateSchema>;

export const CandidateSetReadModelSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().min(1), projectId: z.string().min(1), sessionId: z.string().min(1),
  status: z.enum(["open", "consumed", "superseded"]), candidates: z.array(ResearchActionCandidateSchema).min(1),
  freeInputAllowed: z.literal(true), createdAt: z.string().min(1), consumedAt: z.string().nullable(),
}).strict().refine(value => value.candidates.at(-1)?.kind === "free_input", "Free input must be the final candidate");
export type CandidateSetReadModel = z.infer<typeof CandidateSetReadModelSchema>;

export const ConversationSessionSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().min(1), projectId: z.string().min(1), title: z.string().min(1),
  status: z.enum(["active", "closed"]), createdAt: z.string().min(1), updatedAt: z.string().min(1),
}).strict();
export const ConversationMessageSchema = z.object({
  id: z.string().min(1), sessionId: z.string().min(1), sequence: z.number().int().positive(),
  role: z.enum(["user", "assistant"]), content: z.string().min(1), createdAt: z.string().min(1),
}).strict();
export const ConversationReadModelSchema = z.object({
  session: ConversationSessionSchema, messages: z.array(ConversationMessageSchema),
  latestCandidates: CandidateSetReadModelSchema.nullable(), policy: ExecutionPolicySchema,
}).strict();
export type ConversationReadModel = z.infer<typeof ConversationReadModelSchema>;

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

export const ForkProjectCommandSchema = CommandContextSchema.extend({
  type: z.literal("project.fork"),
  projectId: z.string().min(1),
  payload: z.object({ branchName: z.string().min(1), reason: z.string().min(10) }).strict(),
}).strict();

export const ImportProjectBundleCommandSchema = CommandContextSchema.extend({
  type: z.literal("project.import"),
  projectId: z.null(),
  payload: z.object({ bundle: z.lazy(() => PublicProjectBundleSchema) }).strict(),
}).strict();

export const ExecuteResearchActionCommandSchema = CommandContextSchema.extend({
  type: z.literal("action.execute"), projectId: z.string().min(1),
  payload: z.object({ action: ResearchActionSchema }).strict(),
}).strict();
export const SendConversationMessageCommandSchema = CommandContextSchema.extend({
  type: z.literal("conversation.send"), projectId: z.string().min(1),
  payload: z.object({ sessionId: z.string().min(1).nullable().default(null), message: z.string().min(1).max(20000) }).strict(),
}).strict();
export const ChooseCandidateCommandSchema = CommandContextSchema.extend({
  type: z.literal("candidate.choose"), projectId: z.string().min(1),
  payload: z.object({
    sessionId: z.string().min(1), candidateSetId: z.string().min(1),
    candidateId: z.string().min(1).nullable().default(null), freeInput: z.string().min(1).max(20000).nullable().default(null),
  }).strict().refine(value => (value.candidateId === null) !== (value.freeInput === null), "Provide exactly one of candidateId or freeInput"),
}).strict();
export const SetExecutionPolicyCommandSchema = CommandContextSchema.extend({
  type: z.literal("policy.set"), projectId: z.string().min(1),
  payload: z.object({ mode: ExecutionModeSchema, maxAutoActionsPerTurn: z.number().int().min(0).max(10),
    maxKnownCostUsdPerAction: z.number().finite().nonnegative(), autoAllowedActionTypes: z.array(z.enum(["question.propose", "question.select"])) }).strict(),
}).strict();

export const PublicCommandSchema = z.discriminatedUnion("type", [
  CreateProjectCommandSchema,
  ProposeQuestionCommandSchema,
  SelectQuestionCommandSchema,
  ApproveScopeCommandSchema,
  ForkProjectCommandSchema,
  ImportProjectBundleCommandSchema,
  ExecuteResearchActionCommandSchema,
  SendConversationMessageCommandSchema,
  ChooseCandidateCommandSchema,
  SetExecutionPolicyCommandSchema,
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
export const GetProjectEventsQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("project.events"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema,
  fromSequence: z.number().int().positive().default(1), limit: z.number().int().positive().max(1000).default(200),
}).strict();
export const ExportProjectBundleQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("project.bundle"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema,
}).strict();
export const GetConversationQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("conversation.get"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema, sessionId: z.string().min(1),
}).strict();
export const GetExecutionPolicyQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("policy.get"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema,
}).strict();
export const PublicQuerySchema = z.discriminatedUnion("type", [GetProjectStatusQuerySchema,GetProjectEventsQuerySchema,ExportProjectBundleQuerySchema,GetConversationQuerySchema,GetExecutionPolicyQuerySchema]);
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
  persistence: z.object({
    rootProjectId: z.string().min(1),
    parentProjectId: z.string().min(1).nullable(),
    branchName: z.string().min(1),
    lastEventSequence: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type ProjectStatusReadModel = z.infer<typeof ProjectStatusReadModelSchema>;

export const QueryResultSchema = z.object({
  schemaVersion: PublicSchemaVersionSchema,
  queryId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable(),
  status: z.enum(["ok", "rejected"]),
  data: z.union([ProjectStatusReadModelSchema,z.lazy(()=>ProjectEventListSchema),z.lazy(()=>PublicProjectBundleSchema),ConversationReadModelSchema,ExecutionPolicySchema]).nullable(),
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
  sequence: z.number().int().positive(),
  actor: ActorSchema,
  causationId: z.string().min(1),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.unknown(),
}).strict();
export type ResearchEventEnvelope = z.infer<typeof ResearchEventEnvelopeSchema>;

export const ProjectEventListSchema=z.object({
  schemaVersion:PublicSchemaVersionSchema,workspaceId:z.string().min(1),projectId:z.string().min(1),
  events:z.array(ResearchEventEnvelopeSchema),nextSequence:z.number().int().positive().nullable(),
}).strict();
export type ProjectEventList=z.infer<typeof ProjectEventListSchema>;

export const PublicProjectRecordSchema=z.object({
  id:z.string().min(1),workspaceId:z.string().min(1),rootProjectId:z.string().min(1),parentProjectId:z.string().min(1).nullable(),
  forkedFromEventId:z.string().min(1).nullable(),branchName:z.string().min(1),status:z.enum(["active","archived"]),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),updatedAt:z.string(),
}).strict();
export const PublicProjectProjectionSchema=z.object({
  projectId:z.string().min(1),workspaceId:z.string().min(1),rootProjectId:z.string().min(1),parentProjectId:z.string().min(1).nullable(),
  branchName:z.string().min(1),projectStatus:z.enum(["active","archived"]),researchStatus:z.string().min(1),
  lastSequence:z.number().int().nonnegative(),eventCount:z.number().int().nonnegative(),lastEventType:z.string().min(1).nullable(),updatedAt:z.string(),
  projectionHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const PublicProjectBundleSchema=z.object({
  bundleVersion:z.literal("1"),publicSchemaVersion:z.string().min(1),exportedAt:z.string(),
  source:z.object({workspaceId:z.string().min(1),projectId:z.string().min(1)}).strict(),
  project:PublicProjectRecordSchema,events:z.array(ResearchEventEnvelopeSchema),projection:PublicProjectProjectionSchema,
  state:z.object({format:z.literal("research-scope-snapshot-v1"),program:z.unknown(),questions:z.array(z.unknown()),approvals:z.array(z.unknown()),stateHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PublicProjectBundle=z.infer<typeof PublicProjectBundleSchema>;
