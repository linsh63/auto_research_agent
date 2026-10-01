import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { startCoreServiceImpl } from "../service/core-service.js";
import { PUBLIC_SCHEMA_VERSION, PluginPermissionSchema, type PluginPermission } from "./contracts.js";

export const CORE_SERVICE_VERSION="1.0.0" as const;
export const ServiceCapabilitiesSchema=z.object({serviceVersion:z.literal(CORE_SERVICE_VERSION),schemaVersion:z.literal(PUBLIC_SCHEMA_VERSION),transports:z.object({rest:z.literal(true),sse:z.literal(true),websocket:z.literal(false)}).strict(),endpoints:z.array(z.string()),allowedPermissions:z.array(PluginPermissionSchema),offline:z.boolean(),telemetry:z.literal(false),publicExports:z.array(z.string()),startedAt:z.string()}).strict();
export type ServiceCapabilities=z.infer<typeof ServiceCapabilitiesSchema>;

export interface ResolvedSecret{value:string;provider:string}
export interface SecretProvider{resolve(name:string,purpose:string):Promise<ResolvedSecret|null>}
export class MemorySecretProvider implements SecretProvider{constructor(private readonly values:Record<string,string>,private readonly providerName="memory"){}async resolve(name:string):Promise<ResolvedSecret|null>{const value=this.values[name];return value?{value,provider:this.providerName}:null;}}
export class EnvironmentSecretProvider implements SecretProvider{constructor(private readonly env:NodeJS.ProcessEnv=process.env){}async resolve(name:string):Promise<ResolvedSecret|null>{const value=this.env[name];return value?{value,provider:"environment"}:null;}}
export class DirectorySecretProvider implements SecretProvider{constructor(private readonly directory:string){}async resolve(name:string):Promise<ResolvedSecret|null>{if(!/^[A-Z0-9_]+$/.test(name))throw new Error("Invalid secret name");try{const value=readFileSync(join(this.directory,name),"utf8").trim();return value?{value,provider:"directory"}:null;}catch{return null;}}}
export class ChainedSecretProvider implements SecretProvider{constructor(private readonly providers:SecretProvider[]){}async resolve(name:string,purpose:string):Promise<ResolvedSecret|null>{for(const provider of this.providers){const result=await provider.resolve(name,purpose);if(result)return result;}return null;}}

export interface CoreServiceOptions{
  databasePath:string;dataDir:string;host?:string;port?:number;allowRemote?:boolean;allowedOrigins?:string[];
  allowedPermissions?:PluginPermission[];secretProvider?:SecretProvider;tokenSecretName?:string;maxBodyBytes?:number;streamPollMs?:number;artifactRoot?:string;artifactRoots?:string[];
}
export interface CoreServiceAddress{baseUrl:string;host:string;port:number;discoveryFile:string;tokenFile:string|null;tokenSecretName:string;capabilities:ServiceCapabilities}
export interface CoreServiceHandle{address:CoreServiceAddress;close():Promise<void>}
export async function startCoreService(options:CoreServiceOptions):Promise<CoreServiceHandle>{return startCoreServiceImpl(options);}
