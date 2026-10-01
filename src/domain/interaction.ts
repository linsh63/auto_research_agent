import { createHash } from "node:crypto";
import { z } from "zod";

const ActionQuestionDraftSchema = z.object({
  question: z.string().min(20), rationale: z.string().min(20), targetPopulation: z.string().min(3),
  intervention: z.string().min(3), comparator: z.string().min(3), primaryOutcome: z.string().min(3),
  scope: z.string().min(10), sourceIds: z.array(z.string()).default([]),
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

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  mode: "manual",
  maxAutoActionsPerTurn: 1,
  maxKnownCostUsdPerAction: 0,
  autoAllowedActionTypes: ["question.propose", "question.select"],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const ActionMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  factRefs: z.array(z.string()).default([]),
  assumptionRefs: z.array(z.string()).default([]),
  expectedInformationGain: z.enum(["low", "medium", "high"]),
  estimatedCostUsd: z.number().finite().nonnegative(),
  estimatedMinutes: z.number().int().nonnegative(),
  risks: z.array(z.string().min(1)),
  stoppingConditions: z.array(z.string().min(1)),
  requiredPermissions: z.array(z.string().min(1)),
  requiresHumanApproval: z.boolean(),
}).strict();

export const ResearchActionSchema = z.discriminatedUnion("type", [
  ActionMetadataSchema.extend({
    id: z.string().min(1), type: z.literal("question.propose"),
    input: z.object({ question: ActionQuestionDraftSchema }).strict(),
  }).strict(),
  ActionMetadataSchema.extend({
    id: z.string().min(1), type: z.literal("question.select"),
    input: z.object({ questionId: z.string().min(1) }).strict(),
  }).strict(),
  ActionMetadataSchema.extend({
    id: z.string().min(1), type: z.literal("scope.approve"),
    input: z.object({ note: z.string() }).strict(),
  }).strict(),
]);
export type ResearchAction = z.infer<typeof ResearchActionSchema>;

export const ActionCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "free_input"]),
  title: z.string().min(1),
  description: z.string().min(1),
  action: ResearchActionSchema.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.kind === "action") !== (value.action !== null)) context.addIssue({ code: "custom", message: "Action candidates require an action; free input must not contain one" });
});
export type ActionCandidate = z.infer<typeof ActionCandidateSchema>;

export const CandidateSetSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().min(1), projectId: z.string().min(1), sessionId: z.string().min(1),
  status: z.enum(["open", "consumed", "superseded"]), candidates: z.array(ActionCandidateSchema).min(1),
  freeInputAllowed: z.literal(true), createdAt: z.string().min(1), consumedAt: z.string().nullable(),
}).strict().refine(value => value.candidates.at(-1)?.kind === "free_input", "Free input must be the final candidate");
export type CandidateSet = z.infer<typeof CandidateSetSchema>;

export const ConversationMessageSchema = z.object({
  id: z.string().min(1), sessionId: z.string().min(1), sequence: z.number().int().positive(),
  role: z.enum(["user", "assistant"]), content: z.string().min(1), createdAt: z.string().min(1),
}).strict();
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationSessionSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().min(1), projectId: z.string().min(1), title: z.string().min(1),
  status: z.enum(["active", "closed"]), createdAt: z.string().min(1), updatedAt: z.string().min(1),
}).strict();
export type ConversationSession = z.infer<typeof ConversationSessionSchema>;

export const ConversationReadModelSchema = z.object({
  session: ConversationSessionSchema,
  messages: z.array(ConversationMessageSchema),
  latestCandidates: CandidateSetSchema.nullable(),
  policy: ExecutionPolicySchema,
}).strict();
export type ConversationReadModel = z.infer<typeof ConversationReadModelSchema>;

export function actionFingerprint(action: ResearchAction): string {
  const { id: _id, ...semantic } = action;
  return createHash("sha256").update(JSON.stringify(semantic)).digest("hex");
}
