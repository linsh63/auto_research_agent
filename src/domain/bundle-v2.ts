import { z } from "zod";

export const BundleJsonValueSchema:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number(),z.string(),z.array(BundleJsonValueSchema),z.record(z.string(),BundleJsonValueSchema)]));
export const BundleRowSchema=z.object({table:z.string().min(1),key:z.string().min(1),data:z.record(z.string(),BundleJsonValueSchema),rowHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const BundleSectionSchema=z.object({name:z.string().min(1),schemaVersion:z.literal("1"),rows:z.array(BundleRowSchema),rootHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const BundlePluginLockSchema=z.object({pluginId:z.string().min(1),version:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),originScope:z.enum(["project","workspace"]),permissions:z.array(z.string()),descriptor:z.record(z.string(),BundleJsonValueSchema),lockHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const BundleArtifactSchema=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative().nullable(),mediaType:z.string().nullable(),access:z.enum(["public","project","private"]),disposition:z.enum(["embedded","content_addressed","missing","private_omitted"]),uri:z.string().nullable(),contentBase64:z.string().nullable(),entryHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const BundleCompatibilityIssueSchema=z.object({code:z.string().min(1),severity:z.enum(["warning","error"]),subject:z.string().min(1),message:z.string().min(1)}).strict();
export const BundleCompatibilityReportSchema=z.object({status:z.enum(["ready","degraded","blocked"]),issues:z.array(BundleCompatibilityIssueSchema),checkedAt:z.string()}).strict();
export type BundleCompatibilityReport=z.infer<typeof BundleCompatibilityReportSchema>;
export const ProjectBundleV2Schema=z.object({
  bundleVersion:z.literal("2"),format:z.literal("research-project-bundle-v2"),publicSchemaVersion:z.string().min(1),databaseSchemaVersion:z.literal(16),exportedAt:z.string(),
  source:z.object({workspaceId:z.string().min(1),projectId:z.string().min(1)}).strict(),
  manifest:z.object({sections:z.array(z.object({name:z.string(),rows:z.number().int().nonnegative(),rootHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()),pluginsRootHash:z.string().regex(/^[a-f0-9]{64}$/),artifactsRootHash:z.string().regex(/^[a-f0-9]{64}$/),redactions:z.array(z.string()),omissions:z.array(z.string())}).strict(),
  sections:z.array(BundleSectionSchema),pluginLocks:z.array(BundlePluginLockSchema),artifacts:z.array(BundleArtifactSchema),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ProjectBundleV2=z.infer<typeof ProjectBundleV2Schema>;
export const BundleDependencyReadModelSchema=z.object({projectId:z.string().min(1),lastImport:BundleCompatibilityReportSchema.nullable(),plugins:z.array(z.object({pluginId:z.string(),version:z.string(),contentHash:z.string(),originScope:z.enum(["project","workspace"]),status:z.enum(["available","missing","incompatible"]),permissions:z.array(z.string())}).strict()),artifacts:z.array(z.object({contentHash:z.string(),access:z.enum(["public","project","private"]),disposition:z.enum(["embedded","content_addressed","missing","private_omitted"]),status:z.enum(["available","missing","restricted"]),uri:z.string().nullable()}).strict())}).strict();
