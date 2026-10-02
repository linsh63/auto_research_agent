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

export const JobFailureClassSchema=z.enum(["environment","data","scientific","budget","timeout","cancelled","worker_lost"]);
export const CapabilityAvailabilitySchema=z.enum(["available","unavailable","degraded","not_checked"]);
export const CapabilityStateSchema=z.object({status:CapabilityAvailabilitySchema,reason:z.string().nullable()}).strict();
export const PlatformCapabilitySnapshotSchema=z.object({os:z.enum(["linux","darwin","win32","other"]),arch:z.string().min(1),nodeVersion:z.string().min(1),pythonVersion:z.string().nullable(),executors:z.object({python:CapabilityStateSchema,bubblewrap:CapabilityStateSchema,pi:CapabilityStateSchema}).strict(),sandbox:CapabilityStateSchema,resourceLimits:CapabilityStateSchema,processGroups:CapabilityStateSchema,storageModes:z.array(z.enum(["local","cas_sync","remote_existing"])).min(1),filesystem:z.object({pathSeparator:z.enum(["/","\\"]),caseSensitive:z.boolean().nullable()}).strict(),ssh:z.object({client:CapabilityStateSchema,version:z.string().nullable(),sftp:CapabilityStateSchema,proxyJump:CapabilityStateSchema,multiplexing:CapabilityStateSchema}).strict(),detectedAt:z.string().min(1)}).strict();
export type PlatformCapabilitySnapshot=z.infer<typeof PlatformCapabilitySnapshotSchema>;
export const JobResourcesSchema=z.object({cpuCores:z.number().int().positive(),memoryMiB:z.number().int().positive(),diskMiB:z.number().int().positive(),gpuCount:z.number().int().nonnegative()}).strict();
export const JobLimitsSchema=z.object({wallTimeMs:z.number().int().positive(),cpuTimeSeconds:z.number().int().positive(),maxOutputBytes:z.number().int().positive(),maxArtifactBytes:z.number().int().positive()}).strict();
export const PortableRelativePathSchema=z.string().min(1).superRefine((value,context)=>{if(/[\0\r\n]/.test(value)||value.startsWith("/")||value.startsWith("\\")||/^[A-Za-z]:/.test(value)||value.split(/[\\/]/).some(part=>part===".."||part===""))context.addIssue({code:"custom",message:"Path must be a portable relative path without traversal, drive, UNC, empty segment, or control characters"});});
export const JobExecutionSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("python"),workspace:z.string().min(1),script:PortableRelativePathSchema,args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(PortableRelativePathSchema).default([])}).strict(),
  z.object({kind:z.literal("bubblewrap"),workspace:z.string().min(1),command:z.string().startsWith("/"),args:z.array(z.string()),env:z.record(z.string(),z.string()).default({}),artifactPaths:z.array(PortableRelativePathSchema).default([])}).strict(),
  z.object({kind:z.literal("pi"),prompt:z.string().min(1),sessionFile:z.string().min(1).nullable().default(null),allowedTools:z.array(z.string()).default([])}).strict(),
]);
export const JobSpecSchema=z.object({
  name:z.string().min(1),dataRole:z.enum(["exploration","confirmation"]),studyId:z.string().min(1).nullable().default(null),execution:JobExecutionSchema,
  resources:JobResourcesSchema,limits:JobLimitsSchema,priority:z.number().int().min(-100).max(100).default(0),resumable:z.boolean().default(true),maxAttempts:z.number().int().positive().max(10).default(3),platformConstraints:z.object({os:z.array(z.enum(["linux","darwin","win32"])).default([]),arch:z.array(z.string().min(1)).default([]),requiresSandbox:z.boolean().default(false),storageModes:z.array(z.enum(["local","cas_sync","remote_existing"])).default([])}).strict().optional(),
}).strict().superRefine((value,context)=>{if((value.dataRole==="confirmation")!==(value.studyId!==null))context.addIssue({code:"custom",message:"Confirmation jobs require studyId; exploration jobs must not provide it"});if(value.dataRole==="confirmation"&&value.execution.kind!=="bubblewrap")context.addIssue({code:"custom",message:"Confirmation jobs require the bubblewrap executor"});});
export type JobSpec=z.infer<typeof JobSpecSchema>;
export const JobRecordSchema=z.object({id:z.string().min(1),workspaceId:z.string().min(1),projectId:z.string().min(1),status:z.enum(["queued","running","succeeded","failed","cancelled"]),spec:JobSpecSchema,currentAttempt:z.number().int().nonnegative(),cancelRequested:z.boolean(),failureClass:JobFailureClassSchema.nullable(),failureMessage:z.string().nullable(),createdAt:z.string().min(1),updatedAt:z.string().min(1),startedAt:z.string().nullable(),finishedAt:z.string().nullable()}).strict();
export type JobRecord=z.infer<typeof JobRecordSchema>;
export const JobArtifactSchema=z.object({id:z.string().min(1),jobId:z.string().min(1),attempt:z.number().int().positive(),name:z.string().min(1),mediaType:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative(),uri:z.string().min(1),access:z.enum(["public","project","private"]).default("project"),createdAt:z.string().min(1)}).strict();
export const JobLogSchema=z.object({id:z.string().min(1),jobId:z.string().min(1),attempt:z.number().int().positive(),sequence:z.number().int().positive(),stream:z.enum(["stdout","stderr","progress","system"]),message:z.string(),data:z.unknown().nullable(),createdAt:z.string().min(1)}).strict();
export const JobReadModelSchema=z.object({job:JobRecordSchema,artifacts:z.array(JobArtifactSchema)}).strict();
export const JobLogListSchema=z.object({jobId:z.string().min(1),logs:z.array(JobLogSchema),nextSequence:z.number().int().positive().nullable()}).strict();

export const PluginPermissionSchema=z.enum(["filesystem.read","filesystem.write","network","process","gpu","model","secrets","confirmation","host.full"]);
export type PluginPermission=z.infer<typeof PluginPermissionSchema>;
export const PluginSourceRecordSchema=z.object({id:z.string().min(1),workspaceId:z.string().min(1),kind:z.enum(["local","git","npm","pi_config"]),location:z.string().min(1),label:z.string().min(1),status:z.enum(["active","unavailable","disabled"]),createdAt:z.string(),updatedAt:z.string()}).strict();
export const PluginDescriptorSchema=z.object({descriptorId:z.string().min(1),pluginId:z.string().min(1),name:z.string().min(1),version:z.string().regex(/^\d+\.\d+\.\d+$/),description:z.string().min(1),domain:z.array(z.string()),license:z.string().min(1),maintainers:z.array(z.string()),sourceId:z.string().min(1),sourceKind:z.enum(["local","git","npm","pi_config"]),sourceLocation:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),contributions:z.object({extensions:z.array(z.string()),skills:z.array(z.string()),prompts:z.array(z.string()),themes:z.array(z.string()),tools:z.array(z.string()),apps:z.array(z.string()),mcp:z.array(z.string()),scenarios:z.array(z.string())}).strict(),permissions:z.array(PluginPermissionSchema),sideEffects:z.array(z.string()),dependencies:z.array(z.string()),coreSchemaRange:z.string().min(1),piVersionRange:z.string().min(1),compatibilityStatus:z.enum(["compatible","incompatible"]),compatibilityIssues:z.array(z.string()),discoveredAt:z.string()}).strict();
export type PluginDescriptor=z.infer<typeof PluginDescriptorSchema>;
export const PluginInstallationSchema=z.object({id:z.string().min(1),workspaceId:z.string().min(1),projectId:z.string().min(1).nullable(),scope:z.enum(["project","workspace"]),pluginId:z.string().min(1),version:z.string(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),sourceId:z.string().min(1),descriptorId:z.string().min(1),status:z.enum(["installed","enabled","disabled","incompatible","failed","quarantined","removed"]),approvedPermissions:z.array(PluginPermissionSchema),cachePath:z.string().nullable(),installedAt:z.string(),updatedAt:z.string()}).strict().refine(value=>(value.scope==="project")===(value.projectId!==null),"Project scope requires projectId and workspace scope forbids it");
export const PluginPermissionDiffSchema=z.object({added:z.array(PluginPermissionSchema),removed:z.array(PluginPermissionSchema),unchanged:z.array(PluginPermissionSchema)}).strict();
export const PluginSearchResultSchema=z.object({plugins:z.array(PluginDescriptorSchema)}).strict();
export const PluginInspectionSchema=z.object({plugin:PluginDescriptorSchema,inspectionStatus:z.literal("inspected")}).strict();
export const PluginSourcesResultSchema=z.object({sources:z.array(PluginSourceRecordSchema)}).strict();
export const PluginInstallationsResultSchema=z.object({installations:z.array(PluginInstallationSchema)}).strict();
export const PluginRuntimeSelectionSchema=z.object({plugins:z.array(z.object({installationId:z.string().min(1),pluginId:z.string().min(1),version:z.string(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),cachePath:z.string().min(1),permissions:z.array(PluginPermissionSchema),contributions:PluginDescriptorSchema.shape.contributions}).strict())}).strict();


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
export const SubmitJobCommandSchema=CommandContextSchema.extend({type:z.literal("job.submit"),projectId:z.string().min(1),payload:z.object({spec:JobSpecSchema,confirmationToken:z.string().min(32).nullable().default(null)}).strict()}).strict();
export const CancelJobCommandSchema=CommandContextSchema.extend({type:z.literal("job.cancel"),projectId:z.string().min(1),payload:z.object({jobId:z.string().min(1)}).strict()}).strict();
export const RetryJobCommandSchema=CommandContextSchema.extend({type:z.literal("job.retry"),projectId:z.string().min(1),payload:z.object({jobId:z.string().min(1)}).strict()}).strict();
export const AddPluginSourceCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.source.add"),projectId:z.null(),payload:z.object({kind:z.enum(["local","git","npm","pi_config"]),location:z.string().min(1),label:z.string().min(1)}).strict()}).strict();
export const RefreshPluginSourceCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.source.refresh"),projectId:z.null(),payload:z.object({sourceId:z.string().min(1)}).strict()}).strict();
export const InstallPluginCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.install"),projectId:z.string().min(1).nullable(),payload:z.object({descriptorId:z.string().min(1),scope:z.enum(["project","workspace"]).default("project"),approvedPermissions:z.array(PluginPermissionSchema)}).strict()}).strict().superRefine((value,context)=>{if((value.payload.scope==="project")!==(value.projectId!==null))context.addIssue({code:"custom",message:"Project plugin install requires projectId; workspace install forbids it"});});
export const EnablePluginCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.enable"),projectId:z.string().min(1).nullable(),payload:z.object({installationId:z.string().min(1)}).strict()}).strict();
export const DisablePluginCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.disable"),projectId:z.string().min(1).nullable(),payload:z.object({installationId:z.string().min(1)}).strict()}).strict();
export const UpdatePluginCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.update"),projectId:z.string().min(1).nullable(),payload:z.object({installationId:z.string().min(1),targetDescriptorId:z.string().min(1),approvedPermissions:z.array(PluginPermissionSchema)}).strict()}).strict();
export const RemovePluginCommandSchema=CommandContextSchema.extend({type:z.literal("plugin.remove"),projectId:z.string().min(1).nullable(),payload:z.object({installationId:z.string().min(1)}).strict()}).strict();

export const ScientificCapabilityIdSchema=z.enum(["literature-evidence","novelty-boundary","rival-hypotheses","design-confounding","statistics-units","memory-improvement","scientific-writing"]);
export type ScientificCapabilityId=z.infer<typeof ScientificCapabilityIdSchema>;
const EvidenceCapabilityInputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("ingest"),document:z.record(z.string(),z.unknown())}).strict(),
  z.object({action:z.literal("search"),query:z.string().min(1),limit:z.number().int().positive().max(100).default(20)}).strict(),
  z.object({action:z.literal("claim-check"),claim:z.record(z.string(),z.unknown()),links:z.array(z.record(z.string(),z.unknown())).default([])}).strict(),
]);
const NoveltyCapabilityInputSchema=z.object({coverageStatus:z.enum(["complete","incomplete"]),noveltyStatus:z.enum(["unresolved","likely_overlap","supported_with_scope"]),noveltyScope:z.string().nullable().default(null),comparisons:z.array(z.object({status:z.enum(["exact_overlap","partial_overlap","distinct","unresolved"]),evidencePassageIds:z.array(z.string())}).strict()).default([]),gaps:z.array(z.object({kind:z.enum(["full_text_unavailable","search_failure","conflict","coverage","other"]),severity:z.enum(["low","medium","high"]),resolved:z.boolean()}).strict()).default([])}).strict();
const HypothesisCapabilityInputSchema=z.object({hypotheses:z.array(z.object({kind:z.enum(["target","null","rival"]),statement:z.string().min(20),prediction:z.string().min(10),falsification:z.string().min(10),discriminatingObservations:z.array(z.string().min(10)),updateRules:z.array(z.object({observation:z.string().min(10),effect:z.enum(["strengthen","weaken","refute","no_change"]),rationale:z.string().min(10)}).strict()),evidenceIds:z.array(z.string()).default([])}).strict()).min(2),rivalAbsenceJustification:z.string().min(10).nullable().default(null)}).strict();
const DesignCapabilityInputSchema=z.object({experimentalUnit:z.string().min(3),assignment:z.enum(["randomized","blocked","matched","observational"]),comparator:z.string().min(3),primaryOutcome:z.string().min(3),confounders:z.array(z.string().min(2)).default([]),controls:z.array(z.string().min(2)).default([]),repeatedMeasures:z.boolean().default(false),clusterField:z.string().min(1).nullable().default(null)}).strict();
const StatisticsCapabilityInputSchema=z.object({direction:z.enum(["maximize","minimize"]),observations:z.array(z.object({unitId:z.string().min(1),variant:z.enum(["baseline","candidate"]),value:z.number().finite().nullable(),missingReason:z.string().min(1).nullable()}).strict().refine(value=>(value.value===null)!==(value.missingReason===null),"Exactly one of value or missingReason is required")).min(2)}).strict();
const MemoryCapabilityInputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),id:z.string().min(1),memoryType:z.enum(["source","passage","claim","experiment","decision","procedure","hypothesis"]),content:z.string().min(1),evidenceIds:z.array(z.string()).default([]),applicability:z.string().default(""),invalidationCondition:z.string().nullable().default(null),revalidateAfter:z.string().nullable().default(null)}).strict(),
  z.object({action:z.enum(["review","verify"]),id:z.string().min(1),note:z.string().default("")}).strict(),
  z.object({action:z.literal("search"),query:z.string().min(1),limit:z.number().int().positive().max(100).default(10)}).strict(),
]);
const WritingCapabilityInputSchema=z.object({ledgerId:z.string().min(1),studyId:z.string().min(1).nullable().default(null),facts:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_.-]*$/),kind:z.enum(["result","design","scope","runtime","threshold","identifier"]),value:z.union([z.string(),z.number().finite(),z.boolean(),z.null()]),unit:z.string().min(1).nullable().default(null),sourceObjectId:z.string().min(1),sourcePath:z.string().min(1),sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1),requiredFactIds:z.array(z.string()).default([]),assertions:z.array(z.object({factId:z.string().min(1),assertedValue:z.union([z.string(),z.number().finite(),z.boolean(),z.null()]),context:z.string().min(3)}).strict()),report:z.record(z.string(),z.unknown())}).strict();
export const ScientificCapabilityInvocationSchema=z.discriminatedUnion("capability",[
  z.object({capability:z.literal("literature-evidence"),input:EvidenceCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("novelty-boundary"),input:NoveltyCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("rival-hypotheses"),input:HypothesisCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("design-confounding"),input:DesignCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("statistics-units"),input:StatisticsCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("memory-improvement"),input:MemoryCapabilityInputSchema}).strict(),
  z.object({capability:z.literal("scientific-writing"),input:WritingCapabilityInputSchema}).strict(),
]);
export const InvokeScientificCapabilityCommandSchema=CommandContextSchema.extend({type:z.literal("capability.invoke"),projectId:z.string().min(1),payload:ScientificCapabilityInvocationSchema}).strict();

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
  SubmitJobCommandSchema,
  CancelJobCommandSchema,
  RetryJobCommandSchema,
  AddPluginSourceCommandSchema,
  RefreshPluginSourceCommandSchema,
  InstallPluginCommandSchema,
  EnablePluginCommandSchema,
  DisablePluginCommandSchema,
  UpdatePluginCommandSchema,
  RemovePluginCommandSchema,
  InvokeScientificCapabilityCommandSchema,
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
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema,bundleVersion:z.enum(["1","2"]).default("2"),artifactPolicy:z.enum(["embed","metadata"]).default("embed"),maxEmbeddedBytes:z.number().int().positive().max(100_000_000).default(20_000_000),
}).strict();
export const GetConversationQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("conversation.get"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema, sessionId: z.string().min(1),
}).strict();
export const GetExecutionPolicyQuerySchema = z.object({
  schemaVersion: PublicSchemaVersionSchema, queryId: z.string().min(1), type: z.literal("policy.get"),
  workspaceId: z.string().min(1), projectId: z.string().min(1), actor: ActorSchema,
}).strict();
export const GetJobQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("job.get"),workspaceId:z.string().min(1),projectId:z.string().min(1),actor:ActorSchema,jobId:z.string().min(1)}).strict();
export const GetJobLogsQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("job.logs"),workspaceId:z.string().min(1),projectId:z.string().min(1),actor:ActorSchema,jobId:z.string().min(1),fromSequence:z.number().int().positive().default(1),limit:z.number().int().positive().max(1000).default(200)}).strict();
export const SearchPluginsQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("plugin.search"),workspaceId:z.string().min(1),projectId:z.null(),actor:ActorSchema,query:z.string().default(""),filters:z.object({domain:z.string().optional(),permission:PluginPermissionSchema.optional(),sourceKind:z.enum(["local","git","npm","pi_config"]).optional(),compatibleOnly:z.boolean().optional(),contribution:z.enum(["skills","tools","apps","mcp","scenarios"]).optional()}).strict().default({})}).strict();
export const InspectPluginQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("plugin.inspect"),workspaceId:z.string().min(1),projectId:z.null(),actor:ActorSchema,descriptorId:z.string().min(1)}).strict();
export const PluginSourcesQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("plugin.sources"),workspaceId:z.string().min(1),projectId:z.null(),actor:ActorSchema}).strict();
export const PluginInstallationsQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("plugin.installations"),workspaceId:z.string().min(1),projectId:z.string().min(1).nullable(),actor:ActorSchema}).strict();
export const PluginRuntimeQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("plugin.runtime"),workspaceId:z.string().min(1),projectId:z.string().min(1),actor:ActorSchema}).strict();
export const ProjectDependenciesQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("project.dependencies"),workspaceId:z.string().min(1),projectId:z.string().min(1),actor:ActorSchema}).strict();
export const ScientificCapabilityCatalogSchema=z.object({capabilities:z.array(z.object({id:ScientificCapabilityIdSchema,version:z.string().regex(/^\d+\.\d+\.\d+$/),description:z.string().min(1),operations:z.array(z.string().min(1)),sideEffects:z.array(z.string().min(1))}).strict()).length(7)}).strict();
export const ScientificCapabilityCatalogQuerySchema=z.object({schemaVersion:PublicSchemaVersionSchema,queryId:z.string().min(1),type:z.literal("capability.catalog"),workspaceId:z.string().min(1),projectId:z.string().min(1),actor:ActorSchema}).strict();
export const PublicQuerySchema = z.discriminatedUnion("type", [GetProjectStatusQuerySchema,GetProjectEventsQuerySchema,ExportProjectBundleQuerySchema,ProjectDependenciesQuerySchema,GetConversationQuerySchema,GetExecutionPolicyQuerySchema,GetJobQuerySchema,GetJobLogsQuerySchema,SearchPluginsQuerySchema,InspectPluginQuerySchema,PluginSourcesQuerySchema,PluginInstallationsQuerySchema,PluginRuntimeQuerySchema,ScientificCapabilityCatalogQuerySchema]);
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
  data: z.union([ProjectStatusReadModelSchema,z.lazy(()=>ProjectEventListSchema),z.lazy(()=>PublicProjectBundleSchema),z.lazy(()=>BundleDependencyReadModelSchema),ConversationReadModelSchema,ExecutionPolicySchema,JobReadModelSchema,JobLogListSchema,PluginSearchResultSchema,PluginInspectionSchema,PluginSourcesResultSchema,PluginInstallationsResultSchema,PluginRuntimeSelectionSchema,ScientificCapabilityCatalogSchema]).nullable(),
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
  permissions:z.array(PluginPermissionSchema).default([]),
  externalServices:z.array(z.string()).default([]),
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
export const PublicProjectBundleV1Schema=z.object({
  bundleVersion:z.literal("1"),publicSchemaVersion:z.string().min(1),exportedAt:z.string(),
  source:z.object({workspaceId:z.string().min(1),projectId:z.string().min(1)}).strict(),
  project:PublicProjectRecordSchema,events:z.array(ResearchEventEnvelopeSchema),projection:PublicProjectProjectionSchema,
  state:z.object({format:z.literal("research-scope-snapshot-v1"),program:z.unknown(),questions:z.array(z.unknown()),approvals:z.array(z.unknown()),stateHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PublicProjectBundleV1=z.infer<typeof PublicProjectBundleV1Schema>;

export const PublicBundleJsonValueSchema:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number(),z.string(),z.array(PublicBundleJsonValueSchema),z.record(z.string(),PublicBundleJsonValueSchema)]));
export const PublicBundleRowSchema=z.object({table:z.string().min(1),key:z.string().min(1),data:z.record(z.string(),PublicBundleJsonValueSchema),rowHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const PublicBundleSectionSchema=z.object({name:z.string().min(1),schemaVersion:z.literal("1"),rows:z.array(PublicBundleRowSchema),rootHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const PublicBundlePluginLockSchema=z.object({pluginId:z.string().min(1),version:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),originScope:z.enum(["project","workspace"]),permissions:z.array(z.string()),descriptor:z.record(z.string(),PublicBundleJsonValueSchema),lockHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const PublicBundleArtifactSchema=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative().nullable(),mediaType:z.string().nullable(),access:z.enum(["public","project","private"]),disposition:z.enum(["embedded","content_addressed","missing","private_omitted"]),uri:z.string().nullable(),contentBase64:z.string().nullable(),entryHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const BundleCompatibilityIssueSchema=z.object({code:z.string().min(1),severity:z.enum(["warning","error"]),subject:z.string().min(1),message:z.string().min(1)}).strict();
export const BundleCompatibilityReportSchema=z.object({status:z.enum(["ready","degraded","blocked"]),issues:z.array(BundleCompatibilityIssueSchema),checkedAt:z.string()}).strict();
export const PublicProjectBundleV2Schema=z.object({bundleVersion:z.literal("2"),format:z.literal("research-project-bundle-v2"),publicSchemaVersion:z.string().min(1),databaseSchemaVersion:z.literal(16),exportedAt:z.string(),source:z.object({workspaceId:z.string().min(1),projectId:z.string().min(1)}).strict(),manifest:z.object({sections:z.array(z.object({name:z.string(),rows:z.number().int().nonnegative(),rootHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()),pluginsRootHash:z.string().regex(/^[a-f0-9]{64}$/),artifactsRootHash:z.string().regex(/^[a-f0-9]{64}$/),redactions:z.array(z.string()),omissions:z.array(z.string())}).strict(),sections:z.array(PublicBundleSectionSchema),pluginLocks:z.array(PublicBundlePluginLockSchema),artifacts:z.array(PublicBundleArtifactSchema),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const PublicProjectBundleSchema=z.discriminatedUnion("bundleVersion",[PublicProjectBundleV1Schema,PublicProjectBundleV2Schema]);
export type PublicProjectBundle=z.infer<typeof PublicProjectBundleSchema>;
export const BundleDependencyReadModelSchema=z.object({projectId:z.string().min(1),lastImport:BundleCompatibilityReportSchema.nullable(),plugins:z.array(z.object({pluginId:z.string(),version:z.string(),contentHash:z.string(),originScope:z.enum(["project","workspace"]),status:z.enum(["available","missing","incompatible"]),permissions:z.array(z.string())}).strict()),artifacts:z.array(z.object({contentHash:z.string(),access:z.enum(["public","project","private"]),disposition:z.enum(["embedded","content_addressed","missing","private_omitted"]),status:z.enum(["available","missing","restricted"]),uri:z.string().nullable()}).strict())}).strict();

export const WorkerDescriptorSchema=z.object({workerId:z.string().min(1),protocolVersion:z.literal("1"),executors:z.array(z.enum(["python","bubblewrap","pi"])).min(1),capacity:JobResourcesSchema,gpuDevices:z.array(z.string().regex(/^\d+$/)).default([]),leaseDurationMs:z.number().int().min(100).max(300000),platform:PlatformCapabilitySnapshotSchema.nullable().optional()}).strict().refine(value=>value.gpuDevices.length>=value.capacity.gpuCount,"gpuDevices must cover advertised GPU capacity");
export type WorkerDescriptor=z.infer<typeof WorkerDescriptorSchema>;
export const AuthorizedMountSchema=z.object({source:z.string().min(1),target:z.string().startsWith("/data/")}).strict();
export const JobLeaseSchema=z.object({protocolVersion:z.literal("1"),job:JobRecordSchema,attempt:z.number().int().positive(),leaseToken:z.string().min(32),expiresAt:z.string().min(1),allocatedGpuDevices:z.array(z.string()),authorizedMounts:z.array(AuthorizedMountSchema)}).strict();
export type JobLease=z.infer<typeof JobLeaseSchema>;
const WorkerLeaseContextSchema=z.object({jobId:z.string().min(1),attempt:z.number().int().positive(),workerId:z.string().min(1),leaseToken:z.string().min(32)}).strict();
export const WorkerRequestSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("worker.claim"),requestId:z.string().min(1),worker:WorkerDescriptorSchema}).strict(),
  WorkerLeaseContextSchema.extend({type:z.literal("worker.heartbeat"),requestId:z.string().min(1),leaseDurationMs:z.number().int().min(100).max(300000)}).strict(),
  WorkerLeaseContextSchema.extend({type:z.literal("worker.log"),requestId:z.string().min(1),stream:z.enum(["stdout","stderr","progress","system"]),message:z.string(),data:z.unknown().optional()}).strict(),
  WorkerLeaseContextSchema.extend({type:z.literal("worker.complete"),requestId:z.string().min(1),artifacts:z.array(JobArtifactSchema.omit({id:true,jobId:true,attempt:true,createdAt:true}))}).strict(),
  WorkerLeaseContextSchema.extend({type:z.literal("worker.fail"),requestId:z.string().min(1),failureClass:JobFailureClassSchema,message:z.string().min(1)}).strict(),
  z.object({type:z.literal("worker.recover"),requestId:z.string().min(1)}).strict(),
]);
export type WorkerRequest=z.infer<typeof WorkerRequestSchema>;
export const WorkerResultSchema=z.object({requestId:z.string().min(1),status:z.enum(["ok","rejected"]),data:z.unknown().nullable(),error:PublicErrorSchema.nullable(),handledAt:z.string().min(1)}).strict().refine(value=>(value.status==="ok")===(value.error===null),"Worker result status and error are inconsistent");
export type WorkerResult=z.infer<typeof WorkerResultSchema>;
