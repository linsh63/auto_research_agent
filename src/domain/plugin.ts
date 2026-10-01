import { createHash } from "node:crypto";
import { z } from "zod";

export const PluginPermissionSchema=z.enum(["filesystem.read","filesystem.write","network","process","gpu","model","secrets","confirmation","host.full"]);
export type PluginPermission=z.infer<typeof PluginPermissionSchema>;
export const PluginSourceSchema=z.object({id:z.string().min(1),workspaceId:z.string().min(1),kind:z.enum(["local","git","npm","pi_config"]),location:z.string().min(1),label:z.string().min(1),status:z.enum(["active","unavailable","disabled"]),createdAt:z.string(),updatedAt:z.string()}).strict();
export type PluginSource=z.infer<typeof PluginSourceSchema>;
const ContributionsSchema=z.object({extensions:z.array(z.string()),skills:z.array(z.string()),prompts:z.array(z.string()),themes:z.array(z.string()),tools:z.array(z.string()),apps:z.array(z.string()),mcp:z.array(z.string()),scenarios:z.array(z.string())}).strict();
export const PluginDescriptorSchema=z.object({
  descriptorId:z.string().min(1),pluginId:z.string().regex(/^[a-zA-Z0-9@][a-zA-Z0-9@/._-]*$/),name:z.string().min(1),version:z.string().regex(/^\d+\.\d+\.\d+$/),description:z.string().min(1),domain:z.array(z.string()),
  license:z.string().min(1),maintainers:z.array(z.string()),sourceId:z.string().min(1),sourceKind:z.enum(["local","git","npm","pi_config"]),sourceLocation:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
  contributions:ContributionsSchema,permissions:z.array(PluginPermissionSchema),sideEffects:z.array(z.string()),dependencies:z.array(z.string()),
  coreSchemaRange:z.string().min(1),piVersionRange:z.string().min(1),compatibilityStatus:z.enum(["compatible","incompatible"]),compatibilityIssues:z.array(z.string()),discoveredAt:z.string(),
}).strict();
export type PluginDescriptor=z.infer<typeof PluginDescriptorSchema>;
export const PluginInstallationSchema=z.object({
  id:z.string().min(1),workspaceId:z.string().min(1),projectId:z.string().min(1).nullable(),scope:z.enum(["project","workspace"]),pluginId:z.string().min(1),version:z.string(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),sourceId:z.string().min(1),descriptorId:z.string().min(1),
  status:z.enum(["installed","enabled","disabled","incompatible","failed","quarantined","removed"]),approvedPermissions:z.array(PluginPermissionSchema),cachePath:z.string().nullable(),installedAt:z.string(),updatedAt:z.string(),
}).strict().refine(value=>(value.scope==="project")===(value.projectId!==null),"Project scope requires projectId and workspace scope forbids it");
export type PluginInstallation=z.infer<typeof PluginInstallationSchema>;
export const PluginPermissionDiffSchema=z.object({added:z.array(PluginPermissionSchema),removed:z.array(PluginPermissionSchema),unchanged:z.array(PluginPermissionSchema)}).strict();
export type PluginPermissionDiff=z.infer<typeof PluginPermissionDiffSchema>;
export function permissionDiff(before:PluginPermission[],after:PluginPermission[]):PluginPermissionDiff{const a=new Set(before),b=new Set(after);return PluginPermissionDiffSchema.parse({added:after.filter(item=>!a.has(item)),removed:before.filter(item=>!b.has(item)),unchanged:after.filter(item=>a.has(item))});}
export function hashJson(value:unknown):string{return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
