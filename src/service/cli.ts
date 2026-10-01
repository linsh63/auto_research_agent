#!/usr/bin/env node
import { resolve } from "node:path";
import { startCoreService } from "../public/service.js";
import type { PluginPermission } from "../public/contracts.js";

const args=process.argv.slice(2),value=(name:string,fallback?:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:fallback;},databasePath=resolve(value("--database",process.env.AUTO_RESEARCH_DATABASE??".research-data/research.db")!),dataDir=resolve(value("--data-dir",process.env.AUTO_RESEARCH_SERVICE_DIR??".research-data/service")!),host=value("--host",process.env.AUTO_RESEARCH_SERVICE_HOST??"127.0.0.1")!,port=Number(value("--port",process.env.AUTO_RESEARCH_SERVICE_PORT??"0")),allowed=(value("--permissions",process.env.AUTO_RESEARCH_SERVICE_PERMISSIONS)??"").split(",").map(item=>item.trim()).filter(Boolean) as PluginPermission[];
const service=await startCoreService({databasePath,dataDir,host,port,allowRemote:args.includes("--allow-remote"),allowedPermissions:allowed.length?allowed:undefined});
console.log(JSON.stringify(service.address));
let closing=false;const close=async()=>{if(closing)return;closing=true;await service.close();process.exitCode=0;};process.on("SIGINT",()=>void close());process.on("SIGTERM",()=>void close());
