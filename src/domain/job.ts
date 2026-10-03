import { z } from "zod";

export const JobFailureClassSchema=z.enum(["environment","data","scientific","budget","timeout","cancelled","worker_lost"]);
export type JobFailureClass=z.infer<typeof JobFailureClassSchema>;
export const CapabilityAvailabilitySchema=z.enum(["available","unavailable","degraded","not_checked"]);
export const CapabilityStateSchema=z.object({status:CapabilityAvailabilitySchema,reason:z.string().nullable()}).strict();
export const PlatformCapabilitySnapshotSchema=z.object({
  os:z.enum(["linux","darwin","win32","other"]),arch:z.string().min(1),nodeVersion:z.string().min(1),pythonVersion:z.string().nullable(),
  executors:z.object({python:CapabilityStateSchema,bubblewrap:CapabilityStateSchema,pi:CapabilityStateSchema}).strict(),
  sandbox:CapabilityStateSchema,resourceLimits:CapabilityStateSchema,processGroups:CapabilityStateSchema,
  storageModes:z.array(z.enum(["local","cas_sync","remote_existing"])).min(1),
  filesystem:z.object({pathSeparator:z.enum(["/","\\"]),caseSensitive:z.boolean().nullable()}).strict(),
  ssh:z.object({client:CapabilityStateSchema,version:z.string().nullable(),sftp:CapabilityStateSchema,proxyJump:CapabilityStateSchema,multiplexing:CapabilityStateSchema}).strict(),
  detectedAt:z.string().min(1),
}).strict();
export type PlatformCapabilitySnapshot=z.infer<typeof PlatformCapabilitySnapshotSchema>;

export const JobResourcesSchema=z.object({
  cpuCores:z.number().int().positive(),memoryMiB:z.number().int().positive(),diskMiB:z.number().int().positive(),gpuCount:z.number().int().nonnegative(),
}).strict();
export type JobResources=z.infer<typeof JobResourcesSchema>;

export const JobLimitsSchema=z.object({
  wallTimeMs:z.number().int().positive(),cpuTimeSeconds:z.number().int().positive(),maxOutputBytes:z.number().int().positive(),maxArtifactBytes:z.number().int().positive(),
}).strict();

export const PortableRelativePathSchema=z.string().min(1).superRefine((value,context)=>{if(/[\0\r\n]/.test(value)||value.startsWith("/")||value.startsWith("\\")||/^[A-Za-z]:/.test(value)||value.split(/[\\/]/).some(part=>part===".."||part===""))context.addIssue({code:"custom",message:"Path must be a portable relative path without traversal, drive, UNC, empty segment, or control characters"});});
export const ContentHashSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const PortableWorkspaceSpecSchema=z.object({
  workspaceMode:z.enum(["cas_sync","remote_existing"]),
  inputs:z.array(z.object({contentHash:ContentHashSchema,bytes:z.number().int().nonnegative(),access:z.enum(["public","project","private"]),target:PortableRelativePathSchema}).strict()).default([]),
  remoteData:z.array(z.object({alias:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),manifestHash:ContentHashSchema,target:z.string().regex(/^\/data\/[A-Za-z0-9._/-]+$/).refine(value=>!value.split("/").includes("..")),access:z.enum(["project","private"]).default("project")}).strict()).default([]),
  outputs:z.array(z.object({name:z.string().min(1),path:PortableRelativePathSchema,mediaType:z.string().min(1),access:z.enum(["public","project","private"]).default("project"),maxBytes:z.number().int().positive()}).strict()).default([]),
  transferQuotaBytes:z.number().int().positive(),
}).strict().superRefine((value,context)=>{const paths=[...value.inputs.map(item=>item.target),...value.outputs.map(item=>item.path)];if(new Set(paths.map(item=>item.toLowerCase())).size!==paths.length)context.addIssue({code:"custom",message:"Portable workspace paths must not collide, including case-insensitive filesystems"});});
export type PortableWorkspaceSpec=z.infer<typeof PortableWorkspaceSpecSchema>;
export const AuthorizedMountSchema=z.union([
  z.object({source:z.string().min(1),target:z.string().startsWith("/data/")}).strict(),
  z.object({kind:z.literal("remote_alias"),alias:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),manifestHash:ContentHashSchema,target:z.string().startsWith("/data/")}).strict(),
]);
export const JobExecutionSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("python"),workspace:z.string().min(1),script:PortableRelativePathSchema,args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(PortableRelativePathSchema).default([])}).strict(),
  z.object({kind:z.literal("bubblewrap"),workspace:z.string().min(1),command:z.string().startsWith("/"),args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(PortableRelativePathSchema).default([])}).strict(),
  z.object({kind:z.literal("pi"),prompt:z.string().min(1),sessionFile:z.string().min(1).nullable().default(null),allowedTools:z.array(z.string()).default([])}).strict(),
]);
export type JobExecution=z.infer<typeof JobExecutionSchema>;

export const JobSpecSchema=z.object({
  name:z.string().min(1),dataRole:z.enum(["exploration","confirmation"]),studyId:z.string().min(1).nullable().default(null),
  execution:JobExecutionSchema,resources:JobResourcesSchema,limits:JobLimitsSchema,priority:z.number().int().min(-100).max(100).default(0),
  resumable:z.boolean().default(true),maxAttempts:z.number().int().positive().max(10).default(3),
  executionPhase:z.enum(["general","baseline","exploration"]).default("general"),baselineGate:z.object({resultId:z.string().min(1),resultHash:ContentHashSchema}).strict().optional(),
  portableWorkspace:PortableWorkspaceSpecSchema.optional(),
  platformConstraints:z.object({os:z.array(z.enum(["linux","darwin","win32"])).default([]),arch:z.array(z.string().min(1)).default([]),requiresSandbox:z.boolean().default(false),storageModes:z.array(z.enum(["local","cas_sync","remote_existing"])).default([])}).strict().optional(),
}).strict().superRefine((value,context)=>{
  if((value.dataRole==="confirmation")!==(value.studyId!==null))context.addIssue({code:"custom",message:"Confirmation jobs require studyId; exploration jobs must not provide it"});
  if(value.dataRole==="confirmation"&&value.execution.kind!=="bubblewrap")context.addIssue({code:"custom",message:"Confirmation jobs require the bubblewrap executor"});
  if(value.portableWorkspace&&value.execution.kind==="pi")context.addIssue({code:"custom",message:"Portable workspaces do not support the Pi executor"});
  if(value.portableWorkspace&&value.execution.kind!=="pi"&&value.execution.artifactPaths.length)context.addIssue({code:"custom",message:"Portable jobs declare outputs in portableWorkspace.outputs"});
  if(value.dataRole==="confirmation"&&value.portableWorkspace&&!value.portableWorkspace.remoteData.some(item=>item.target==="/data/confirmation"))context.addIssue({code:"custom",message:"Portable confirmation jobs require a /data/confirmation remote alias"});
  if(value.executionPhase==="exploration"&&!value.baselineGate)context.addIssue({code:"custom",message:"Exploration jobs require a passed baseline gate"});
  if(value.executionPhase!=="exploration"&&value.baselineGate)context.addIssue({code:"custom",message:"baselineGate is only valid for exploration jobs"});
});
export type JobSpec=z.infer<typeof JobSpecSchema>;

export const JobRecordSchema=z.object({
  id:z.string().min(1),workspaceId:z.string().min(1),projectId:z.string().min(1),status:z.enum(["queued","running","succeeded","failed","cancelled"]),
  spec:JobSpecSchema,currentAttempt:z.number().int().nonnegative(),cancelRequested:z.boolean(),failureClass:JobFailureClassSchema.nullable(),failureMessage:z.string().nullable(),
  createdAt:z.string().min(1),updatedAt:z.string().min(1),startedAt:z.string().nullable(),finishedAt:z.string().nullable(),
}).strict();
export type JobRecord=z.infer<typeof JobRecordSchema>;

export const JobLogSchema=z.object({id:z.string().min(1),jobId:z.string().min(1),attempt:z.number().int().positive(),sequence:z.number().int().positive(),stream:z.enum(["stdout","stderr","progress","system"]),message:z.string(),data:z.unknown().nullable(),createdAt:z.string().min(1)}).strict();
export type JobLog=z.infer<typeof JobLogSchema>;

export const JobArtifactSchema=z.object({id:z.string().min(1),jobId:z.string().min(1),attempt:z.number().int().positive(),name:z.string().min(1),mediaType:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative(),uri:z.string().min(1),access:z.enum(["public","project","private"]).default("project"),createdAt:z.string().min(1)}).strict();
export type JobArtifact=z.infer<typeof JobArtifactSchema>;

export const WorkerDescriptorSchema=z.object({
  workerId:z.string().min(1),protocolVersion:z.literal("1"),executors:z.array(z.enum(["python","bubblewrap","pi"])).min(1),
  capacity:JobResourcesSchema,gpuDevices:z.array(z.string().regex(/^\d+$/)).default([]),leaseDurationMs:z.number().int().min(100).max(300000),platform:PlatformCapabilitySnapshotSchema.nullable().optional(),
}).strict().refine(value=>value.gpuDevices.length>=value.capacity.gpuCount,"gpuDevices must cover advertised GPU capacity");
export type WorkerDescriptor=z.infer<typeof WorkerDescriptorSchema>;

export const JobLeaseSchema=z.object({
  protocolVersion:z.literal("1"),job:JobRecordSchema,attempt:z.number().int().positive(),leaseToken:z.string().min(32),expiresAt:z.string().min(1),
  allocatedGpuDevices:z.array(z.string()),authorizedMounts:z.array(AuthorizedMountSchema),
}).strict();
export type JobLease=z.infer<typeof JobLeaseSchema>;
