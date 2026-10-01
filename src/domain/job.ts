import { z } from "zod";

export const JobFailureClassSchema=z.enum(["environment","data","scientific","budget","timeout","cancelled","worker_lost"]);
export type JobFailureClass=z.infer<typeof JobFailureClassSchema>;

export const JobResourcesSchema=z.object({
  cpuCores:z.number().int().positive(),memoryMiB:z.number().int().positive(),diskMiB:z.number().int().positive(),gpuCount:z.number().int().nonnegative(),
}).strict();
export type JobResources=z.infer<typeof JobResourcesSchema>;

export const JobLimitsSchema=z.object({
  wallTimeMs:z.number().int().positive(),cpuTimeSeconds:z.number().int().positive(),maxOutputBytes:z.number().int().positive(),maxArtifactBytes:z.number().int().positive(),
}).strict();

export const AuthorizedMountSchema=z.object({source:z.string().min(1),target:z.string().startsWith("/data/")}).strict();
export const JobExecutionSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("python"),workspace:z.string().min(1),script:z.string().min(1),args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(z.string()).default([])}).strict(),
  z.object({kind:z.literal("bubblewrap"),workspace:z.string().min(1),command:z.string().startsWith("/"),args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(z.string()).default([])}).strict(),
  z.object({kind:z.literal("pi"),prompt:z.string().min(1),sessionFile:z.string().min(1).nullable().default(null),allowedTools:z.array(z.string()).default([])}).strict(),
]);
export type JobExecution=z.infer<typeof JobExecutionSchema>;

export const JobSpecSchema=z.object({
  name:z.string().min(1),dataRole:z.enum(["exploration","confirmation"]),studyId:z.string().min(1).nullable().default(null),
  execution:JobExecutionSchema,resources:JobResourcesSchema,limits:JobLimitsSchema,priority:z.number().int().min(-100).max(100).default(0),
  resumable:z.boolean().default(true),maxAttempts:z.number().int().positive().max(10).default(3),
}).strict().superRefine((value,context)=>{
  if((value.dataRole==="confirmation")!==(value.studyId!==null))context.addIssue({code:"custom",message:"Confirmation jobs require studyId; exploration jobs must not provide it"});
  if(value.dataRole==="confirmation"&&value.execution.kind!=="bubblewrap")context.addIssue({code:"custom",message:"Confirmation jobs require the bubblewrap executor"});
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

export const JobArtifactSchema=z.object({id:z.string().min(1),jobId:z.string().min(1),attempt:z.number().int().positive(),name:z.string().min(1),mediaType:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative(),uri:z.string().min(1),createdAt:z.string().min(1)}).strict();
export type JobArtifact=z.infer<typeof JobArtifactSchema>;

export const WorkerDescriptorSchema=z.object({
  workerId:z.string().min(1),protocolVersion:z.literal("1"),executors:z.array(z.enum(["python","bubblewrap","pi"])).min(1),
  capacity:JobResourcesSchema,gpuDevices:z.array(z.string().regex(/^\d+$/)).default([]),leaseDurationMs:z.number().int().min(100).max(300000),
}).strict().refine(value=>value.gpuDevices.length>=value.capacity.gpuCount,"gpuDevices must cover advertised GPU capacity");
export type WorkerDescriptor=z.infer<typeof WorkerDescriptorSchema>;

export const JobLeaseSchema=z.object({
  protocolVersion:z.literal("1"),job:JobRecordSchema,attempt:z.number().int().positive(),leaseToken:z.string().min(32),expiresAt:z.string().min(1),
  allocatedGpuDevices:z.array(z.string()),authorizedMounts:z.array(AuthorizedMountSchema),
}).strict();
export type JobLease=z.infer<typeof JobLeaseSchema>;
