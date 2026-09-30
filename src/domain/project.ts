import { z } from "zod";
import { hashPayload } from "./research.js";

export const WorkspaceRecordSchema = z.object({
  id:z.string().min(1),name:z.string().min(1),status:z.enum(["active","archived"]),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),updatedAt:z.string(),
});
export type WorkspaceRecord=z.infer<typeof WorkspaceRecordSchema>;

export const PersistedActorSchema=z.object({
  id:z.string().min(1),workspaceId:z.string().min(1),kind:z.enum(["user","agent","worker","system"]),
  displayName:z.string().min(1).nullable(),createdAt:z.string(),updatedAt:z.string(),
});
export type PersistedActor=z.infer<typeof PersistedActorSchema>;

export const ProjectRecordSchema=z.object({
  id:z.string().min(1),workspaceId:z.string().min(1),rootProjectId:z.string().min(1),parentProjectId:z.string().min(1).nullable(),
  forkedFromEventId:z.string().min(1).nullable(),branchName:z.string().min(1),status:z.enum(["active","archived"]),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),updatedAt:z.string(),
});
export type ProjectRecord=z.infer<typeof ProjectRecordSchema>;

export const PersistedResearchEventSchema=z.object({
  schemaVersion:z.string().min(1),eventId:z.string().min(1),type:z.string().min(1),workspaceId:z.string().min(1),projectId:z.string().min(1),
  sequence:z.number().int().positive(),actor:z.object({id:z.string().min(1),kind:z.enum(["user","agent","worker","system"]),displayName:z.string().min(1).optional()}).strict(),
  causationId:z.string().min(1),correlationId:z.string().min(1),occurredAt:z.string(),payloadHash:z.string().regex(/^[a-f0-9]{64}$/),payload:z.unknown(),
}).strict();
export type PersistedResearchEvent=z.infer<typeof PersistedResearchEventSchema>;

export const ProjectProjectionSchema=z.object({
  projectId:z.string().min(1),workspaceId:z.string().min(1),rootProjectId:z.string().min(1),parentProjectId:z.string().min(1).nullable(),
  branchName:z.string().min(1),projectStatus:z.enum(["active","archived"]),researchStatus:z.string().min(1),
  lastSequence:z.number().int().nonnegative(),eventCount:z.number().int().nonnegative(),lastEventType:z.string().min(1).nullable(),updatedAt:z.string(),
  projectionHash:z.string().regex(/^[a-f0-9]{64}$/),
});
export type ProjectProjection=z.infer<typeof ProjectProjectionSchema>;

export const CommandReceiptSchema=z.object({
  commandId:z.string().min(1),workspaceId:z.string().min(1),projectScope:z.string().min(1),projectId:z.string().min(1).nullable(),
  idempotencyKey:z.string().min(1),commandHash:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(["pending","completed"]),
  result:z.unknown().nullable(),createdAt:z.string(),completedAt:z.string().nullable(),
});
export type CommandReceipt=z.infer<typeof CommandReceiptSchema>;

export const ProjectBundleSchema=z.object({
  bundleVersion:z.literal("1"),publicSchemaVersion:z.string().min(1),exportedAt:z.string(),
  source:z.object({workspaceId:z.string().min(1),projectId:z.string().min(1)}).strict(),
  project:ProjectRecordSchema,events:z.array(PersistedResearchEventSchema),projection:ProjectProjectionSchema,
  state:z.object({format:z.literal("research-scope-snapshot-v1"),program:z.unknown(),questions:z.array(z.unknown()),approvals:z.array(z.unknown()),stateHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ProjectBundle=z.infer<typeof ProjectBundleSchema>;

export function createProjectProjection(input:Omit<ProjectProjection,"projectionHash">):ProjectProjection{
  return ProjectProjectionSchema.parse({...input,projectionHash:hashPayload(input)});
}
