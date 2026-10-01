import { z } from "zod";
import { JobSpecSchema, PluginPermissionSchema as ScenarioPermissionSchema, type JobSpec, type PluginPermission as ScenarioPermission } from "./contracts.js";

export const SCENARIO_SDK_VERSION="1.0.0" as const;
export { ScenarioPermissionSchema };
export type { ScenarioPermission };

export const ScenarioBudgetSchema=z.object({maxWallTimeMs:z.number().int().positive(),maxCpuCores:z.number().int().positive(),maxMemoryMiB:z.number().int().positive(),maxDiskMiB:z.number().int().positive(),maxGpuCount:z.number().int().nonnegative(),maxKnownCostUsd:z.number().nonnegative()}).strict();
export const ScenarioArtifactDeclarationSchema=z.object({name:z.string().min(1),mediaType:z.string().min(1),required:z.boolean(),maxBytes:z.number().int().positive(),access:z.enum(["public","project","private"])}).strict();
export const ScenarioCapabilitySchema=z.object({id:z.string().min(1),kind:z.enum(["data","experiment","evaluation","analysis","domain"]),description:z.string().min(1),permissions:z.array(ScenarioPermissionSchema),inputSchema:z.record(z.string(),z.unknown()),outputSchema:z.record(z.string(),z.unknown()),failureClasses:z.array(z.enum(["environment","data","scientific","budget","timeout","cancelled","worker_lost"]))}).strict();
export const ScenarioManifestSchema=z.object({
  id:z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),name:z.string().min(1),version:z.string().regex(/^\d+\.\d+\.\d+$/),description:z.string().min(1),domain:z.string().min(1),
  scenarioSdkVersion:z.literal(SCENARIO_SDK_VERSION),coreSchemaRange:z.string().min(1),languages:z.array(z.enum(["typescript","python"])).min(1),
  executors:z.array(z.enum(["python","bubblewrap","pi"])).min(1),permissions:z.array(ScenarioPermissionSchema),budget:ScenarioBudgetSchema,capabilities:z.array(ScenarioCapabilitySchema).min(4),artifacts:z.array(ScenarioArtifactDeclarationSchema),
}).strict().superRefine((value,context)=>{for(const kind of ["data","experiment","evaluation","analysis"] as const)if(!value.capabilities.some(item=>item.kind===kind))context.addIssue({code:"custom",message:`Scenario requires a ${kind} capability`});const declared=new Set(value.permissions);for(const capability of value.capabilities)for(const permission of capability.permissions)if(!declared.has(permission))context.addIssue({code:"custom",message:`Capability ${capability.id} uses undeclared permission ${permission}`});});
export type ScenarioManifest=z.infer<typeof ScenarioManifestSchema>;

export const DataContractSchema=z.object({datasetId:z.string().min(1),manifestHash:z.string().regex(/^[a-f0-9]{64}$/),roles:z.array(z.object({role:z.enum(["train","validation","confirmation","audit"]),uri:z.string().min(1),sealed:z.boolean(),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1),experimentalUnit:z.object({kind:z.string().min(1),idField:z.string().min(1),clusterField:z.string().min(1).nullable()}).strict()}).strict();
export type DataContract=z.infer<typeof DataContractSchema>;
export const EvaluationContractSchema=z.object({metric:z.string().min(1),direction:z.enum(["maximize","minimize"]),value:z.number().finite().nullable(),missingReason:z.string().min(1).nullable(),unitId:z.string().min(1),group:z.string().min(1).nullable(),artifactHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/))}).strict().refine(value=>(value.value===null)!==(value.missingReason===null),"Exactly one of value or missingReason is required");
export type EvaluationContract=z.infer<typeof EvaluationContractSchema>;
export const AnalysisContractSchema=z.object({estimand:z.string().min(1),clusterUnit:z.string().min(1),method:z.string().min(1),estimate:z.number().finite().nullable(),interval:z.tuple([z.number().finite(),z.number().finite()]).nullable(),sensitivity:z.array(z.object({name:z.string().min(1),stable:z.boolean(),details:z.string()}).strict()),artifactHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/))}).strict();
export type AnalysisContract=z.infer<typeof AnalysisContractSchema>;

export interface ScenarioContext{workspaceId:string;projectId:string;actorId:string;approvedPermissions:readonly ScenarioPermission[];budget:z.infer<typeof ScenarioBudgetSchema>}
export interface DataAdapter{describe(input:unknown,context:ScenarioContext):Promise<DataContract>}
export interface ExperimentRunner{createJob(input:unknown,data:DataContract,context:ScenarioContext):Promise<JobSpec>}
export interface Evaluator{evaluate(input:unknown,context:ScenarioContext):Promise<EvaluationContract[]>}
export interface Analyzer{analyze(evaluations:EvaluationContract[],context:ScenarioContext):Promise<AnalysisContract>}
export interface DomainCapability{id:string;invoke(input:unknown,context:ScenarioContext):Promise<unknown>}
export interface ResearchScenario{manifest:ScenarioManifest;data:DataAdapter;experiments:ExperimentRunner;evaluator:Evaluator;analyzer:Analyzer;domainCapabilities?:DomainCapability[]}

export const ScenarioHandshakeRequestSchema=z.object({scenario:ScenarioManifestSchema,coreSchemaVersion:z.string().min(1),approvedPermissions:z.array(ScenarioPermissionSchema),availableExecutors:z.array(z.enum(["python","bubblewrap","pi"]))}).strict();
export const ScenarioHandshakeResultSchema=z.object({compatible:z.boolean(),issues:z.array(z.string()),grantedPermissions:z.array(ScenarioPermissionSchema),requiredExecutors:z.array(z.enum(["python","bubblewrap","pi"]))}).strict();
export type ScenarioHandshakeResult=z.infer<typeof ScenarioHandshakeResultSchema>;

export function negotiateScenario(input:unknown):ScenarioHandshakeResult{
  const request=ScenarioHandshakeRequestSchema.parse(input),issues:string[]=[],approved=new Set(request.approvedPermissions),requiredExecutors=[...request.scenario.executors];
  if(!satisfiesCompatibleMajor(request.coreSchemaVersion,request.scenario.coreSchemaRange))issues.push(`Core schema ${request.coreSchemaVersion} does not satisfy ${request.scenario.coreSchemaRange}`);
  for(const permission of request.scenario.permissions)if(!approved.has(permission))issues.push(`Permission ${permission} is not approved`);
  for(const executor of requiredExecutors)if(!request.availableExecutors.includes(executor))issues.push(`Executor ${executor} is unavailable`);
  return ScenarioHandshakeResultSchema.parse({compatible:issues.length===0,issues,grantedPermissions:request.scenario.permissions.filter(item=>approved.has(item)),requiredExecutors});
}

export function assertScenarioJob(manifest:ScenarioManifest,job:unknown):JobSpec{
  const parsed=JobSpecSchema.parse(job),budget=manifest.budget;if(parsed.resources.cpuCores>budget.maxCpuCores||parsed.resources.memoryMiB>budget.maxMemoryMiB||parsed.resources.diskMiB>budget.maxDiskMiB||parsed.resources.gpuCount>budget.maxGpuCount||parsed.limits.wallTimeMs>budget.maxWallTimeMs)throw new Error("Scenario Job exceeds the manifest budget");if(parsed.dataRole==="confirmation"&&!manifest.permissions.includes("confirmation"))throw new Error("Scenario lacks confirmation permission");return parsed;
}

function satisfiesCompatibleMajor(version:string,range:string):boolean{const parsed=parseVersion(version);if(!parsed)return false;if(range.startsWith("^")){const base=parseVersion(range.slice(1));return !!base&&compare(parsed,base)>=0&&(base[0]>0?parsed[0]===base[0]:base[1]>0?parsed[0]===0&&parsed[1]===base[1]:compare(parsed,base)===0);}const exact=parseVersion(range);if(exact)return compare(parsed,exact)===0;const minimum=/>=\s*(\d+\.\d+\.\d+)/.exec(range),maximum=/<\s*(\d+\.\d+\.\d+)/.exec(range),min=minimum?parseVersion(minimum[1]!):null,max=maximum?parseVersion(maximum[1]!):null;return !!(min&&max&&compare(parsed,min)>=0&&compare(parsed,max)<0);}
function parseVersion(value:string):[number,number,number]|null{const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null;}
function compare(a:[number,number,number],b:[number,number,number]):number{for(let index=0;index<3;index++){const delta=a[index]!-b[index]!;if(delta)return delta;}return 0;}
